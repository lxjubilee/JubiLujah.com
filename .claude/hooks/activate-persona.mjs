#!/usr/bin/env node
// UserPromptSubmit hook: detects a greeting/activation of an Inspire persona
// (e.g. "Hi Jubilee", "activate the Melody persona", "become Zev") and injects
// a directive telling Claude to load and embody that persona's activation file.
//
// The persona activation files are the deployment surface described in
// <PERSONAS_ROOT>/activate/README.md — each start_<name>.md is a full system
// prompt. Reading it in full and staying in character IS "activating" the persona.
//
// The workspace DEFAULT persona (auto-activated on launch) is handled by the
// sibling SessionStart hook default-persona.mjs. Both share persona-directive.mjs.
// To move the personas repo, change PERSONAS_ROOT in persona-directive.mjs.

import { PERSONAS, buildContext, readInput, emit } from './persona-directive.mjs';

const data = readInput();
if (!data) process.exit(0); // not JSON — nothing to do

const prompt = (data && (data.prompt ?? data.user_prompt ?? data.message) || '').toString();
if (!prompt.trim()) process.exit(0);

const names = PERSONAS.join('|');

// Trigger 1 — a greeting addressed to a persona at the start of the message:
//   "Hi Jubilee", "Hello, Melody!", "Shalom Zariah", "Good morning Amir"
const greet = new RegExp(
  `^\\s*(hi|hiya|hey|hello|heya|greetings|shalom|yo|good\\s+(?:morning|afternoon|evening|day))` +
  `[\\s,!:.-]+(${names})\\b`,
  'i',
);

// Trigger 2 — an explicit activation verb near a persona name:
//   "activate the Jubilee persona", "become Zev", "switch to Nova", "summon Imani"
const activate = new RegExp(
  `\\b(activate|embody|become|switch\\s+to|load|summon|wake(?:\\s+up)?|bring\\s+(?:in|up)|call\\s+(?:up|on|forth)|put\\s+on)\\b` +
  `[\\s\\S]{0,40}?\\b(${names})\\b`,
  'i',
);

// Trigger 3 — the literal phrase "<name> persona" / "<name> Inspire persona":
const personaWord = new RegExp(`\\b(${names})[\\s'’-]*(?:inspire\\s+)?persona\\b`, 'i');

const match = greet.exec(prompt) || activate.exec(prompt) || personaWord.exec(prompt);
if (!match) process.exit(0);

// Resolve which persona was named (search the matched span first, then the whole prompt).
function firstPersonaIn(text) {
  for (const n of PERSONAS) {
    if (new RegExp(`\\b${n}\\b`, 'i').test(text)) return n;
  }
  return null;
}
const persona = firstPersonaIn(match[0]) || firstPersonaIn(prompt);
if (!persona) process.exit(0);

const trigger = match[0].trim().replace(/\s+/g, ' ');
const cwd = (data.cwd || process.cwd()).toString();
const envPath = cwd.replace(/\\/g, '/').replace(/\/+$/, '') + '/.env';
emit('UserPromptSubmit', buildContext({ persona, event: 'UserPromptSubmit', trigger, envPath }));
