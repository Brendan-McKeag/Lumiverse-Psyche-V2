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

- **The decision layer.** Right before each reply — from the same
  pre-generation interceptor as the Director, but cheap enough to be **on by
  default** — one small *typed* judgment call per present character answers
  a fixed set of bounded questions with probabilities rather than prose:
  what do they actually **do** with the player's move (comply / comply
  reluctantly / negotiate / stall / refuse / withdraw / escalate), does it
  brush a hard line, did the player materially change the terms, would they
  leave. The judgment comes from the model; the *move* is made in code:
  approval band biases the distribution (devoted characters lean toward
  yes, hostile ones toward no — enforced numerically, not by exhortation),
  a flagged hard line takes compliance off the table regardless of
  approval, last turn's stance is sticky unless the terms changed, and the
  final stance is **sampled** rather than argmaxed so a character can
  surprise you in proportion to how open the question really was. A narrow
  top-two margin is rendered as visible hesitation — the model's uncertainty
  becomes the character's. The result is one line per character spliced
  into that generation's prompt ("This turn, Mara says no, and holds it…"),
  then discarded. Two judges behind one interface: the engine model asked
  for probabilities as JSON (default, no new dependency, self-reported
  confidence), or the [Jev](https://thejevai.com) decision model
  (calibrated probabilities, sub-second) through OpenRouter, NanoGPT, or
  TypeSafe directly — it is not a chat model, so it has its own decisions
  endpoint that a Lumiverse connection can't reach; you paste that
  provider's API key into Psyche's settings (opt-in; scene text goes to
  that provider). Every failure path is "no stance this
  turn"; toggling it off restores the previous behavior exactly.

  **Tactics** go one step further: once the stance is chosen, the engine
  model — seeing the player's actual message — proposes a few specific ways
  *this* character might carry it out ("brings up the debt the player still
  owes"), each tagged with a kind (verbal, action, physical, leverage,
  social, withdrawal) and an intensity (light / firm / all in). Code then
  filters them: intensity is capped by how hot the character actually runs
  right now, physical moves need something physical in play, near-duplicates
  are dropped, and a few generic anchors plus an "other, in character"
  option are always added. The judge picks one; approval steers away from
  threats and leverage for characters who like you. The chosen move is
  appended to the stance line ("How: calls it out directly (firmly).").
  Generation only runs for the stance actually chosen, and has its own
  timeout — a slow or failed tactic never costs the stance.

## Architecture

A Bun workspace with two parts:

| part | role |
|------|------|
| `packages/core` (`@psyche/core`) | pure logic, no host API, no network: the 40-emotion schema + saturation math (`affect.ts`), run-state types (`state.ts`), the approval ledger (`approval.ts`), the per-emotion behavioral rubrics (`rubrics.ts`), the live state→behavior directive renderer (`directive.ts`), the agent tool schemas + executors (`tools.ts`), the mind-update stage prompt (`prompts.ts`), the off-stage simulation stage (`offscreen.ts`), the Director (`director.ts`), the decision layer — question sets, approval policy, stance resolution, and both judges' pure parsing (`decisions.ts`) — and tactics: generation prompt, plausibility filters, menu building and resolution (`tactics.ts`). |
| `src/` (the plugin) | Lumiverse wiring: generation hooks, storage, the world-info injection interceptor, the pre-generation prompt interceptor shared by the Director and the decision layer, the two judge transports (`judge.ts`: engine-model JSON or the Jev AI HTTP API), and the frontend drawer. `runAgentForChat` in `backend.ts` runs two fail-soft post-hoc stages per turn — mind-update, then off-stage simulation — each with its own debug trace and settings toggle; the Director runs separately, pre-generation, registered via `spindle.registerInterceptor`. |

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
(on/off, reasoning effort, timeout — experimental, off by default), the
decision layer (on/off, judge backend, provider + API key, stance
temperature, timeout, tactics on/off + timeout), engine
rounds per turn, decay rate, an optional engine directive (tone steering,
shared by mind update/off-stage sim/the Director), reset run, per-character
presence toggle, direct editing of every emotion value + approval, and a
per-character canon editor (read/write — the engine grows it, you can seed
or correct it too). The debug tab shows the raw request/response for each
turn's mind update, off-stage simulation, the decision layer (every judge
call plus the resolved distribution after policy), the Director, and the
injected directive.
