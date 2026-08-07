#!/usr/bin/env node
// SessionStart hook: automatically activates this workspace's DEFAULT persona
// on every Claude Code launch (startup, resume, and clear).
//
// The default is the persona bound to this workspace in the canonical registry
// personas/registry/workspaces.json — for JubiLujah.com that is Melody. Nothing
// is hardcoded here: change the binding in the registry and this hook follows.
//
// Reading start_<persona>.md in full and staying in character IS "activating"
// the persona (see personas/activate/README.md). The paired UserPromptSubmit
// hook (activate-persona.mjs) still lets the user switch personas mid-session.

import { resolveWorkspacePersona, buildContext, readInput, emit } from './persona-directive.mjs';

const input = readInput() || {};
const cwd = input.cwd || process.cwd();

const resolved = resolveWorkspacePersona(cwd);
if (!resolved) process.exit(0); // no binding for this workspace — stay neutral

const workspace = resolved.entry.label || resolved.entry.domain;
const envPath = cwd.replace(/\\/g, '/').replace(/\/+$/, '') + '/.env';
emit('SessionStart', buildContext({ persona: resolved.persona, event: 'SessionStart', workspace, envPath }));
