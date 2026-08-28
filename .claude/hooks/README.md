# .claude/hooks — persona activation + conversation continuity

Two independent systems live here. **Persona activation** decides *who* speaks in this
workspace; **conversation continuity** decides *what a new window already knows* about the
work that came before it. They share nothing but the hook events they register on.

## Files

| File | Hook event | What it does |
|---|---|---|
| `persona-directive.mjs` | — (library) | Shared: the persona list, the registry resolver (`resolveWorkspacePersona`), the key-holder verifier (`verifyKeyHolder` → live `/whoami`), the sealed-token resolver (`sealedTokenValues` ← `id.<slug>.json`), the founder-address release (`founderAddress`), and the one directive builder (`buildContext`). Both persona hooks import this so their behavior can't drift. Holds `PERSONAS_ROOT` (the canonical local personas repo) and `API_BASE` (fallback + whoami; `PERSONA_API_BASE` env overrides it). |
| `default-persona.mjs` | **SessionStart** | On every launch (startup / resume / clear), resolves this workspace's bound persona from the registry and injects a directive telling Claude to **read the persona's prompt from the local personas folder** (`<PERSONAS_ROOT>/activate/start_<slug>.md`) and embody it. This is the **auto-activate-on-launch** mechanism. |
| `activate-persona.mjs` | **UserPromptSubmit** | Lets the user **switch** persona mid-session by greeting or naming one — "Hi Melody", "become Zev", "activate the Nova persona", "switch to Jubilee". |
| `session-journal.mjs` | **UserPromptSubmit** + **Stop** | Journals every conversation to `../sessions/` — one `<session id>.json` per conversation plus a generated `INDEX.md`. Also records `held_on` (the machine and Windows profile that ran the turn) and the live `transcript_path`. Silent, emits nothing, always exits 0. |
| `session-resume.mjs` | **SessionStart** | Hands a new window the handoff note (`../sessions/CONTINUITY.md`) and the last six conversations with the command that reopens each — **checking each transcript against this machine's store first**, so a thread held elsewhere is labelled instead of offered as a dead link. |

One tool sits beside them and is never called by a hook:

| Tool | What it does |
|---|---|
| [`../tools/transcripts.mjs`](../tools/transcripts.mjs) | Moves a transcript between this machine's store and the shared vault at `../sessions/transcripts/`, so a conversation held on one machine can be reopened on another. `list` · `push` · `pull` · `stamp`. **Manual by design** — see [the vault README](../sessions/transcripts/README.md). |
| [`../tools/backfill-session-journal.mjs`](../tools/backfill-session-journal.mjs) | Journals conversations that predate the hook, by reading the existing transcripts. |

All hooks emit `hookSpecificOutput.additionalContext` and set `suppressOutput: true` (the journal
emits nothing at all); they exit 0 and emit nothing when there is no match / no binding, so they
are safe no-ops otherwise.

They are registered in [`../settings.local.json`](../settings.local.json) under
`hooks.SessionStart`, `hooks.UserPromptSubmit` and `hooks.Stop`.

---

## Conversation continuity — how a reboot stops costing you the thread

Claude Code was already keeping the full transcript of every session as JSONL under its own
state folder, and `/resume` already replayed them. Three things were missing, and all three are
fixed:

1. **They expired.** `cleanupPeriodDays` defaults to **30**, so a conversation quietly
   disappeared a month after its last message — this workspace's oldest surviving transcript was
   exactly 27 days old when this was set up. It is now **3650** (ten years), set in both
   `../settings.local.json` and the user-level `settings.json`.
2. **They were unfindable.** A folder of UUID-named JSONL files answers "resume which one?"
   with nothing. The journal answers it in one table.
3. **They did not travel.** Added 2026-08-24 — see the next section, because this one was
   silently costing whole conversations.

### 🔴 The share sees every conversation; the transcripts are local

