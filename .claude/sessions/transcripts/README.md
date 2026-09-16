# The shared transcript vault

`<session id>.jsonl` files land here. Each one is a **whole Claude Code conversation**,
verbatim — every prompt, every file read, every command and its output. They are put here on
purpose, by hand, so that a conversation held on one machine can be reopened on another.

## Why this folder has to exist

`W:\JubiLujah.com` is a network share. The **journal** (`../`) lives on it, so it sees every
conversation held in this workspace from any machine. The **transcripts** that `/resume` actually
replays do not: Claude Code keeps those per-user, under
`C:\Users\<user>\.claude\projects\w--JubiLujah-com\`.

So the journal can list a conversation this machine cannot open. Measured 2026-08-24: seventeen
conversations journaled, sixteen transcripts present, and the 67-turn session of 19–21 August —
held under a different Windows profile — was a dead pointer.

## Using it

```bash
node .claude/tools/transcripts.mjs list                 # what is where
node .claude/tools/transcripts.mjs push <id>            # this machine → here
node .claude/tools/transcripts.mjs push --all --confirm # everything → here
node .claude/tools/transcripts.mjs pull <id>            # here → this machine
claude --resume <id>                                    # …and now it opens
```

Copies are incremental: a transcript is append-only, so a second push moves only the new tail.
Two copies that have genuinely diverged are reported and skipped, never silently overwritten.

## 🔴 Before you push

A transcript holds everything a session ever saw. If a `.env`, a database password, an R2 or
Stripe key was ever printed into a conversation, it is in that file in plain text — and this
folder is readable by everyone with W: access.

Nothing pushes automatically and no hook calls the tool. `push --all` needs `--confirm`. The
`.jsonl` files are gitignored (this README is not), so they cannot reach the repo. Making the
whole history portable is a perfectly good decision — it should just be a decision.
