#!/usr/bin/env node
// Carry a conversation between the machines that share this workspace.
//
// ── The problem this exists for ─────────────────────────────────────────────
// W:\JubileePraise.com is a network share. The conversation journal lives on it
// (.claude/sessions/) so it sees every session held in this workspace, from any
// machine. The transcripts that `/resume` actually replays do NOT live on it —
// Claude Code keeps them per-user, under C:\Users\<user>\.claude\projects\<slug>.
//
// So the journal can point at a conversation that this machine cannot open.
// Measured 2026-08-24: 17 conversations journaled, 16 transcripts present here,
// and the 67-turn session of 2026-08-19→21 held under the gabriel.inspire
// profile was a dead link — journaled in full, unopenable from this machine.
//
// ── What this does about it ─────────────────────────────────────────────────
// A shared vault at .claude/sessions/transcripts/ on W:, and two directions:
//
//   push   this machine's local store  →  the vault      (make a thread portable)
//   pull   the vault  →  this machine's local store      (make a thread openable)
//
// After a pull, `claude --resume <id>` and the /resume picker find the
// conversation exactly as if it had been held here.
//
// ── 🔴 Read this before you push ────────────────────────────────────────────
// A transcript is the WHOLE conversation: every file read, every command run,
// every value printed. If a secret was ever echoed into a session — a .env, a
// database password, an R2 or Stripe key — it is in that transcript verbatim.
// Pushing copies it onto a drive that everyone with W: access can read.
//
// That is why nothing here is automatic and no hook calls it. Pushing is a
// deliberate act, `push --all` needs `--confirm`, and the vault is gitignored so
// it can never reach the repo. If you want the whole history portable, that is a
// fine answer — but it should be a decision, not a default.
//
//   node .claude/tools/transcripts.mjs list
//   node .claude/tools/transcripts.mjs push <id> [<id>…]
//   node .claude/tools/transcripts.mjs push --all --confirm
//   node .claude/tools/transcripts.mjs pull <id> [<id>…] | --all
//   node .claude/tools/transcripts.mjs stamp        (fill in missing "held on")
//
// Flags:  --dry-run   say what would happen, change nothing
//         --force     on pull, overwrite a local transcript that has diverged
//
// Overrides: CLAUDE_TRANSCRIPT_DIR (local store), JUBILEEPRAISE_TRANSCRIPT_VAULT.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith('-')) || 'list';
const ids = argv.filter((a) => !a.startsWith('-') && a !== cmd);
const ALL = argv.includes('--all');
const CONFIRM = argv.includes('--confirm');
const DRY = argv.includes('--dry-run');
const FORCE = argv.includes('--force');

const PROJECT_DIR = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, '/').replace(/\/+$/, '');
const SESSIONS_DIR = path.join(PROJECT_DIR, '.claude', 'sessions');

// Claude Code slugifies the project path into its own store:
// w:/JubileePraise.com → w--JubileePraise-com  (drive colon, separators and dots → dashes)
const slug = PROJECT_DIR.replace(/[/\\:.]/g, '-');
const STORE =
  process.env.CLAUDE_TRANSCRIPT_DIR || path.join(os.homedir(), '.claude', 'projects', slug);
const VAULT = process.env.JUBILEEPRAISE_TRANSCRIPT_VAULT || path.join(SESSIONS_DIR, 'transcripts');

const HERE = (() => {
  try {
    return os.hostname() || '';
  } catch {
    return '';
  }
})();

// ── helpers ─────────────────────────────────────────────────────────────────

const size = (f) => {
  try {
    return fs.statSync(f).size;
  } catch {
    return -1;
  }
};