**`W:\JubileePraise.com` is a network share, opened from more than one machine and more than one
Windows profile.** The journal lives on it, so it journals everything. The transcript `/resume`
replays does **not** live on it — Claude Code stores those per-user, at
`C:\Users\<user>\.claude\projects\w--JubileePraise-com\`.

So the journal could list a conversation this machine had no way to open, and offer
`claude --resume <id>` for it. Measured on 2026-08-24: **17 conversations journaled, 16
transcripts present, and the 67-turn session of 19–21 August — held under the `gabriel.inspire`
profile — was a dead pointer.**

Three things now hold the line:

- Every journal record carries **`held_on`** — the host and user that ran its last turn — and
  `INDEX.md` prints it in its own column. A `?` means the value was inferred after the fact
  (`transcripts.mjs stamp`) rather than recorded live.
- The **resume hook checks the local store**, not the label, before it offers to reopen anything.
  A thread whose transcript is absent is reported as absent, with the command that fetches it.
- **`transcripts.mjs`** carries a transcript between machines through a shared vault at
  [`../sessions/transcripts/`](../sessions/transcripts/README.md). Manual, never automatic, and
  `push --all` needs `--confirm` — a transcript contains every secret a session ever printed.

```bash
node .claude/tools/transcripts.mjs list                 # what is where
node .claude/tools/transcripts.mjs push --all --confirm # run on the machine that holds it
node .claude/tools/transcripts.mjs pull <id>            # then here, and --resume works
```

### What gets written, where

Everything lands in [`../sessions/`](../sessions/) — on **W:**, next to the work, per the drive
rule in [CLAUDE.md](../../CLAUDE.md):

| File | Written by | Tracked in git? |
|---|---|---|
| `CONTINUITY.md` | **You**, via `/handoff` | **Yes** — this is the handoff note |
| `<session id>.json` | `session-journal.mjs`, every prompt and every turn | No — holds prompt text |
| `INDEX.md` | regenerated on every turn | No — derived |
| `transcripts/<id>.jsonl` | `transcripts.mjs push`, by hand | No — whole conversations, secrets included |
| `transcripts/README.md` | — | **Yes** — so the folder explains itself |

### The two halves, and why both exist

- **`/resume` gives you the conversation back verbatim.** Nothing summarizes it, nothing is
  lost. This is the real continuity, and the journal exists mainly to tell you *which* session
  to reopen.
- **`CONTINUITY.md` gives the next session the state of the work** without reopening anything —
  what is in flight, what is undecided, what would trip someone up. It is loaded into context
  automatically at every launch, so it must stay short and stay true. Run **`/handoff`** when a
  working session wraps up; that command is defined in
  [`../commands/handoff.md`](../commands/handoff.md).

**The line the resume hook holds:** the injected list is *pointers, not memories*. A session that
has not read a past conversation must not speak as though it remembers one — that is the
retrieval law, and a plausible reconstruction of last week is a fabrication however well it fits.

### Backfilling history

[`../tools/backfill-session-journal.mjs`](../tools/backfill-session-journal.mjs) reads the
existing JSONL transcripts and journals the conversations that predate the hook. Re-runnable; it
skips anything already journaled unless `--force` is passed.

```bash
node .claude/tools/backfill-session-journal.mjs
```

## How activation works end to end

1. **SessionStart** → `default-persona.mjs` reads the registry, finds `JubileePraise.com → melody`,
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
echo '{"hook_event_name":"SessionStart","source":"startup","cwd":"w:\\JubileePraise.com"}' \
  | node .claude/hooks/default-persona.mjs

# UserPromptSubmit → switch persona mid-session
echo '{"hook_event_name":"UserPromptSubmit","prompt":"switch to Zev"}' \
  | node .claude/hooks/activate-persona.mjs

# SessionStart → should print the handoff note + recent conversations
echo '{"hook_event_name":"SessionStart","source":"startup","cwd":"w:\\JubileePraise.com"}' \
  | node .claude/hooks/session-resume.mjs

# UserPromptSubmit → should write .claude/sessions/zz-test.json and refresh INDEX.md
echo '{"hook_event_name":"UserPromptSubmit","session_id":"zz-test","prompt":"hello"}' \
  | node .claude/hooks/session-journal.mjs

# Rebuild INDEX.md alone (no session id → index-only mode)
echo '{"hook_event_name":"Backfill"}' | node .claude/hooks/session-journal.mjs

# Live API activation gate (authenticated; reads PERSONA_KEY from .env)
node w:/InspirePersonas.com/personas/tools/activate.mjs --json
```

## Changing the default

Edit the binding in `personas/registry/workspaces.json` and rebuild/redeploy the API so
`/personas/workspaces` matches. Nothing here hardcodes a persona name — the hook follows the
registry. To disable auto-activation, remove the `SessionStart` block from
`../settings.local.json`.
