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

- **A single mind-update pass.** After each reply, one LLM tool-calling
  pass reads the transcript and nudges feelings (`apply_stimulus`,
  occasionally `set_emotion`/`set_baseline`) and approval
  (`adjust_approval`) for every present character, and can introduce
  supporting characters the story brings in.

## Architecture

A Bun workspace with two parts:

| part | role |
|------|------|
| `packages/core` (`@psyche/core`) | pure logic, no host API, no network: the 40-emotion schema + saturation math (`affect.ts`), run-state types (`state.ts`), the approval ledger (`approval.ts`), the per-emotion behavioral rubrics (`rubrics.ts`), the live state→behavior directive renderer (`directive.ts`), the agent tool schemas + executors (`tools.ts`), and the mind-update stage prompt (`prompts.ts`). |
| `src/` (the plugin) | Lumiverse wiring: generation hooks, storage, the world-info injection interceptor, and the frontend drawer. |

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
replies), engine rounds per turn, decay rate, an optional engine directive
(tone steering), reroll/reset run, per-character presence toggle, and direct
editing of every emotion value + approval.
