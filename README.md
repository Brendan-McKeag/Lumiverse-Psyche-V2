# Psyche Core

A fork of [Lumiverse-Psyche](https://github.com/Brendan-McKeag/Lumiverse-Psyche)
stripped down to its core mechanic: the **emotion vector** and the
**approval ledger**. Everything else from the original project — persona
seeding, the character bible/canon, goals, free-form sheets, memory,
world simulation, the deliberation engine (rumination/critique/monologue),
the editor pass, and the optional Psyche Engine sidecar — has been removed.
This is meant as a clean, minimal starting point to build something new on
top of.

## What's here

- **A 40-dimension affect vector.** Every tracked character carries 40
  feelings, updated after every reply:
  - **38 unipolar feelings** in `0…1`, where `0` is *absent* and `1` is
    *all-consuming*.
  - **2 bipolar axes** in `-1…1`: **valence** (energy/arousal) and **mood**
    (agreeableness).

  Stimulus is applied through a *saturating* transfer, so the same push
  moves a calm mind far more than an overwhelmed one — the extreme is
  asymptotically hard to reach. Between turns, present characters relax
  toward their baseline temperament (homeostasis).

- **An approval ledger (RPG-style).** Every character carries a durable
  **approval** of the player, −10000…+10000 (neutral 0), moved ±1–10 at a
  time by the mind engine when the player's actions align with — or cut
  against — the character's wishes. Unlike feelings it never decays.
  Graduated bands run from "mildly favorable/wary" through devoted/hostile
  up to "unshakeable bond"/"implacable enemy" at the pegged extremes.

- **It actually drives the reply.** The live emotional state of every
  present character is injected into the next generation (via a
  force-injected, content-overridden world-info entry), so the visible
  character *behaves the way they feel*. Disabled at rest: turn the
  extension off and nothing is injected.

- **A mind-update pass.** After each reply, one LLM tool-calling pass reads
  the transcript and nudges feelings (`apply_stimulus`, occasionally
  `set_emotion`/`set_baseline`) and approval (`adjust_approval`) for every
  present character, can introduce supporting characters the story brings
  in, can log something a character will specifically remember
  (`note_knowledge`), and can record a newly-established fact about who a
  character is (`update_canon`) — not on a quota, only when the current
  scene genuinely suggests an undiscovered detail worth recording. Framed
  as discovery, not inventory: the prompt is "given who they are and what's
  happening right now, what fine detail comes to mind that would make for
  compelling storytelling," not "fill in these categories of backstory."
  Once recorded a fact is permanent — extended, never contradicted — which
  is what keeps it from becoming a script: nothing in canon tells the
  writer what to make happen next, only who someone already is.

- **Every named character stays alive off-stage.** Each turn, every tracked
  character who isn't on-stage with the player still does something —
  a solitary beat, or a scene shared with another off-stage character —
  via a two-phase simulation: a cheap "casting" call decides who's alone and
  who's together, then one richly-contexted call per group writes it as a
  full scene — the same prose depth as an on-stage reply, not a summary
  line — and moves their emotions/approval. A character only ever
  acts on what's in their own `knowledge` log or current state — never the
  on-stage transcript — so they only know what they've witnessed or been
  told. On by default, toggleable and budget-tunable in settings — it favors
  depth (a dedicated call per character/group) over minimizing call count.

- **The Director (experimental).** Not a yes-man, and not a guess: unlike
  every other stage, the Director runs from a pre-generation prompt
  interceptor, *before* the reply is written, so it sees the player's actual
  incoming message rather than extrapolating from the last exchange. For
  each present character it reasons — at whatever thinking effort you
  configure, up to max — about their genuine inclinations, hard lines,
  where there's real room to negotiate, and whatever about them still isn't
  established and is fertile ground to invent (it can call `update_canon`/
  `note_knowledge` mid-thought). Its note is spliced directly into that
  specific generation's prompt, then discarded — nothing here is a stored
  goal a character keeps defending turn after turn. Uses a host hook whose
  timeout behavior is undocumented, so it fails open (falls back to the
  unmodified prompt on any error or timeout) and defaults **off**.

## Architecture

A Bun workspace with two parts:

| part | role |
|------|------|
| `packages/core` (`@psyche/core`) | pure logic, no host API, no network: the 40-emotion schema + saturation math (`affect.ts`), run-state types (`state.ts`), the approval ledger (`approval.ts`), the per-emotion behavioral rubrics (`rubrics.ts`), the live state→behavior directive renderer (`directive.ts`), the agent tool schemas + executors (`tools.ts`), the mind-update stage prompt (`prompts.ts`), the off-stage simulation stage (`offscreen.ts`), and the Director (`director.ts`). |
| `src/` (the plugin) | Lumiverse wiring: generation hooks, storage, the world-info injection interceptor, the Director's pre-generation prompt interceptor, and the frontend drawer. `runAgentForChat` in `backend.ts` runs two fail-soft post-hoc stages per turn — mind-update, then off-stage simulation — each with its own debug trace and settings toggle; the Director runs separately, pre-generation, registered via `spindle.registerInterceptor`. |

Plugin state is keyed by `chatId` under the extension's scoped storage
(`runs/<chatId>.json`).

## Build & test

```sh
bun install
bun test        # core invariants (affect math, approval bands, directive)
bun run build   # emits dist/backend.js and dist/frontend.js
```

The extension loads `dist/` (per `spindle.json`), **not** `src/` — always
rebuild before publishing.

## Settings

In the **Psyche** drawer tab: enable/disable, human texture (energy-matched
replies), off-stage simulation (on/off + event budget), the Director
(on/off, reasoning effort, timeout — experimental, off by default), engine
rounds per turn, decay rate, an optional engine directive (tone steering,
shared by mind update/off-stage sim/the Director), reset run, per-character
presence toggle, direct editing of every emotion value + approval, and a
per-character canon editor (read/write — the engine grows it, you can seed
or correct it too). The debug tab shows the raw request/response for each
turn's mind update, off-stage simulation, the Director, and the injected
directive.
