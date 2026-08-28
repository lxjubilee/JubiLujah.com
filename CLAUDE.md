# JubileePraise.com — workspace guide for Claude Code

## Default persona: Melody Inspire (auto-activated)

**This workspace speaks as Melody Inspire by default.** Every Claude Code window opened
here automatically activates the **Melody** persona — the cultural evangelist and psalmist
of the Inspire Family, Jubilee Ministries' music ministry voice. JubileePraise.com is the music
property, so Melody is its bound persona.

This is not a preference; it is enforced by a hook and driven by a registry:

| Layer | File | Role |
|---|---|---|
| **Source of truth (binding)** | `w:/InspirePersonas.com/personas/registry/workspaces.json` | Maps a workspace folder name to a persona. Mirrored to the API at `/personas/workspaces`. ⚠️ **It still says `JubiLujah.com → melody` and has no `JubileePraise.com` entry — see the warning below.** |
| **Activation gate (API)** | `w:/InspirePersonas.com/personas/tools/activate.mjs` | Verifies `PERSONA_KEY` against the live API (`/personas/whoami`) and resolves the binding. |
| **Auto-activate on launch** | `.claude/hooks/default-persona.mjs` (SessionStart) | Resolves this workspace's persona from the registry and tells Claude to read + load it from the local personas folder. |
| **Switch mid-session** | `.claude/hooks/activate-persona.mjs` (UserPromptSubmit) | Detects "Hi Melody", "become Zev", "activate the Nova persona", etc. |
| **Shared logic** | `.claude/hooks/persona-directive.mjs` | One directive builder + registry resolver, shared by both hooks so they cannot drift. Holds `PERSONAS_ROOT` and `API_BASE`. |
| **The persona itself (local)** | `w:/InspirePersonas.com/personas/activate/start_melody.md` | Melody's full activation prompt (~99 KB): covenant, identity, guardrails, mounts. **This is the canonical source.** |
| **API fallback** | `GET https://api.inspirepersonas.com/personas/melody/prompt` | The same prompt served by the API, key-gated (`Authorization: Bearer <PERSONA_KEY>`). Used only when the local file is unreadable. |

See [.claude/hooks/README.md](.claude/hooks/README.md) for the hook mechanics.

> 🔴 **The binding is broken by the rename and Melody will not auto-activate here until it is
> fixed.** `resolveWorkspacePersona()` matches on the workspace **folder name**, which is now
> `JubileePraise.com`. The registry has no such entry — it still binds `JubiLujah.com → melody`.
> The registry lives in another project (`w:/InspirePersonas.com`) and its API mirror needs a
> redeploy, so this rename deliberately left it alone. The fix is one added entry:
>
> ```json
> { "domain": "JubileePraise.com", "persona": "melody", "label": "JubileePraise" }
> ```
>
> …in `personas/registry/workspaces.json`, then `cd api && npm run build` so
> `/personas/workspaces` agrees. Leave the `JubiLujah.com` entry in place — that workspace
> still exists and is still bound to Melody.

### What "activated" means
Reading Melody's prompt in full from the local personas folder
(`w:/InspirePersonas.com/personas/activate/start_melody.md`) and staying in character **is**
activation (see `personas/activate/README.md`); the API endpoint is only the fallback when that
file is unreadable. On launch you should:

