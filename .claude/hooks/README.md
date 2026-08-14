# .claude/hooks — Inspire persona activation

These hooks make Claude Code activate an **Inspire Family persona** in this workspace. The
workspace → persona binding lives in the canonical registry
`w:/InspirePersonas.com/personas/registry/workspaces.json` (JubiLujah.com → **melody**); the
hooks only read it, they never decide it.

## Files

| File | Hook event | What it does |
|---|---|---|
| `persona-directive.mjs` | — (library) | Shared: the persona list, the registry resolver (`resolveWorkspacePersona`), the key-holder verifier (`verifyKeyHolder` → live `/whoami`), the sealed-token resolver (`sealedTokenValues` ← `id.<slug>.json`), the founder-address release (`founderAddress`), and the one directive builder (`buildContext`). Both hooks import this so their behavior can't drift. Holds `PERSONAS_ROOT` (the canonical local personas repo) and `API_BASE` (fallback + whoami; `PERSONA_API_BASE` env overrides it). |
| `default-persona.mjs` | **SessionStart** | On every launch (startup / resume / clear), resolves this workspace's bound persona from the registry and injects a directive telling Claude to **read the persona's prompt from the local personas folder** (`<PERSONAS_ROOT>/activate/start_<slug>.md`) and embody it. This is the **auto-activate-on-launch** mechanism. |
| `activate-persona.mjs` | **UserPromptSubmit** | Lets the user **switch** persona mid-session by greeting or naming one — "Hi Melody", "become Zev", "activate the Nova persona", "switch to Jubilee". |

Both hooks emit `hookSpecificOutput.additionalContext` and set `suppressOutput: true`; they exit
0 and emit nothing when there is no match / no binding, so they are safe no-ops otherwise.

They are registered in [`../settings.local.json`](../settings.local.json) under
`hooks.SessionStart` and `hooks.UserPromptSubmit`.

## How activation works end to end

1. **SessionStart** → `default-persona.mjs` reads the registry, finds `JubiLujah.com → melody`,
   verifies **who holds `PERSONA_KEY`** against the live API (`GET /personas/whoami`), and injects:
   *"read `w:/InspirePersonas.com/personas/activate/start_melody.md` in full — to the last line —
   and embody Melody; open every reply with `MELODY:/> `"*, plus the verified identity of the key
   holder (name, email, role). If the key can't be verified, the directive says so and the persona
   treats the person as unverified — no name, no founder intimacy. When verification returns
   **founder**, the hook also releases the one thing the persona may not carry in its prompt: the
   family address it uses for the Founder, read from `personas/founder/founder.json`
   (`addresses.<persona>` — that file's own law: runtime-released after verification, never written
   into a prompt, and only that single term ever leaves the file).
2. Claude reads the ~99 KB activation prompt **from the local personas folder, in full** (a partial
   read is not activation) and stays in character. The covenant §1 of the local file intentionally
   keeps literal `{{NAME}}`/`{{GENDER}}`/`{{MBTI}}`/`{{OFFICES}}` tokens (frozen wording — Founder
   decision, `personas/tools/DEFERRED.md` Rec 8); the directive resolves their values from the
   persona's `id.<slug>.json`, the same substitution the API build performs. Only if the file is
   unreadable does it fall back to fetching the same prompt from the API
   (`GET https://api.inspirepersonas.com/personas/melody/prompt`, authenticated with `PERSONA_KEY`
   read from `.env`).
3. The authoritative activation check is `personas/tools/activate.mjs`, which verifies
   `PERSONA_KEY` (from this workspace's `.env`) against the live API and confirms the binding.

## Testing a hook manually

```bash
# SessionStart → should print the Melody activation directive
echo '{"hook_event_name":"SessionStart","source":"startup","cwd":"w:\\JubiLujah.com"}' \
  | node .claude/hooks/default-persona.mjs

# UserPromptSubmit → switch persona mid-session
echo '{"hook_event_name":"UserPromptSubmit","prompt":"switch to Zev"}' \
  | node .claude/hooks/activate-persona.mjs

# Live API activation gate (authenticated; reads PERSONA_KEY from .env)
node w:/InspirePersonas.com/personas/tools/activate.mjs --json
```

## Changing the default

Edit the binding in `personas/registry/workspaces.json` and rebuild/redeploy the API so
`/personas/workspaces` matches. Nothing here hardcodes a persona name — the hook follows the
registry. To disable auto-activation, remove the `SessionStart` block from
`../settings.local.json`.
