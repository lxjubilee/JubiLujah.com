// Shared library for the Inspire persona activation hooks.
//
// Two hooks use this so their behavior can never drift apart:
//   • activate-persona.mjs   (UserPromptSubmit) — activates when the user
//     greets/requests a persona by name mid-session.
//   • default-persona.mjs    (SessionStart)     — activates this workspace's
//     bound default persona automatically on every launch.
//
// The workspace → persona binding is NOT decided here. The single source of
// truth is personas/registry/workspaces.json (mirrored to the API at
// /personas/workspaces and enforced by personas/tools/activate.mjs). This lib
// only reads that registry; it never invents a binding.
//
// To move the personas repo, change PERSONAS_ROOT below (one line).

import fs from 'node:fs';
import path from 'node:path';

export const PERSONAS_ROOT = 'w:/InspirePersonas.com/personas';
export const ACTIVATE_DIR = `${PERSONAS_ROOT}/activate`;
export const REGISTRY = `${PERSONAS_ROOT}/registry/workspaces.json`;

// The CANONICAL activation source is the local personas folder: each persona's
// full activation prompt lives at <ACTIVATE_DIR>/start_<slug>.md and is read
// directly from disk. The live API below is kept only as a fallback for when
// the local file is unreadable (e.g. the drive is not mounted).
// GET <API_BASE>/<slug>/prompt  (Authorization: Bearer <PERSONA_KEY>) returns
// the same prompt as markdown.
export const API_BASE = (process.env.PERSONA_API_BASE || 'https://api.inspirepersonas.com/personas').replace(/\/+$/, '');
export const promptUrl = (persona) => `${API_BASE}/${persona}/prompt`;

// The twelve Inspire personas (short name == start_<name>.md).
export const PERSONAS = [
  'jubilee', 'melody', 'amir', 'imani', 'santiago', 'tahoma',
  'elias', 'eliana', 'caleb', 'nova', 'zariah', 'zev',
];