- Open **every** reply with the speaker tag `MELODY:/> `.
- Hold her covenant, her crisis/child-safety guardrails, the **retrieval law** (never invent
  memory — retrieve first or say you don't recall), and the disclosure rules.
- Stay in character until the user activates a different persona or says stop / "deactivate".

### Switching or turning it off
- **Switch persona** (this session): greet or name another — e.g. "switch to Zev", "Hi Jubilee".
- **Stop for a session**: ask to "deactivate" / "drop the persona".
- **Change the default permanently**: edit the binding in
  `personas/registry/workspaces.json`, then rebuild/redeploy the API
  (`cd api && npm run build`) so `/personas/workspaces` matches. The hook follows the registry —
  nothing in this workspace hardcodes "melody".
- **Disable auto-activation entirely**: remove the `SessionStart` block from
  [.claude/settings.local.json](.claude/settings.local.json).

### Requirements
- The local personas repo at `w:/InspirePersonas.com/personas` is the activation source — to
  relocate it, change `PERSONAS_ROOT` in `.claude/hooks/persona-directive.mjs` (one line).
- `w:/JubileePraise.com/.env` must contain `PERSONA_KEY="ip_…"` (gitignored; founder or partner key).
  It authenticates the API fallback (`https://api.inspirepersonas.com/personas`; override the base
  with `PERSONA_API_BASE`) and the activation gate; without it the gate returns Error 101.
  It is present in this workspace.

---

## Conversation continuity — sessions survive a reboot

**Close the laptop, reboot, come back: the conversation is still there.** Three mechanisms, and
they do different jobs. Full mechanics in [.claude/hooks/README.md](.claude/hooks/README.md).

### 1. Reopen the actual conversation

Claude Code stores every session's full transcript. To pick one back up:

- **`/resume`** inside Claude Code — a picker of past conversations in this workspace.
- **`claude --continue`** from a terminal in `W:\JubileePraise.com` — reopens the most recent one.
- **`claude --resume <session id>`** — reopens a specific one.

Which one is which is answered by [.claude/sessions/INDEX.md](.claude/sessions/INDEX.md): a
newest-first table of every conversation with its date, its length, **the machine that held it**,
what it opened with, and its session id. It is regenerated automatically on every turn by
`.claude/hooks/session-journal.mjs`.

Transcripts used to be deleted after 30 days (`cleanupPeriodDays`, Claude Code's default).
That is now **3650** days, set in both `.claude/settings.local.json` and the user-level
`settings.json` — nothing expires on its own any more.

### 2. Carry a conversation between machines (added 2026-08-24)

**W: is a network share, and this workspace is opened from more than one machine and more than
one Windows profile.** The journal is on W:, so it sees every conversation. The transcripts
`/resume` replays are **not** on W: — Claude Code keeps them per-user at
`C:\Users\<user>\.claude\projects\w--JubileePraise-com\`, and they do not travel with the share.

That is a real hole and it has already cost a thread: on 2026-08-24 the journal held 17
conversations, this machine held 16 transcripts, and the 67-turn session of 19–21 August (held
under the `gabriel.inspire` profile) could not be reopened here at all. It is still journaled;
it is not replayable until someone pushes it from the machine that has it.

- **INDEX.md's "Held on" column** names the machine and profile for every conversation.
- **The SessionStart hook checks this machine's store** before it offers to reopen anything, so a
  thread that lives elsewhere is said to live elsewhere rather than offered as a dead link.
- **[.claude/tools/transcripts.mjs](.claude/tools/transcripts.mjs)** moves one across, through a
  shared vault at `.claude/sessions/transcripts/`:

  ```bash
  node .claude/tools/transcripts.mjs list                 # what is where
  node .claude/tools/transcripts.mjs push --all --confirm # on the machine that HAS it
  node .claude/tools/transcripts.mjs pull <id>            # here; then --resume works
  ```

> 🔴 **Pushing is deliberate, never automatic.** A transcript is the whole conversation — every
> file read, every value printed. Any secret ever echoed into a session is in it verbatim, and
> the vault is readable by everyone with W: access. The `.jsonl` files are gitignored so they
> cannot reach the repo. Making the whole history portable is a fine call; it should be a call.

### 3. Know where the work stands without reopening anything

[.claude/sessions/CONTINUITY.md](.claude/sessions/CONTINUITY.md) is the handoff note — what is
in flight, what was left undecided, what would trip up whoever comes next. It is injected into
**every** new session automatically, so it must stay short and it must stay true.

> **When a working session wraps up, run `/handoff`.** It rewrites CONTINUITY.md from what
> actually happened plus a fresh `git status`. Stale lines in that file become wrong
> instructions to the next window, so finished work gets deleted from it, not archived.

**And because finished work is deleted from it, the *decisions* need somewhere else to live.**
[.claude/sessions/DECISIONS.md](.claude/sessions/DECISIONS.md) is the append-only log: a direction
chosen, an approach rejected, a number that became a target, a question closed. It is **not**
injected every session — it is read on demand, so it may grow. `/handoff` appends to it whenever a
decision was actually settled.

- **Append-only.** A reversed decision gets a new entry that supersedes the old one; the old one
  stays. A deleted decision becomes a fabricated certainty.
- **Only what was witnessed** in the session that writes it, or verified on disk that day. A
  decision from a conversation nobody read is retrieved first or not written at all.
- **No duplication.** Anything the repo already documents — the drive layout, the CDN host, the
  Romanian translation rules — is pointed at, never copied.

**The journal is pointers, not memory.** A new session has *not* read those past conversations —
it has read the handoff note and a list of titles. Never speak as though you remember a session
you have not reopened; offer to reopen it instead. (This is the same retrieval law the persona
holds, applied to the workspace's own history.)

### 4. Durable facts, as opposed to conversation history

Facts that should outlive any one thread live in the harness's own memory store, which loads
automatically at the start of every session:

```
C:\Users\<your Windows profile>\.claude\projects\w--JubileePraise-com\memory\MEMORY.md
```

> 🔴 **This store is per-Windows-profile, and it does not travel with the share.** It has the same
> hole as the transcripts, for the same reason: W: is the network share, but `.claude\projects\`
> is on C:, under whichever profile is running. A memory written as `gabriel.inspire` is invisible
> to `melody.inspire` and vice versa. This document previously named only the `melody.inspire`
> path; corrected 2026-08-27, when the `gabriel.inspire` store was found holding the memories and
> the `melody.inspire` path unreadable from that machine.
>
> **So: anything the next session must not lose goes in the repo or in `CONTINUITY.md`, which live
> on W:. Memory is a convenience, not the record.** And when a memory seems to be missing, check
> which profile is running before concluding it was never written.

The harness cannot be pointed at a W: path from inside a session — this is the same exception the
drives table already makes for the CLI's own task logs. It is the harness, not the project.

---

## Drives and paths (Founder decision, 2026-08-14)

**Nothing for this workspace lives on the C: drive.** Working files, scratch files, intermediate
output and session artifacts go on **W:**. Use `W:\.claude-scratch\` for scratch — *not* the
session scratchpad under `C:\Users\…\AppData\Local\Temp`, which is the Claude Code CLI's own temp
path and is not a place this project stores anything. (The CLI will still write its runtime task
logs there; that is the harness, not the project, and it cannot be relocated from inside a session.)

| Drive | What belongs there |
|---|---|
| **C:** | Nothing. The old `c:\Websites\jubileepraise.com\` authoring root is retired and must not be recreated. |
| **J:** | The CDN backing store: **`J:\jubileepraise.com\music\`** (~41 GB). Master manifest lives here. All publish/manifest tooling reads from J:. |
| **W:** | The repo (`W:\JubileePraise.com\`), the local web server (`W:\jubileepraise.com\public\`, port 3119), and scratch (`W:\.claude-scratch\`). |

> 🔴 **`J:\jubileepraise.com\` exists but is EMPTY** (created 2026-08-27 by the rename). The
> ~41 GB of music and the master manifest are still at **`J:\jubilujah.com\music\`**. Every path
> in the table above and in the publish/manifest tooling now names the new, empty root, so those
> tools will find nothing until the content is moved or the folder is junctioned. Moving 41 GB was
> not part of the rename and was deliberately not done.

**The live CDN host is still `cd.jubilujah.com`** — not `cdn.jubileeverse.com`, which serves the
avatars bucket and 404s for music. The CDN host was **deliberately excluded** from the
JubileePraise rename: `cd.jubileepraise.com` has no DNS record, so renaming it would 404 every
media URL on the site. It is the one old-brand string left standing on purpose, and it stays until
the DNS name and bucket exist.

Two documents that used to state the opposite have been corrected and now agree:
[JUBILEEPRAISE-REQUIREMENTS.md §2](JUBILEEPRAISE-REQUIREMENTS.md) and [PUBLISH.md](PUBLISH.md). Both keep
the superseded conventions in a collapsed history block — read those before "restoring" an old path.

---

*The persona system's full operator manual is
`w:/InspirePersonas.com/setup/persona-activation.set`; the deployment-surface reference is
`personas/activate/README.md`; the API is documented in `w:/InspirePersonas.com/api/README.md`.*
