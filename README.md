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
  in, and can log something a character will specifically remember
  (`note_knowledge`).

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

- **Not a yes-man.** A fresh, per-turn check on every present character:
  does the player's current message ask for something that cuts against who
  this character has shown themselves to be so far? If so, a short
  "Holding the line" note describes what they're not giving away and why —
  scaled by approval, so low approval biases toward real friction and high
  approval biases toward earned compliance. Deliberately **not** a
  persona/goals field: nothing here is stored past the turn that produced
  it, and every present character's note is either freshly written or
  explicitly cleared each turn, so a character can never get stuck
  defending a stale, re-injected checklist.

## Architecture

A Bun workspace with two parts:

| part | role |
|------|------|
| `packages/core` (`@psyche/core`) | pure logic, no host API, no network: the 40-emotion schema + saturation math (`affect.ts`), run-state types (`state.ts`), the approval ledger (`approval.ts`), the per-emotion behavioral rubrics (`rubrics.ts`), the live state→behavior directive renderer (`directive.ts`), the agent tool schemas + executors (`tools.ts`), the mind-update stage prompt (`prompts.ts`), the off-stage simulation stage (`offscreen.ts`), and the ephemeral resistance/conflict-check stage (`resistance.ts`). |
| `src/` (the plugin) | Lumiverse wiring: generation hooks, storage, the world-info injection interceptor, and the frontend drawer. `runAgentForChat` in `backend.ts` runs two fail-soft stages per turn — mind-update, then off-stage simulation — each with its own debug trace and settings toggle, so future stages (a pacing "director," milestone-triggered character-card evolution) can slot in the same way. |

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
replies), off-stage simulation (on/off + event budget), self-interested
resistance (on/off), engine rounds per turn, decay rate, an optional engine
directive (tone steering), reset run, per-character presence toggle, and
direct editing of every emotion value + approval. The debug tab shows the
raw request/response for each turn's mind update, off-stage simulation,
resistance check, and injected directive.
