#!/usr/bin/env bash
# ============================================================================
# JubileePraise backend release → api.jubileepraise.com          (2026-09-17)
#
# Ships app/api (the rebranded backend), stands up the `jubileepraise`
# database (a clone of `jubilujah`), rewrites the production .env with the
# JubileePraise credentials, registers JubileePraise's own client at the SSO,
# gives api.jubileepraise.com an nginx vhost, restarts the API and verifies.
# The web app (jubilujah-web, :3030) is NOT touched — backend only.
#
# Production facts (PUBLISH.md, re-verified by the `inspect` phase):
#   host  root@94.72.120.231   code /var/www/jubilujah.com   pm2 jubilujah-api (:4030)
#   SSO   root@66.94.114.192   /home/gabe/ji-sso-prod        systemd ji-sso-prod
#
# Usage (Git Bash, from the repo root):
#   deploy/release-api.sh inspect            # READ-ONLY: layout, diff prod api/src vs repo, env keys, nginx, DNS
#   deploy/release-api.sh sso                # register the `jubileepraise` service client at the SSO
#   deploy/release-api.sh backup             # api/src + .env + pg_dump of jubilujah → /var/www/.backup
#   deploy/release-api.sh db                 # clone jubilujah → jubileepraise on the VPS (+ migration 0035)
#   deploy/release-api.sh ship               # api/src, api/package.json, db/ → prod; npm install
#   deploy/release-api.sh env                # patch /var/www/jubilujah.com/.env (backup taken first)
#   deploy/release-api.sh nginx              # vhost api.jubileepraise.com → 127.0.0.1:4030
#   deploy/release-api.sh restart            # pm2 restart jubilujah-api --update-env, poll /health
#   deploy/release-api.sh verify             # live probes: health, SSO, email transport, QR chain
#   deploy/release-api.sh ssoflip            # AFTER 'sso': swap the API onto the jubileepraise client + restart
#   deploy/release-api.sh all                # backup db ship env nginx restart verify (SSO phases run separately)
#
# Every write phase refuses to run without --confirm.  Rollback is printed at
# the end of `backup` and again by `verify`.
# ============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$ROOT/app"
KEY="${PROD_SSH_KEY:-$HOME/.ssh/id_ed25519_jubilee_prod}"
SSH="ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20"
PROD="root@94.72.120.231"
SSO_HOST="root@66.94.114.192"
PDIR="/var/www/jubilujah.com"
BK="/var/www/.backup"
TS="${RELEASE_TS:-$(date +%Y%m%d-%H%M%S)}"
SCRATCH="${SCRATCH:-/w/.claude-scratch/jp-backend/release-$TS}"
CLIENT_JSON="${SSO_CLIENT_JSON:-W:/.claude-scratch/jp-backend/sso-client.json}"
DB_PW_FILE="${DB_PW_FILE:-W:/.claude-scratch/jp-backend/prod-db-password.txt}"
CONFIRM=0
PHASES=()
for a in "$@"; do case "$a" in --confirm) CONFIRM=1 ;; *) PHASES+=("$a") ;; esac; done
[ ${#PHASES[@]} -eq 0 ] && { sed -n '2,32p' "$0"; exit 2; }
[ "${PHASES[0]}" = "all" ] && PHASES=(backup db ship env nginx restart verify)
mkdir -p "$SCRATCH"

say()  { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
die()  { echo "✖ $*" >&2; exit 1; }
need_confirm() { [ "$CONFIRM" = 1 ] || die "phase '$1' writes to production — re-run with --confirm"; }
envval() { grep -E "^$1=" "$APP/.env" | head -1 | cut -d= -f2-; }   # value from app/.env

# ---------------------------------------------------------------------------
phase_inspect() {
  say "inspect: prod layout (read-only)"
  $SSH $PROD "hostname; uptime | sed 's/.*load/load/'; echo; pm2 ls | grep -E 'jubilujah|jubileepraise' ; echo;
    echo '-- code dir'; ls $PDIR; echo; ls $PDIR/api; echo;
    echo '-- package.json files'; ls $PDIR/package.json $PDIR/api/package.json $PDIR/db 2>&1 | head; echo;
    echo '-- node_modules owner'; ls -d $PDIR/node_modules $PDIR/api/node_modules 2>&1; ls $PDIR/node_modules/nodemailer 2>&1 | head -2; echo;
    echo '-- .env keys (names only)'; sed -nE 's/^([A-Z0-9_]+)=.*/\1/p' $PDIR/.env | tr '\n' ' '; echo; echo;
    echo '-- .env brand/db/sso values'; grep -E '^(DATABASE_URL|SSO_CLIENT_ID|SSO_SITE|JI_LOGIN_SOURCE|MAILGUN_DOMAIN|EMAIL_FROM|WEB_BASE_URL|REDIRECTOR_BASE_URL|CORS_ORIGIN|NODE_ENV|API_PORT|AUTH_LOGIN_MODE|EMAIL_PROVIDER)=' $PDIR/.env | sed -E 's#(://[^:]+:)[^@]*@#\1…@#'; echo;
    echo '-- nginx vhosts for the brand'; grep -l -E 'jubileepraise|jubilujah' /etc/nginx/sites-enabled/* ; grep -rn 'server_name' /etc/nginx/sites-enabled/jubileepraise.com /etc/nginx/sites-enabled/jubilujah.com 2>/dev/null; grep -rln 'api\.jubileepraise' /etc/nginx/sites-enabled/ 2>/dev/null || echo '(no vhost names api.jubileepraise.com)'; echo;
    echo '-- TLS in the jubileepraise vhost'; grep -n 'ssl_certificate\|listen' /etc/nginx/sites-enabled/jubileepraise.com 2>/dev/null; echo;
    echo '-- postgres'; sudo -u postgres psql -Atc \"select version()\" | cut -c1-40; sudo -u postgres psql -Atc \"select datname, pg_size_pretty(pg_database_size(datname)) from pg_database where datname in ('jubilujah','jubileepraise')\"; sudo -u postgres psql -Atc \"select rolname from pg_roles where rolname in ('jubilujah_app','jubileepraise_app')\"; echo;
    echo '-- health'; curl -s localhost:4030/health; echo"
  say "inspect: prod api/src vs repo (what prod has that the repo does not)"
  rm -rf "$SCRATCH/prod-api" && mkdir -p "$SCRATCH/prod-api"
  $SSH $PROD "cd $PDIR && tar czf - api/src api/package.json" | tar xzf - -C "$SCRATCH/prod-api"
  diff -rq "$SCRATCH/prod-api/api/src" "$APP/api/src" | sed "s#$SCRATCH/prod-api/##; s#$APP/##" | sort > "$SCRATCH/api-src.diff-list"
  echo "files differing / only on one side: $(wc -l < "$SCRATCH/api-src.diff-list")  (list: $SCRATCH/api-src.diff-list)"
  cat "$SCRATCH/api-src.diff-list"
  diff -ru "$SCRATCH/prod-api/api/src" "$APP/api/src" > "$SCRATCH/api-src.diff" 2>/dev/null
  echo "full unified diff: $SCRATCH/api-src.diff ($(wc -l < "$SCRATCH/api-src.diff") lines) — read it before 'ship'"
  say "inspect: DNS + edge for api.jubileepraise.com"
  nslookup api.jubileepraise.com 2>/dev/null | tail -4
  curl -s -o /dev/null -w "https://api.jubileepraise.com/health -> %{http_code}\n" https://api.jubileepraise.com/health
  say "inspect: SSO box (read-only)"
  $SSH $SSO_HOST "hostname; ls /home/gabe/ji-sso-prod | head -30; echo; systemctl is-active ji-sso-prod;
    echo '-- how service clients are registered'; grep -rn -i 'service_clients\|SERVICE_CLIENTS\|client_secret' /home/gabe/ji-sso-prod --include=*.js --include=*.mjs --include=*.sql -l 2>/dev/null | grep -v node_modules | head;
    echo '-- .env keys (names only)'; sed -nE 's/^([A-Z0-9_]+)=.*/\1/p' /home/gabe/ji-sso-prod/.env | tr '\n' ' '; echo" \
    || echo "(no SSH access to the SSO box with $KEY — register the client from a machine that has it; see phase 'sso')"
}

# ---------------------------------------------------------------------------
phase_sso() {
  need_confirm sso
  say "sso: register client 'jubileepraise' at sso.jubileeinspire.com"
  [ -f "$CLIENT_JSON" ] || die "missing $CLIENT_JSON (generated pair)"
  local ID SECRET
  ID=$(node -e "console.log(require('$CLIENT_JSON').client_id)")
  SECRET=$(node -e "console.log(require('$CLIENT_JSON').client_secret)")
  # Already registered? A 200 from /service/token is the only proof.
  local code
  code=$(curl -s -o "$SCRATCH/sso-token.json" -w '%{http_code}' -X POST https://sso.jubileeinspire.com/api/auth/service/token \
           -H 'content-type: application/json' -d "{\"client_id\":\"$ID\",\"client_secret\":\"$SECRET\"}")
  if [ "$code" = "200" ]; then echo "already registered: /service/token -> 200"; return 0; fi
  echo "/service/token -> $code (not registered yet)"
  # The SSO's registry lives on the box; the `inspect` phase shows whether it is an
  # env map or a table. Both forms are handled here; whichever exists is used.
  $SSH $SSO_HOST "set -e; cd /home/gabe/ji-sso-prod; cp -p .env .env.bak-jubileepraise-client-$TS;
    if grep -q '^SSO_SERVICE_CLIENTS=' .env; then
      node -e '
        const fs=require(\"fs\"); let s=fs.readFileSync(\".env\",\"utf8\");
        s=s.replace(/^SSO_SERVICE_CLIENTS=(.*)$/m,(m,v)=>{ let j; try{ j=JSON.parse(v); }catch{ j=null; }
          if (j && typeof j===\"object\" && !Array.isArray(j)) { j[\"$ID\"]=\"$SECRET\"; return \"SSO_SERVICE_CLIENTS=\"+JSON.stringify(j); }
          return \"SSO_SERVICE_CLIENTS=\"+v.replace(/,?\s*$/,\"\")+\",$ID:$SECRET\"; });
        fs.writeFileSync(\".env\",s);'
      echo 'added to SSO_SERVICE_CLIENTS in .env'
    else
      echo 'SSO_SERVICE_CLIENTS not in .env — use scripts/add-clients.js on the box' ; exit 3
    fi
    systemctl restart ji-sso-prod; sleep 2; systemctl is-active ji-sso-prod"
  code=$(curl -s -o "$SCRATCH/sso-token.json" -w '%{http_code}' -X POST https://sso.jubileeinspire.com/api/auth/service/token \
           -H 'content-type: application/json' -d "{\"client_id\":\"$ID\",\"client_secret\":\"$SECRET\"}")
  [ "$code" = "200" ] || die "registration did not take: /service/token -> $code"
  echo "✔ registered: /service/token -> 200"
}

# ---------------------------------------------------------------------------
phase_backup() {
  need_confirm backup
  say "backup: api/src, .env, pg_dump jubilujah → $BK (ts $TS)"
  $SSH $PROD "set -e; mkdir -p $BK; cd $PDIR;
    tar czf $BK/jubilujah-api-src-$TS.tgz api/src api/package.json;
    cp -p .env $BK/env.bak-$TS;
    sudo -u postgres pg_dump -Fc jubilujah > $BK/jubilujah-$TS.dump;
    ls -la $BK/jubilujah-api-src-$TS.tgz $BK/env.bak-$TS $BK/jubilujah-$TS.dump"
  echo "rollback (api):  $SSH $PROD \"tar xzf $BK/jubilujah-api-src-$TS.tgz -C $PDIR && cp -p $BK/env.bak-$TS $PDIR/.env && pm2 restart jubilujah-api --update-env\""
}

# ---------------------------------------------------------------------------
phase_db() {
  need_confirm db
  say "db: clone jubilujah → jubileepraise on the VPS"
  if [ ! -f "$DB_PW_FILE" ]; then
    node -e "require('fs').writeFileSync('$DB_PW_FILE', require('crypto').randomBytes(24).toString('base64url'))"
    echo "generated role password → $DB_PW_FILE"
  fi
  local PW; PW=$(cat "$DB_PW_FILE")
  $SSH $PROD "mkdir -p $PDIR/db/migrations"
  scp -q -i "$KEY" -o IdentitiesOnly=yes "$APP/db/clone-jubilujah.sh" "$PROD:$PDIR/db/clone-jubilujah.sh"
  scp -q -i "$KEY" -o IdentitiesOnly=yes "$APP/db/migrations/0035_jubileepraise_rebrand.sql" "$PROD:$PDIR/db/migrations/"
  $SSH $PROD "cd $PDIR && sudo -u postgres bash db/clone-jubilujah.sh --password '$PW' ${DB_FORCE:+--force}"
}

# ---------------------------------------------------------------------------
phase_ship() {
  need_confirm ship
  say "ship: app/api/src + api/package.json + db/ → $PDIR"
  ( cd "$APP" && tar czf "$SCRATCH/api-release.tgz" api/src api/package.json db/migrations db/run-migrations.js db/clone-jubilujah.sh )
  ls -la "$SCRATCH/api-release.tgz"
  scp -q -i "$KEY" -o IdentitiesOnly=yes "$SCRATCH/api-release.tgz" "$PROD:/tmp/api-release-$TS.tgz"
  $SSH $PROD "set -e; cd $PDIR; tar xzf /tmp/api-release-$TS.tgz; rm -f /tmp/api-release-$TS.tgz;
    echo '-- nodemailer (new dependency; zero deps of its own)';
    # Placed directly into the shared root node_modules from the registry tarball.
    # A workspace-wide npm install here would reconcile web/ and mock-oidc/ too,
    # under a running Next.js process — not something a backend release should do.
    if [ ! -f node_modules/nodemailer/package.json ]; then
      (cd /tmp && npm pack nodemailer@6.10.1 --pack-destination /tmp >/dev/null 2>&1) && mkdir -p node_modules/nodemailer && tar xzf /tmp/nodemailer-6.10.1.tgz -C node_modules/nodemailer --strip-components=1 && rm -f /tmp/nodemailer-6.10.1.tgz;
    fi;
    node -e 'console.log(\"nodemailer\", require(\"/var/www/jubilujah.com/node_modules/nodemailer/package.json\").version)';
    node --check api/src/index.js && echo 'api/src/index.js parses'"
}

# ---------------------------------------------------------------------------
phase_env() {
  need_confirm env
  say "env: patch $PDIR/.env"
  [ -f "$DB_PW_FILE" ] || die "missing $DB_PW_FILE — run the db phase first"
  local PW
  PW=$(cat "$DB_PW_FILE")
  # Values come from app/.env (already verified live from the workstation). The
  # SSO client is NOT in this patch: the API keeps using the registered `jubilujah`
  # client until phase 'sso' has registered `jubileepraise`; 'ssoflip' then swaps it.
  cat > "$SCRATCH/env-patch.txt" <<EOF
DATABASE_URL=postgres://jubileepraise_app:$PW@localhost:5432/jubileepraise
PGSSLMODE=disable
TURNSTILE_SITE_KEY=$(envval TURNSTILE_SITE_KEY)
TURNSTILE_SECRET_KEY=$(envval TURNSTILE_SECRET_KEY)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=$(envval NEXT_PUBLIC_TURNSTILE_SITE_KEY)
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=$(envval MAILGUN_API_KEY)
MAILGUN_DOMAIN=jubileepraise.com
EMAIL_FROM=JubileePraise <noreply@jubileepraise.com>
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=$(envval SMTP_USER)
SMTP_PASS=$(envval SMTP_PASS)
WEB_BASE_URL=https://www.jubileepraise.com
REDIRECTOR_BASE_URL=https://www.jubileepraise.com
EOF
  scp -q -i "$KEY" -o IdentitiesOnly=yes "$SCRATCH/env-patch.txt" "$PROD:/tmp/env-patch-$TS.txt"
  # Set-or-append each key; keeps every other line (R2_*, STRIPE_*, JWT_SECRET, CORS_ORIGIN, ...).
  $SSH $PROD "set -e; cd $PDIR; cp -p .env $BK/env.bak-$TS-pre-env-phase;
    while IFS= read -r line; do k=\${line%%=*}; v=\${line#*=};
      if grep -q \"^\$k=\" .env; then awk -v k=\"\$k\" -v v=\"\$v\" 'BEGIN{FS=OFS=\"=\"} \$1==k{print k\"=\"v; next} {print}' .env > .env.tmp && mv .env.tmp .env;
      else printf '%s\n' \"\$line\" >> .env; fi; done < /tmp/env-patch-$TS.txt; rm -f /tmp/env-patch-$TS.txt;
    echo '-- resulting brand/db/sso lines'; grep -E '^(DATABASE_URL|SSO_CLIENT_ID|SSO_SITE|MAILGUN_DOMAIN|EMAIL_PROVIDER|EMAIL_FROM|SMTP_HOST|SMTP_USER|WEB_BASE_URL|REDIRECTOR_BASE_URL|CORS_ORIGIN)=' .env | sed -E 's#(://[^:]+:)[^@]*@#\1…@#'"
  rm -f "$SCRATCH/env-patch.txt"
}

# ---------------------------------------------------------------------------
phase_ssoflip() {
  need_confirm ssoflip
  say "ssoflip: switch the API to the jubileepraise SSO client (registered by phase 'sso')"
  local ID SECRET code
  ID=$(node -e "console.log(require('$CLIENT_JSON').client_id)")
  SECRET=$(node -e "console.log(require('$CLIENT_JSON').client_secret)")
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST https://sso.jubileeinspire.com/api/auth/service/token -H 'content-type: application/json' -d "{\"client_id\":\"$ID\",\"client_secret\":\"$SECRET\"}")
  [ "$code" = "200" ] || die "client '$ID' is not registered at the SSO yet (/service/token -> $code) — run phase 'sso' first; the API stays on the old client"
  $SSH $PROD "set -e; cd $PDIR; cp -p .env $BK/env.bak-$TS-pre-ssoflip;
    for kv in 'SSO_API_BASE=https://sso.jubileeinspire.com' 'SSO_CLIENT_ID=$ID' 'SSO_CLIENT_SECRET=$SECRET' 'SSO_SITE=jubileepraise'; do k=\${kv%%=*}; v=\${kv#*=};
      if grep -q \"^\$k=\" .env; then awk -v k=\"\$k\" -v v=\"\$v\" 'BEGIN{FS=OFS=\"=\"} \$1==k{print k\"=\"v; next} {print}' .env > .env.tmp && mv .env.tmp .env; else printf '%s\n' \"\$kv\" >> .env; fi; done;
    grep -E '^(SSO_CLIENT_ID|SSO_SITE)=' .env"
  phase_restart
  echo "-- sign-in path through the new client:"; curl -s -m 20 -w '  lookup [%{http_code}]\n' "https://api.jubileepraise.com/api/auth/lookup?email=nobody-$TS@example.invalid"
}

# ---------------------------------------------------------------------------
phase_nginx() {
  need_confirm nginx
  say "nginx: vhost api.jubileepraise.com → 127.0.0.1:4030"
  # Modelled on the existing api.jubilujah.com vhost. The origin certs in
  # /etc/ssl/cloudflare are self-signed per host (Cloudflare fronts every zone in
  # Full mode), and jubileepraise.com's covers only apex + www — so this host gets
  # its own, exactly as api.torahsings.com did. The API answers every path itself:
  # no /api/ split, no Next.js upstream.
  $SSH $PROD "set -e;
    if [ -f /etc/nginx/sites-enabled/api.jubileepraise.com ]; then echo 'vhost exists'; cat /etc/nginx/sites-enabled/api.jubileepraise.com; exit 0; fi
    CERT=/etc/ssl/cloudflare/api.jubileepraise.com.crt; CKEY=/etc/ssl/cloudflare/api.jubileepraise.com.key
    if [ ! -f \$CERT ]; then
      openssl req -x509 -nodes -newkey rsa:2048 -days 3650 -keyout \$CKEY -out \$CERT -subj '/CN=api.jubileepraise.com' -addext 'subjectAltName=DNS:api.jubileepraise.com' 2>/dev/null
      chmod 600 \$CKEY; echo \"self-signed origin cert: \$CERT\"; openssl x509 -in \$CERT -noout -ext subjectAltName -enddate | tr -s ' \n' ' '; echo
    fi
    cat > /etc/nginx/sites-available/api.jubileepraise.com <<NG
# api.jubileepraise.com — the JubileePraise backend (pm2 jubilujah-api, :4030).
# Added $TS by deploy/release-api.sh, modelled on api.jubilujah.com. Cloudflare-
# proxied (Full mode); the origin cert is self-signed for this host like the others.
server {
    listen 80;
    listen [::]:80;
    server_name api.jubileepraise.com;
    return 301 https://\\\$host\\\$request_uri;
}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.jubileepraise.com;
    ssl_certificate     \$CERT;
    ssl_certificate_key \$CKEY;
    access_log /var/log/nginx/api.jubileepraise.com_access.log;
    error_log  /var/log/nginx/api.jubileepraise.com_error.log;
    client_max_body_size 25m;
    location / {
        proxy_pass http://127.0.0.1:4030;
        proxy_http_version 1.1;
        proxy_set_header Host              \\\$host;
        proxy_set_header X-Real-IP         \\\$remote_addr;
        proxy_set_header X-Forwarded-For   \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_read_timeout 300s;
    }
}
NG
    ln -sf /etc/nginx/sites-available/api.jubileepraise.com /etc/nginx/sites-enabled/api.jubileepraise.com
    nginx -t && systemctl reload nginx && echo 'nginx reloaded'"
}

# ---------------------------------------------------------------------------
phase_restart() {
  need_confirm restart
  say "restart: pm2 restart jubilujah-api --update-env"
  # No set -e and every curl || true: the poll must keep running while the new
  # process boots (PUBLISH.md, 2026-09-16 deploy-script trap).
  $SSH $PROD "cd $PDIR; pm2 restart jubilujah-api --update-env || pm2 start jubilujah-api; pm2 save >/dev/null 2>&1;
    for i in \$(seq 1 40); do h=\$(curl -s -m 3 localhost:4030/health || true); case \"\$h\" in *healthy*) echo \"health after \${i}x3s: \$h\"; break;; esac; sleep 3; done;
    pm2 ls | grep -E 'jubilujah-api'; pm2 logs jubilujah-api --lines 15 --nostream 2>/dev/null | tail -15"
}

# ---------------------------------------------------------------------------
phase_verify() {
  say "verify: live probes"
  local ID SECRET
  ID=$(node -e "console.log(require('$CLIENT_JSON').client_id)")
  SECRET=$(node -e "console.log(require('$CLIENT_JSON').client_secret)")
  echo "-- api.jubileepraise.com/health"; curl -s -m 15 -w '  [%{http_code}]\n' https://api.jubileepraise.com/health
  echo "-- www.jubileepraise.com/api/health (via the site vhost)"; curl -s -m 15 -o /dev/null -w '  [%{http_code}] (404 = route not mounted under /api, expected)\n' https://www.jubileepraise.com/api/health
  echo "-- SSO client token"; curl -s -m 15 -o /dev/null -w '  POST sso /api/auth/service/token as '"$ID"' -> [%{http_code}]\n' -X POST https://sso.jubileeinspire.com/api/auth/service/token -H 'content-type: application/json' -d "{\"client_id\":\"$ID\",\"client_secret\":\"$SECRET\"}"
  echo "-- SSO lookup through the API (proves the API's client works)"; curl -s -m 20 -w '  [%{http_code}]\n' "https://api.jubileepraise.com/api/auth/lookup?email=nobody-$TS@example.invalid"
  echo "-- Turnstile + email transport as the API sees them"; $SSH $PROD "cd $PDIR/api && NODE_ENV=test node --input-type=module -e \"const {config}=await import('./src/config.js'); console.log('  provider', config.email.provider||'(auto)', '| mailgun', Boolean(config.email.mailgun.apiKey), '| smtp', Boolean(config.email.smtp.pass), '| turnstile secret', Boolean(config.turnstile.secret), '| sso', config.sso.clientId+'/'+config.sso.site, '| db', config.databaseUrl.replace(/:\\/\\/[^@]*@/,'://…@'))\""
  echo "-- DB: the API is on jubileepraise"; $SSH $PROD "sudo -u postgres psql -Atc \"select datname||' '||count(*)||' connection(s)' from pg_stat_activity where usename in ('jubileepraise_app','jubilujah_app') group by datname\""
  echo "-- QR chain";
  local tok
  tok=$($SSH $PROD "sudo -u postgres psql -d jubileepraise -Atc \"select token from redirector.tokens where state='active' and resolution_mode='asset' order by resolve_count desc limit 1\"")
  if [ -n "$tok" ]; then
    curl -s -m 15 -o "$SCRATCH/qr.svg" -w "  GET api/redirector/qr/$tok.svg -> [%{http_code}] %{content_type}\n" "https://api.jubileepraise.com/api/redirector/qr/$tok.svg"
    curl -s -m 15 -o /dev/null -w "  GET www.jubileepraise.com/r/$tok -> [%{http_code}] -> %{redirect_url}\n" "https://www.jubileepraise.com/r/$tok"
    node -e "
      const fs=require('fs'); const svg=fs.readFileSync('$SCRATCH/qr.svg','utf8'); console.log('  svg bytes', svg.length, svg.startsWith('<svg')||svg.includes('<svg')?'(svg ok)':'(NOT svg)');" 2>/dev/null
    $SSH $PROD "cd $PDIR/api && NODE_ENV=test node --input-type=module -e \"const {tokenPayload}=await import('./src/redirector/qr/payload.js'); console.log('  payload encoded in new QR renders:', tokenPayload('$tok'))\""
  else echo "  (no active asset token in redirector.tokens to probe)"; fi
  echo; echo "rollback (api+env): $SSH $PROD \"tar xzf $BK/jubilujah-api-src-$TS.tgz -C $PDIR && cp -p $BK/env.bak-$TS $PDIR/.env && pm2 restart jubilujah-api --update-env\"   (jubilujah DB was never modified)"
}

for p in "${PHASES[@]}"; do
  case "$p" in
    inspect|sso|ssoflip|backup|db|ship|env|nginx|restart|verify) "phase_$p" || die "phase $p failed" ;;
    *) die "unknown phase: $p" ;;
  esac
done
echo; echo "done: ${PHASES[*]}  (ts $TS, scratch $SCRATCH)"
