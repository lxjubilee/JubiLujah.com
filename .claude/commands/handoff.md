---
description: Write the "where we left off" note so the next session (after a reboot) can pick this work straight back up.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git status:*), Bash(git log:*), Bash(git diff:*), Bash(git branch:*)
---

Write the handoff note for this session to `.claude/sessions/CONTINUITY.md`, overwriting it.

$ARGUMENTS

**Gather first, then write.** Run `git status --short` and `git log --oneline -5`, and re-read
`.claude/sessions/CONTINUITY.md` if it exists. Combine what those show with what actually happened
in *this* conversation.

**Write only what you know.** Every line is either something that happened in this session or
something you just verified on disk. If a thread was left ambiguous, say it was left ambiguous —
an invented "next step" sends the next session down a road nobody chose. Nothing from the previous
note is carried forward unless it is still true; anything finished is deleted, not archived.

Use exactly this shape:

```markdown
# Where we left off — JubileePraise.com

_Updated <YYYY-MM-DD HH:MM> · branch `<branch>` · session `<session id if known>`_

## In flight
<The one or two things actually being worked on right now. What is done, what is not,
and the single next action for each. Name real files with paths.>

## Open questions / waiting on Appa
<Decisions that were not made. Omit the heading entirely if there are none.>

## Landmines
<Anything the next session would get wrong without being told: a half-applied change, a
service that must be restarted, a path that is not what it looks like, a command that
failed and why. Omit the heading if there are none.>

## Not yet committed
<From git status — the uncommitted / untracked files that belong to the work above,
and what each one is for.>
```

Keep it under about 60 lines — it is loaded into every new session, so it earns its space.

**Then, if a decision was actually settled this session, append it to
`.claude/sessions/DECISIONS.md`.** That file is append-only and is where a decision goes to
survive, because CONTINUITY.md deletes finished work by design — so without this step the *answer*
is the thing that gets lost.

- Append only. Never edit or delete an existing entry; a reversal is a **new** entry that
  supersedes the old one, and the old one stays.
- Only decisions this session actually witnessed, or verified on disk today. If a question was
  raised and left open, it goes under **Still open**, not among the decisions.
- Never copy what the repo already documents — point at the file instead.
- Format: `## D-<YYYY-MM-DD>-<n> · <the decision in one line>`, then **Decided / By / Why /
  Changed**.
- If nothing was settled, add nothing. A log padded with non-decisions stops being read.

Finally, tell Appa in one sentence that the note is written and what it now says is in flight —
and name any decision you logged.
