// ============================================================================
// Mock OIDC provider — emulates the JubileeInspire identity provider for local
// development ONLY. Implements the slice of OpenID Connect that Jubilujah
// uses: discovery, JWKS, Authorization Code + PKCE, token, and userinfo.
//
// The seed users below model the *shared* JubileeInspire account store: the same
// subjects/emails exist in identity.users (DB seed), so "same credentials across
// both platforms" is demonstrable. In production this whole service is replaced
// by api.JubileeInspire.com — Jubilujah only changes OIDC_* env values.
// ============================================================================
import express from 'express';
import crypto from 'node:crypto';
import {
  generateKeyPair, exportJWK, SignJWT, calculateJwkThumbprint,
} from 'jose';

const PORT = process.env.MOCK_OIDC_PORT || 4010;
const ISSUER = process.env.MOCK_OIDC_ISSUER || `http://localhost:${PORT}`;
const CLIENT_ID = process.env.OIDC_CLIENT_ID || 'jubilujah-web';
const CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || 'jubilujah-dev-secret';

// ---- Seed accounts (mirror identity.users) ---------------------------------
// roles drive RBAC sync on the Jubilujah side.
const USERS = {
  gabriel: {
    sub: 'jubileeinspire|gabriel.ungureanu',
    email: 'eagle01@eaglesquest.org',
    name: 'Gabriel Ungureanu',
    roles: ['admin', 'production_manager', 'radio_producer', 'content_editor'],
  },
  editor: {
    sub: 'jubileeinspire|editor.demo',
    email: 'editor.demo@jubileeinspire.com',
    name: 'Demo Editor',
    roles: ['content_editor', 'radio_producer'],
  },
  viewer: {
    sub: 'jubileeinspire|viewer.demo',
    email: 'viewer.demo@jubileeinspire.com',
    name: 'Demo Viewer',
    roles: ['viewer'],
  },
};

// In-memory authorization-code store: code -> { user, challenge, ...req }
const CODES = new Map();
const ACCESS = new Map(); // access_token -> user

// ---- Key material ----------------------------------------------------------
const { publicKey, privateKey } = await generateKeyPair('RS256');
const publicJwk = await exportJWK(publicKey);
publicJwk.use = 'sig';
publicJwk.alg = 'RS256';
publicJwk.kid = await calculateJwkThumbprint(publicJwk);

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---- Discovery -------------------------------------------------------------
app.get('/.well-known/openid-configuration', (req, res) => {
  res.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
    userinfo_endpoint: `${ISSUER}/userinfo`,
    jwks_uri: `${ISSUER}/jwks`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'profile', 'email', 'roles'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    claims_supported: ['sub', 'email', 'name', 'roles'],
  });
});

app.get('/jwks', (req, res) => {
  res.json({ keys: [publicJwk] });
});

