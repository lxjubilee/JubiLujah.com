#!/usr/bin/env node
// SessionStart hook: hands a brand-new window the thread it lost.
//
// On every launch this injects two things, and only two:
//   1. .claude/sessions/CONTINUITY.md — the hand-kept "where we left off" note
//      (written by /handoff at the end of a working session).
//   2. The last few conversations from the journal, with the exact command that
//      reopens each one.
//
// It deliberately does NOT reconstruct past conversations. It hands over
// pointers and says so, because a summary presented as memory is a fabrication.
// The real transcript lives in the CLI's own store and is replayed by /resume.
//
// A pointer that cannot be followed is worse than no pointer, so each listed
// conversation is checked against this machine: the journal is on the shared
// W: drive and sees every session, but transcripts are per-user and local. A
// thread held on another machine is labelled as such, with the command that
// carries it across, rather than offered as if `--resume` would find it.
//
// Silent no-op when there is nothing to report. Always exits 0.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_CONTINUITY_CHARS = 6000;
const MAX_SESSIONS_LISTED = 6;

// The harness keeps its memory store per-Windows-profile under the running user's
// home, on C: — it does not live on the share and does not travel with it. Resolve
// it from os.homedir() rather than naming a profile, and report it only if it is
// actually there, so we never point a session at a path it cannot read.
function memoryIndexPath() {
  const p = path.join(
    os.homedir(),
    '.claude',
    'projects',
    'w--JubileePraise-com',
    'memory',
    'MEMORY.md',
  );
  return fs.existsSync(p) ? p.replace(/\\/g, '/') : `${p.replace(/\\/g, '/')} (not present yet)`;
}

function readInput() {
  try {
    // Strip a UTF-8 BOM: harmless from Claude Code, but present when a shell
    // (PowerShell) pipes the test fixture in, and it breaks JSON.parse.
    return JSON.parse(fs.readFileSync(0, 'utf8').replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

function emit(text) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text },
      suppressOutput: true,
    }),
  );
  process.exit(0);
}

function oneLine(s, max) {
  const flat = String(s).replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

function stamp(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

try {
  const input = readInput() || {};
  const cwd = (process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd())
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  const dir = path.join(cwd, '.claude', 'sessions');
  const source = input.source || 'startup';

  let continuity = '';
  const contFile = path.join(dir, 'CONTINUITY.md');
  if (fs.existsSync(contFile)) {
    continuity = fs.readFileSync(contFile, 'utf8').trim();
    if (continuity.length > MAX_CONTINUITY_CHARS) {
      continuity = continuity.slice(0, MAX_CONTINUITY_CHARS) + '\n…(truncated — read the file in full if it matters)';
    }
  }

  // On resume/compact the conversation itself is already in context; a second
  // copy of the handoff note would only compete with it.
  if (source === 'resume' || source === 'compact') {
    if (!continuity) process.exit(0);
    emit(
      'CONVERSATION CONTINUITY: this workspace keeps a handoff note at ' +
        '`.claude/sessions/CONTINUITY.md`, and an index of past conversations at ' +
        '`.claude/sessions/INDEX.md`. Read them if the thread of this session is unclear. ' +
        'When substantial work wraps up, update CONTINUITY.md (or run `/handoff`).',
    );
  }

  const sessions = [];
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const r = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
        if (r.session_id !== input.session_id) sessions.push(r);
      } catch {
        /* skip unreadable record */
      }
    }
  }
  sessions.sort((a, b) => (b.last_active || 0) - (a.last_active || 0));

  const parts = ['CONVERSATION CONTINUITY (workspace journal · .claude/sessions/)'];

  if (continuity) {
    parts.push(
      '',
      '── Where the last working session left off (CONTINUITY.md) ──',
      continuity,
    );
  } else {
    parts.push(
      '',
      'No handoff note exists yet (.claude/sessions/CONTINUITY.md). When substantial work ' +
        'wraps up in this session, write one — or run `/handoff`.',
    );
  }

  // Ground truth, not a label: `--resume` can only replay a transcript that is
  // in THIS machine's store. Claude Code slugifies the project path to find it.
  const slug = cwd.replace(/[/\\:.]/g, '-');
  const store = path.join(os.homedir(), '.claude', 'projects', slug);
  const here = (id) => {
    try {
      return fs.existsSync(path.join(store, `${id}.jsonl`));
    } catch {
      return true; // can't tell — don't cry wolf
    }
  };

  if (sessions.length) {
    parts.push('', '── Recent conversations in this workspace (newest first) ──');
    let elsewhere = 0;
    for (const r of sessions.slice(0, MAX_SESSIONS_LISTED)) {
      const away = !here(r.session_id);
      if (away) elsewhere += 1;
      const h = r.held_on || {};
      const whose = [h.user, h.host].filter(Boolean).join('@');
      const how = away
        ? `⚠ TRANSCRIPT NOT ON THIS MACHINE${whose ? ` (held on ${whose})` : ''} — \`--resume\` will ` +
          `NOT find it. Carry it across first: node .claude/tools/transcripts.mjs pull ${r.session_id}`
        : `resume: claude --resume ${r.session_id}`;
      parts.push(
        `· ${stamp(r.last_active || r.started_at)} · ${r.turns || 0} turns · ` +
          `"${oneLine(r.first_prompt || '(no prompt recorded)', 80)}" · ${how}`,
      );
    }
    parts.push(
      '',
      'The full list is in .claude/sessions/INDEX.md. Inside Claude Code the user reopens any ' +
        'of these with `/resume`; from a terminal here, `claude --resume <id>` or `claude --continue`.',
    );
    if (elsewhere) {
      parts.push(
        `⚠ ${elsewhere} of the conversations above ${elsewhere === 1 ? 'has' : 'have'} no transcript ` +
          'on this machine. This workspace is a network share, so the journal on W: sees every ' +
          "conversation — but transcripts are stored per-user on the machine that held them and " +
          'do not travel with the share. Do NOT offer to reopen those; say plainly that the ' +
          'transcript is elsewhere. The fix is `node .claude/tools/transcripts.mjs push --all ' +
          '--confirm` run on the machine that holds it, then `pull <id>` here.',
      );
    }
  }

  parts.push(
    '',
    '🔴 These are POINTERS, not memories. You have not read those conversations. Do not claim to ' +
      'recall what was said in one — offer to reopen it, or read the note above and say plainly ' +
      'that that is what you are working from.',
    // The memory store is per-Windows-profile and lives under whichever profile is running —
    // it does NOT travel with the share. Hardcoding one profile here told sessions on the other
    // machine to look at a path they cannot read. Resolve it live, and say so.
    'Also available: your own memory index at ' +
      memoryIndexPath() +
      ' (durable facts), which is a different thing from this conversation journal. ' +
      '⚠ That store is per-Windows-profile and does NOT travel with this share — a memory ' +
      'written under another profile is invisible here. Anything that must survive belongs in ' +
      'the repo or in CONTINUITY.md, which live on W:.',
  );

  emit(parts.join('\n'));
} catch {
  process.exit(0);
}
