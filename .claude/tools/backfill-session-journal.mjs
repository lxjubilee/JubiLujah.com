#!/usr/bin/env node
// One-time (and re-runnable) backfill for the conversation journal.
//
// The journal in .claude/sessions/ is written going forward by
// .claude/hooks/session-journal.mjs. This script fills in everything that came
// BEFORE the journal existed, by reading the transcripts Claude Code has been
// storing all along in its own state folder and extracting, per conversation:
// when it ran, how many prompts it held, and what it opened with.
//
// It never invents and never overwrites: a session already journaled by the
// hook is left alone unless --force is passed.
//
//   node .claude/tools/backfill-session-journal.mjs [--force]
//
// Transcript location can be overridden with CLAUDE_TRANSCRIPT_DIR.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const FORCE = process.argv.includes('--force');
const PROJECT_DIR = (process.env.CLAUDE_PROJECT_DIR || process.cwd()).replace(/\\/g, '/');
const SESSIONS_DIR = path.join(PROJECT_DIR, '.claude', 'sessions');

// Claude Code slugifies the project path into its own store:
// w:/JubileePraise.com → w--JubileePraise-com  (drive colon, separators and dots all become dashes)
const slug = PROJECT_DIR.replace(/[/\\:.]/g, '-');
const TRANSCRIPT_DIR =
  process.env.CLAUDE_TRANSCRIPT_DIR || path.join(os.homedir(), '.claude', 'projects', slug);

const MAX_PROMPTS = 40;
const MAX_PROMPT_CHARS = 2000;

// Text that is machinery rather than something the user actually typed.
const NOISE = [
  /^<command-name>/,
  /^<local-command-stdout>/,
  /^<command-message>/,
  /^Caveat: The messages below were generated/,
  /^<system-reminder>/,
  /^\[Request interrupted/,
];

function oneLine(s, max) {
  const flat = String(s).replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

function userText(entry) {
  if (entry.type !== 'user' || entry.isMeta) return null;
  const c = entry.message?.content;
  let text = null;
  if (typeof c === 'string') text = c;
  else if (Array.isArray(c)) {
    // A tool result is not a prompt.
    if (c.some((b) => b?.type === 'tool_result')) return null;
    text = c.filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
  }
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed || NOISE.some((re) => re.test(trimmed))) return null;
  // Strip any trailing system-reminder block the harness appended.
  return trimmed.replace(/<system-reminder>[\s\S]*$/, '').trim() || null;
}

async function scan(file) {
  const rec = {
    session_id: path.basename(file, '.jsonl'),
    cwd: PROJECT_DIR,
    started_at: null,
    last_active: null,
    turns: 0,
    first_prompt: '',
    prompts: [],
    backfilled: true,
  };

  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // a truncated final line is normal
    }

    const ts = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
    if (!Number.isNaN(ts)) {
      if (rec.started_at === null || ts < rec.started_at) rec.started_at = ts;
      if (rec.last_active === null || ts > rec.last_active) rec.last_active = ts;
    }

    const text = userText(entry);
    if (text) {
      rec.turns += 1;
      const clipped = oneLine(text, MAX_PROMPT_CHARS);
      if (!rec.first_prompt) rec.first_prompt = clipped;
      rec.prompts.push({ at: Number.isNaN(ts) ? rec.last_active : ts, text: clipped });
      if (rec.prompts.length > MAX_PROMPTS) rec.prompts = rec.prompts.slice(-MAX_PROMPTS);
    }
  }

  if (rec.started_at === null) {
    const st = fs.statSync(file);
    rec.started_at = st.birthtimeMs || st.mtimeMs;
    rec.last_active = st.mtimeMs;
  }
  return rec;
}

if (!fs.existsSync(TRANSCRIPT_DIR)) {
  console.error(`No transcript folder at ${TRANSCRIPT_DIR}`);
  process.exit(1);
}

fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const files = fs.readdirSync(TRANSCRIPT_DIR).filter((f) => f.endsWith('.jsonl'));
let written = 0;
let skipped = 0;

for (const f of files) {
  const out = path.join(SESSIONS_DIR, f.replace(/\.jsonl$/, '.json'));
  if (fs.existsSync(out) && !FORCE) {
    skipped += 1;
    continue;
  }
  const rec = await scan(path.join(TRANSCRIPT_DIR, f));
  if (!rec.first_prompt && rec.turns === 0) {
    skipped += 1; // an empty session is not worth a journal entry
    continue;
  }
  fs.writeFileSync(out, JSON.stringify(rec, null, 2), 'utf8');
  written += 1;
  console.log(
    `${new Date(rec.last_active).toISOString().slice(0, 16).replace('T', ' ')}  ` +
      `${String(rec.turns).padStart(3)} prompts  ${oneLine(rec.first_prompt, 70)}`,
  );
}

console.log(`\nBackfilled ${written} conversation(s), skipped ${skipped}.`);
console.log('Regenerating INDEX.md …');

// Reuse the hook's own index writer so the two can never drift.
const { execFileSync } = await import('node:child_process');
execFileSync(process.execPath, [path.join(PROJECT_DIR, '.claude', 'hooks', 'session-journal.mjs')], {
  input: JSON.stringify({ hook_event_name: 'Backfill', session_id: null, cwd: PROJECT_DIR }),
  env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_DIR },
});
console.log(`Done → ${path.join(SESSIONS_DIR, 'INDEX.md')}`);