// ---- Authorization endpoint (renders a dev account chooser) ----------------
app.get('/authorize', (req, res) => {
  const { client_id, redirect_uri, state, code_challenge, scope } = req.query;
  if (client_id !== CLIENT_ID) {
    return res.status(400).send('Unknown client_id');
  }
  const buttons = Object.entries(USERS).map(([key, u]) => `
    <form method="POST" action="/authorize" style="margin:0">
      <input type="hidden" name="account" value="${key}">
      <input type="hidden" name="redirect_uri" value="${redirect_uri || ''}">
      <input type="hidden" name="state" value="${state || ''}">
      <input type="hidden" name="code_challenge" value="${code_challenge || ''}">
      <input type="hidden" name="scope" value="${scope || ''}">
      <button type="submit" class="acct">
        <span class="nm">${u.name}</span>
        <span class="rl">${u.roles.join(' · ')}</span>
        <span class="em">${u.email}</span>
      </button>
    </form>`).join('');

  res.send(`<!doctype html><html><head><meta charset="utf-8">
    <title>JubileeInspire SSO (dev)</title>
    <style>
      body{font-family:'Segoe UI',sans-serif;background:#0c1226;color:#f0ebe3;margin:0;
        display:flex;min-height:100vh;align-items:center;justify-content:center}
      .card{background:#1d2745;border:1px solid #2a3454;border-radius:16px;padding:36px;max-width:440px;width:100%}
      h1{font-size:20px;margin:0 0 4px;background:linear-gradient(135deg,#e94560,#feca57);
        -webkit-background-clip:text;-webkit-text-fill-color:transparent}
      p{color:#b0b4cc;font-size:13px;margin:0 0 22px}
      .acct{display:block;width:100%;text-align:left;background:#243355;border:1px solid #2a3454;
        border-radius:10px;padding:14px 16px;margin-bottom:10px;color:#f0ebe3;cursor:pointer;transition:.15s}
      .acct:hover{border-color:#e94560;background:#2d3e64}
      .nm{display:block;font-weight:700;font-size:15px}
      .rl{display:block;font-size:11px;color:#feca57;margin-top:2px}
      .em{display:block;font-size:11px;color:#6c7494;margin-top:2px}
      .note{font-size:11px;color:#6c7494;margin-top:14px;text-align:center}
    </style></head><body>
    <div class="card">
      <h1>JubileeInspire SSO</h1>
      <p>Development identity provider — choose an account to sign in to Jubilujah.</p>
      ${buttons}
      <div class="note">Mock provider. In production this is api.JubileeInspire.com.</div>
    </div></body></html>`);
});

app.post('/authorize', (req, res) => {
  const { account, redirect_uri, state, code_challenge, scope } = req.body;
  const user = USERS[account];
  if (!user) return res.status(400).send('Unknown account');
  const code = crypto.randomBytes(24).toString('hex');
  CODES.set(code, { user, code_challenge, scope, redirect_uri, createdAt: Date.now() });
  const url = new URL(redirect_uri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  res.redirect(url.toString());
});

// ---- Token endpoint --------------------------------------------------------
function clientCredsOk(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Basic ')) {
    const [id, secret] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
    return id === CLIENT_ID && secret === CLIENT_SECRET;
  }
  return req.body.client_id === CLIENT_ID && req.body.client_secret === CLIENT_SECRET;
}

app.post('/token', async (req, res) => {
  const { grant_type, code, code_verifier } = req.body;
  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }
  if (!clientCredsOk(req)) {
    return res.status(401).json({ error: 'invalid_client' });
  }
  const entry = CODES.get(code);
  if (!entry) return res.status(400).json({ error: 'invalid_grant' });
  CODES.delete(code);

  // PKCE verification (S256).
  if (entry.code_challenge) {
    const hash = crypto.createHash('sha256').update(code_verifier || '').digest('base64url');
    if (hash !== entry.code_challenge) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE failed' });
    }
  }

  const u = entry.user;
  const now = Math.floor(Date.now() / 1000);
  const idToken = await new SignJWT({
    email: u.email,
    email_verified: true,
    name: u.name,
    roles: u.roles,
  })
    .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
    .setIssuer(ISSUER)
    .setSubject(u.sub)
    .setAudience(CLIENT_ID)
    .setIssuedAt(now)
    .setExpirationTime('1h')
    .sign(privateKey);

  const accessToken = crypto.randomBytes(24).toString('hex');
  ACCESS.set(accessToken, u);

  res.json({
    access_token: accessToken,
    id_token: idToken,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: entry.scope || 'openid profile email roles',
  });
});

// ---- Userinfo --------------------------------------------------------------
app.get('/userinfo', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const u = token && ACCESS.get(token);
  if (!u) return res.status(401).json({ error: 'invalid_token' });
  res.json({ sub: u.sub, email: u.email, name: u.name, roles: u.roles });
});

app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'mock-oidc' }));

app.listen(PORT, () => {
  console.log(`[mock-oidc] JubileeInspire dev IdP on ${ISSUER}`);
});