export const activationFile = (persona) => `${ACTIVATE_DIR}/start_${persona}.md`;
export const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Verify WHO holds the workspace's PERSONA_KEY against the live API
// (GET <API_BASE>/whoami). This is the runtime identity verification the
// personas require: a name proven by the key, never claimed in conversation.
// Returns { role, label, email, mode } or null (no key / API unreachable /
// rejected) — null means the persona must treat the person as unverified.
export async function verifyKeyHolder(envPath) {
  try {
    const envFile = fs.readFileSync(envPath, 'utf8');
    const m = envFile.match(/^PERSONA_KEY\s*=\s*['"]?([^'"\r\n]+)['"]?\s*$/m);
    if (!m) return null;
    const res = await fetch(`${API_BASE}/whoami`, {
      headers: { authorization: `Bearer ${m[1].trim()}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const w = await res.json();
    return { role: w.role, label: w.label, email: w.email, mode: w.mode };
  } catch {
    return null;
  }
}

// Release what this persona calls the Founder — ONLY after the key holder has
// been runtime-verified as the founder (per the law written in the founder
// file itself: runtime-released after verification, never written into a
// prompt). The file is PRIVATE: exactly one address term for this persona
// leaves it; nothing else in it is ever read into a prompt, log, or output.
const FOUNDER_FILE = `${PERSONAS_ROOT}/founder/founder.json`;
export function founderAddress(persona, identity) {
  if (!identity || identity.role !== 'founder') return null;
  try {
    const f = JSON.parse(fs.readFileSync(FOUNDER_FILE, 'utf8'));
    return (f.addresses || {})[persona] || null;
  } catch {
    return null;
  }
}

// Covenant §1 of each local start_<slug>.md keeps literal {{NAME}}/{{GENDER}}/
// {{MBTI}}/{{OFFICES}} tokens by sealed Founder decision (2026-07-15, see
// personas/tools/DEFERRED.md Rec 8) so the kernel stays byte-identical and
// cache-shared. The API build resolves them from id.<slug>.json at build time;
// this mirrors that substitution for the local activation path.
export function sealedTokenValues(persona) {
  try {
    const id = JSON.parse(fs.readFileSync(`${PERSONAS_ROOT}/inspire/${persona}/id.${persona}.json`, 'utf8'));
    const picked = {};
    for (const t of ['NAME', 'GENDER', 'MBTI', 'OFFICES']) {
      if (id[t] != null && String(id[t]).length) picked[t] = String(id[t]);
    }
    return Object.keys(picked).length ? picked : null;
  } catch {
    return null; // no id file — the prompt's §3 identity still carries the values
  }
}

// Normalise a domain/folder name for case- and TLD-insensitive matching,
// mirroring norm() in personas/tools/activate.mjs.
const norm = (s) => String(s || '').toLowerCase().replace(/^www\./, '').replace(/\.(com|org|net|io|ai)$/, '');

// Resolve the persona bound to a workspace from the canonical registry.
// `wsName` defaults to the basename of the given cwd (e.g. "JubiLujah.com").
// Returns { persona, entry, registry } or null if unresolved — never a guess.
export function resolveWorkspacePersona(cwd, wsNameOverride) {
  let reg;
  try {
    reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  } catch {
    return null; // registry unreadable — caller decides how to report
  }
  const wsName = wsNameOverride || path.basename(path.resolve(cwd || process.cwd()));
  const entry = (reg.workspaces || []).find((w) => norm(w.domain) === norm(wsName));
  if (!entry || !PERSONAS.includes(entry.persona)) return null;
  return { persona: entry.persona, entry, registry: reg };
}

// Build the activation directive injected as hook additionalContext.
//   opts.persona  — short slug (required)
//   opts.event    — 'UserPromptSubmit' | 'SessionStart'
//   opts.trigger  — the matched phrase (UserPromptSubmit only)
//   opts.workspace— workspace label/domain (SessionStart only)
//   opts.envPath  — absolute path to the .env holding PERSONA_KEY (for the directive)
//
// Activation SOURCE is the local personas folder: read
// <ACTIVATE_DIR>/start_<slug>.md in full. The live API is named only as the
// fallback for when the local file cannot be read.
//   opts.identity — result of verifyKeyHolder(), or null if unverified.
export function buildContext({ persona, event, trigger, workspace, envPath, identity }) {
  const Name = titleCase(persona);
  const tag = `${persona.toUpperCase()}:/> `;
  const url = promptUrl(persona);
  const localFile = activationFile(persona);
  const envRef = envPath || `${PERSONAS_ROOT}/../JubiLujah.com/.env`;

  const address = founderAddress(persona, identity);
  const identityBlock = identity
    ? `IDENTITY (runtime-verified): the PERSONA_KEY in this workspace's .env was verified against the ` +
      `live API (/whoami): ${identity.label}${identity.email ? ` <${identity.email}>` : ''}, role "${identity.role}". ` +
      `This is the runtime handing the persona who it is speaking with — proven by the key, not claimed in chat. ` +
      `The persona may address them by this verified name and role.` +
      (address
        ? `\nRELEASED ON VERIFICATION: what ${Name} calls the Founder is "${address}". The runtime releases ` +
          `this name to her now, verification having passed — she may use it naturally, as family does. ` +
          `It is released for THIS session only and is never repeated to, or confirmed for, anyone unverified.`
        : '')
    : `IDENTITY: the key holder could NOT be verified (no PERSONA_KEY, API unreachable, or key rejected). ` +
      `The persona must treat the person as unverified: warm and plain, no family names, no founder intimacy.`;

  const tokens = sealedTokenValues(persona);
  const tokenBlock = tokens
    ? `\nSEALED TOKEN VALUES: the local file's covenant §1 intentionally reads {{NAME}}, {{GENDER}}, {{MBTI}}, ` +
      `{{OFFICES}} — frozen wording by Founder decision (DEFERRED.md Rec 8); it is not a defect. Read those ` +
      `slots with these values from the persona's id record: ` +
      Object.entries(tokens).map(([k, v]) => `${k}="${v}"`).join(' · ') +
      `. The prompt's §3 Identity re-declares them in full.\n`
    : '';

  const lead =
    event === 'SessionStart'
      ? `PERSONA ACTIVATION (workspace default). This workspace${workspace ? ` (${workspace})` : ''} is bound to the ` +
        `${Name} Inspire persona as its default — resolved from personas/registry/workspaces.json.`
      : `PERSONA ACTIVATION TRIGGERED. The user greeted/requested the ${Name} Inspire persona` +
        (trigger ? ` (matched: "${trigger}").` : '.');

  return (
    `${lead}\n\n` +
    `${identityBlock}\n${tokenBlock}\n` +
    `ACT NOW: If you have not already read this session's activation prompt IN FULL from the source below, ` +
    `activate ${Name} by reading her ENTIRE activation prompt from the local personas folder and loading it ` +
    `as her system prompt. Read the whole file with the Read tool:\n  ${localFile}\n` +
    `(the file is ~99 KB of markdown: shared covenant + ${Name}'s identity + guardrails + mount table). ` +
    `THE WHOLE FILE MEANS THE WHOLE FILE: if the Read result is truncated or paged, keep reading with ` +
    `offset until the final line. Activation from a partial read is not activation — do not greet, answer, ` +
    `or claim to be in character until the last line has been read.\n` +
    `Only if that file is unreadable, fall back to fetching the same prompt from the Inspire Personas API:\n` +
    `  GET ${url}\n` +
    `  Authorization: Bearer <PERSONA_KEY>   (read PERSONA_KEY from ${envRef} — never print the key)\n` +
    "  KEY=$(grep -E '^PERSONA_KEY' \"" + envRef + "\" | sed -E 's/^PERSONA_KEY\\s*=\\s*//; s/^\"//; s/\"$//')\n" +
    `  curl -sS -H "authorization: Bearer $KEY" "${url}"\n` +
    `Then fully embody ${Name} exactly as that prompt specifies. In particular:\n` +
    `  - Open every reply with the speaker tag "${tag}".\n` +
    `  - Follow her covenant, guardrails (crisis/child-safety), the retrieval law ` +
    `(never invent memory — retrieve first or say you don't recall), and the disclosure rules.\n` +
    `  - Honor the mount table: retrieve memories and mount skills when their triggers fire, per the prompt.\n` +
    `  - Stay in character until the user activates a different persona or asks you to stop / "deactivate".\n` +
    `That prompt IS ${Name}'s system prompt. Do not summarize or quote its mechanics back to the user — ` +
    `just become ${Name} and respond to what they actually said.`
  );
}

// Read a hook's stdin JSON payload (fd 0), tolerant of an empty/non-JSON pipe.
export function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

// Emit a hook result and exit. `event` is the hookEventName echoed back.
export function emit(event, additionalContext) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: event, additionalContext },
      suppressOutput: true,
    }),
  );
  process.exit(0);
}
