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

// The live activation API — the CANONICAL source for a persona's prompt.
// GET <API_BASE>/<slug>/prompt  (Authorization: Bearer <PERSONA_KEY>) returns the
// full activation prompt as markdown. This matches personas/tools/activate.mjs
// and api/README.md. The local ACTIVATE_DIR file is only an offline fallback.
export const API_BASE = (process.env.PERSONA_API_BASE || 'https://api.inspirepersonas.com/personas').replace(/\/+$/, '');
export const promptUrl = (persona) => `${API_BASE}/${persona}/prompt`;

// The twelve Inspire personas (short name == start_<name>.md).
export const PERSONAS = [
  'jubilee', 'melody', 'amir', 'imani', 'santiago', 'tahoma',
  'elias', 'eliana', 'caleb', 'nova', 'zariah', 'zev',
];

export const activationFile = (persona) => `${ACTIVATE_DIR}/start_${persona}.md`;
export const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

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
// Activation SOURCE is the live API: GET <API_BASE>/<slug>/prompt with the
// workspace's PERSONA_KEY. The local activation file is named only as the
// offline fallback.
export function buildContext({ persona, event, trigger, workspace, envPath }) {
  const Name = titleCase(persona);
  const tag = `${persona.toUpperCase()}:/> `;
  const url = promptUrl(persona);
  const localFile = activationFile(persona);
  const envRef = envPath || `${PERSONAS_ROOT}/../JubiLujah.com/.env`;

  const lead =
    event === 'SessionStart'
      ? `PERSONA ACTIVATION (workspace default). This workspace${workspace ? ` (${workspace})` : ''} is bound to the ` +
        `${Name} Inspire persona as its default — resolved from personas/registry/workspaces.json.`
      : `PERSONA ACTIVATION TRIGGERED. The user greeted/requested the ${Name} Inspire persona` +
        (trigger ? ` (matched: "${trigger}").` : '.');

  return (
    `${lead}\n\n` +
    `ACT NOW: If you have not already loaded ${Name} in this session, activate her by fetching her ENTIRE ` +
    `activation prompt from the Inspire Personas API and loading it as her system prompt:\n` +
    `  GET ${url}\n` +
    `  Authorization: Bearer <PERSONA_KEY>   (read PERSONA_KEY from ${envRef} — never print the key)\n` +
    `Run the fetch and read the whole response, e.g.:\n` +
    "  KEY=$(grep -E '^PERSONA_KEY' \"" + envRef + "\" | sed -E 's/^PERSONA_KEY\\s*=\\s*//; s/^\"//; s/\"$//')\n" +
    `  curl -sS -H "authorization: Bearer $KEY" "${url}"\n` +
    `(the response is ~99 KB of markdown: shared covenant + ${Name}'s identity + guardrails). ` +
    `If the API is unreachable, fall back to reading the local file with the Read tool:\n  ${localFile}\n` +
    `Then fully embody ${Name} exactly as that prompt specifies. In particular:\n` +
    `  - Open every reply with the speaker tag "${tag}".\n` +
    `  - Follow her covenant, guardrails (crisis/child-safety), the retrieval law ` +
    `(never invent memory — retrieve first or say you don't recall), and the disclosure rules.\n` +
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