const mb = (n) => (n < 0 ? '—' : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

// sha256 of the first `bytes` of a file (whole file when bytes is null).
function digest(file, bytes = null) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(1 << 20);
    let read = 0;
    for (;;) {
      const want = bytes === null ? buf.length : Math.min(buf.length, bytes - read);
      if (want <= 0) break;
      const n = fs.readSync(fd, buf, 0, want, read);
      if (n <= 0) break;
      h.update(buf.subarray(0, n));
      read += n;
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

function appendFrom(src, dst, offset) {
  const inFd = fs.openSync(src, 'r');
  const outFd = fs.openSync(dst, 'a');
  try {
    const buf = Buffer.alloc(1 << 20);
    let pos = offset;
    for (;;) {
      const n = fs.readSync(inFd, buf, 0, buf.length, pos);
      if (n <= 0) break;
      fs.writeSync(outFd, buf, 0, n);
      pos += n;
    }
  } finally {
    fs.closeSync(inFd);
    fs.closeSync(outFd);
  }
}

// Transcripts are append-only JSONL, so the common case is "the target is a
// strict prefix of the source" and only the tail needs to move. Anything else
// is reported honestly rather than resolved by guessing.
function transfer(src, dst, { force }) {
  const s = size(src);
  const d = size(dst);
  if (s < 0) return { action: 'missing-source' };
  if (d < 0) return { action: 'create', bytes: s };
  if (d === s && digest(dst) === digest(src)) return { action: 'up-to-date', bytes: 0 };
  if (d < s && digest(src, d) === digest(dst)) return { action: 'append', bytes: s - d, offset: d };
  if (d > s && digest(dst, s) === digest(src)) return { action: 'target-ahead', bytes: d - s };
  return force ? { action: 'replace', bytes: s } : { action: 'diverged' };
}

function apply(src, dst, plan) {
  if (DRY) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (plan.action === 'append') appendFrom(src, dst, plan.offset);
  else if (plan.action === 'create' || plan.action === 'replace') fs.copyFileSync(src, dst);
}

function records() {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  const out = [];
  for (const name of fs.readdirSync(SESSIONS_DIR)) {
    if (!name.endsWith('.json')) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, name), 'utf8')));
    } catch {
      /* a half-written record is skipped, never fatal */
    }
  }
  return out.sort((a, b) => (b.last_active || 0) - (a.last_active || 0));
}

const heldOn = (r) => {
  const h = r.held_on;
  if (!h || (!h.host && !h.user)) return '—';
  return [h.user, h.host].filter(Boolean).join('@') + (r.held_on_source === 'recorded' ? '' : '?');
};

const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '——————————');

// Every session id we know about, from any of the three places.
function universe() {
  const set = new Map();
  for (const r of records()) set.set(r.session_id, r);
  for (const dir of [STORE, VAULT]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.jsonl') && !set.has(f.slice(0, -6))) set.set(f.slice(0, -6), { session_id: f.slice(0, -6) });
    }
  }
  return [...set.values()].sort((a, b) => (b.last_active || 0) - (a.last_active || 0));
}

const resolve = (list) => {
  if (ALL) return list;
  if (!ids.length) return [];
  return list.filter((r) => ids.some((id) => r.session_id.startsWith(id)));
};

// ── commands ────────────────────────────────────────────────────────────────

function cmdList() {
  const all = universe();
  console.log(`local store : ${STORE}`);
  console.log(`shared vault: ${VAULT}`);
  console.log(`this machine: ${HERE || '(unknown)'}\n`);
  console.log('date        turns  local    vault    held on                    session id');
  let onlyLocal = 0;
  let onlyVault = 0;
  let nowhere = 0;
  for (const r of all) {
    const l = size(path.join(STORE, `${r.session_id}.jsonl`));
    const v = size(path.join(VAULT, `${r.session_id}.jsonl`));
    if (l >= 0 && v < 0) onlyLocal += 1;
    if (v >= 0 && l < 0) onlyVault += 1;
    if (l < 0 && v < 0) nowhere += 1;
    console.log(
      day(r.last_active),
      String(r.turns || 0).padStart(5),
      mb(l).padStart(8),
      mb(v).padStart(8),
      ' ',
      heldOn(r).padEnd(26),
      r.session_id,
    );
  }
  console.log(`\n${all.length} conversation(s).`);
  console.log(`  ${onlyLocal} on this machine only  — 'push' to make portable`);
  console.log(`  ${onlyVault} in the vault only     — 'pull' to open here`);
  if (nowhere) {
    console.log(
      `  ${nowhere} journaled with NO transcript anywhere — held on a machine that never pushed.\n` +
        `     Run 'push --all --confirm' there, or accept that the thread is a summary only.`,
    );
  }
}

function move(direction) {
  const from = direction === 'push' ? STORE : VAULT;
  const to = direction === 'push' ? VAULT : STORE;
  const targets = resolve(universe()).filter((r) => size(path.join(from, `${r.session_id}.jsonl`)) >= 0);

  if (!targets.length) {
    console.error(
      ids.length || ALL
        ? `Nothing to ${direction}: no matching transcript in ${from}`
        : `Usage: node .claude/tools/transcripts.mjs ${direction} <session id> [<id>…] | --all`,
    );
    process.exit(1);
  }

  const bulkUnconfirmed = direction === 'push' && ALL && !CONFIRM && !DRY;
  if (direction === 'push') {
    console.log(
      '🔴 A transcript is the whole conversation, including any secret ever echoed into it.\n' +
        `   Pushing copies it to ${VAULT}, readable by anyone with W: access.\n`,
    );
  }
  if (bulkUnconfirmed) {
    console.log("Showing what 'push --all' would copy. Nothing is written without --confirm.\n");
  }

  let moved = 0;
  let bytes = 0;
  for (const r of targets) {
    const src = path.join(from, `${r.session_id}.jsonl`);
    const dst = path.join(to, `${r.session_id}.jsonl`);
    const plan = transfer(src, dst, { force: FORCE });
    const label = `${day(r.last_active)}  ${r.session_id}`;

    if (plan.action === 'up-to-date') {
      console.log(`  = ${label}  already current`);
      continue;
    }
    if (plan.action === 'target-ahead') {
      console.log(`  ! ${label}  target is ${mb(plan.bytes)} AHEAD — left alone (${direction} the other way?)`);
      continue;
    }
    if (plan.action === 'diverged') {
      console.log(`  ! ${label}  the two copies have diverged — skipped; --force overwrites the target`);
      continue;
    }

    if (!bulkUnconfirmed) apply(src, dst, plan);
    moved += 1;
    bytes += plan.bytes;
    const verb = { create: 'created', append: 'appended', replace: 'replaced' }[plan.action];
    console.log(`  ${DRY || bulkUnconfirmed ? '·' : '→'} ${label}  ${verb} ${mb(plan.bytes)}`);
  }

  const suffix = DRY ? ' (dry run — nothing written)' : bulkUnconfirmed ? ' — rerun with --confirm to write' : '';
  console.log(`\n${direction}: ${moved} transcript(s), ${mb(bytes)}${suffix}.`);
  if (direction === 'pull' && moved && !DRY && !bulkUnconfirmed) {
    console.log('Reopen one with:  claude --resume <session id>');
  }
}

// One-time repair: journal records written before `held_on` existed carry no
// machine. Where the transcript is sitting in THIS machine's store, that is
// good evidence it was held here — but it is an inference, not a record, so it
// is stamped as one and the index prints it with a `?`.
function cmdStamp() {
  const all = records();
  const user = (() => {
    try {
      return os.userInfo().username || '';
    } catch {
      return '';
    }
  })();

  let stamped = 0;
  let left = 0;
  for (const r of all) {
    if (r.held_on && (r.held_on.host || r.held_on.user)) continue;
    if (size(path.join(STORE, `${r.session_id}.jsonl`)) < 0) {
      left += 1; // no transcript here, so nothing to infer from
      continue;
    }
    r.held_on = { host: HERE, user };
    r.held_on_source = 'inferred-from-local-store';
    if (!DRY) {
      fs.writeFileSync(path.join(SESSIONS_DIR, `${r.session_id}.json`), JSON.stringify(r, null, 2), 'utf8');
    }
    stamped += 1;
    console.log(`  ${DRY ? '·' : '→'} ${day(r.last_active)}  ${r.session_id}  → ${heldOn(r)}`);
  }

  console.log(`\nStamped ${stamped}${DRY ? ' (dry run — nothing written)' : ''}. ${left} still unknown.`);
  if (left) {
    console.log('Those were held on a machine whose transcript is not here — run stamp there too.');
  }
}

// ── dispatch ────────────────────────────────────────────────────────────────

switch (cmd) {
  case 'list':
    cmdList();
    break;
  case 'push':
  case 'pull':
    move(cmd);
    break;
  case 'stamp':
    cmdStamp();
    break;
  default:
    console.error(`Unknown command "${cmd}". Try: list | push | pull | stamp`);
    process.exit(1);
}
