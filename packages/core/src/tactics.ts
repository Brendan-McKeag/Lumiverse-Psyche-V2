import type { CharacterState } from './state'
import type { Decision, Question, Stance } from './decisions'
import { STANCE_MEANING, TORN_MARGIN } from './decisions'
import { topOverrideTier } from './directive'
import { AGENT_SENTINEL } from './prompts'

/* ------------------------------------------------------------------ *
 * Psyche (core) — tactics: HOW a character carries out their stance
 *
 * The stance says WHAT they do with the player's move (escalate, negotiate,
 * stall…). Tactics say HOW, and the work is split by what each model is
 * good at:
 *
 *   1. GENERATE — the chat model, seeing the player's actual message and the
 *      chosen stance, proposes a handful of specific ways THIS character
 *      might carry it out, each tagged with a kind and an intensity.
 *   2. FILTER — code drops what isn't plausible for how they feel right now
 *      (intensity above what their emotional heat supports; physical moves
 *      with nothing physical in play), dedupes near-repeats, and always adds
 *      a few generic anchors plus an "other, in character" escape hatch.
 *   3. DECIDE — the judge (Jev, or the chat model as fallback) picks one
 *      option with probabilities; code applies approval weighting, samples,
 *      and marks a near-tie as wavering.
 *
 * Every step degrades gracefully: no generated options → anchors only; no
 * tactic answer → the stance still goes out on its own.
 * ------------------------------------------------------------------ */

/* ------------------------------ types ------------------------------- */

export const TACTIC_KINDS = ['verbal', 'action', 'physical', 'leverage', 'social', 'withdrawal', 'other'] as const
export type TacticKind = (typeof TACTIC_KINDS)[number]
const isKind = (s: unknown): s is TacticKind => typeof s === 'string' && (TACTIC_KINDS as readonly string[]).includes(s)

export type Intensity = 1 | 2 | 3

export interface TacticOption {
  /** stable key sent to the judge ('g1', 'a2', 'other') */
  id: string
  /** a kind of move, one short phrase — never dialogue */
  text: string
  kind: TacticKind
  intensity: Intensity
  source: 'generated' | 'anchor' | 'other'
}

export const INTENSITY_WORD: Record<Intensity, string> = { 1: 'lightly', 2: 'firmly', 3: 'all in' }

export const MAX_GENERATED = 5
const TEXT_CAP = 140

/* ----------------------------- anchors ------------------------------ */
/* Generic moves that are always on the table, so the judge has a sensible
 * choice even when generation failed or offered nothing that fits. */

const A = (text: string, kind: TacticKind, intensity: Intensity) => ({ text, kind, intensity })

export const TACTIC_ANCHORS: Record<Stance, { text: string; kind: TacticKind; intensity: Intensity }[]> = {
  comply: [A('goes along with it simply, no fuss', 'verbal', 1), A('goes along and adds something of their own', 'action', 2)],
  comply_reluctantly: [
    A('sets a condition before agreeing', 'verbal', 1),
    A('does it, but only the bare minimum', 'action', 1),
    A('does it while making the cost plain', 'verbal', 2),
  ],
  negotiate: [
    A('asks for something in return', 'verbal', 1),
    A('counters with a smaller version of the ask', 'verbal', 1),
    A('names their terms and holds them', 'verbal', 2),
  ],
  stall: [A('deflects with humor', 'verbal', 1), A('changes the subject', 'verbal', 1), A('answers with a question of their own', 'verbal', 1)],
  refuse: [A('a plain no, no explanation', 'verbal', 1), A('no, with their reason', 'verbal', 1), A('no, and a warning not to ask again', 'verbal', 2)],
  withdraw: [A('goes quiet and gives little', 'withdrawal', 1), A('cuts the conversation short', 'withdrawal', 2), A('gets up and leaves', 'withdrawal', 3)],
  escalate: [A('sharpens their words', 'verbal', 1), A('calls it out directly', 'verbal', 2), A('issues an ultimatum', 'leverage', 3)],
}

export const OTHER_OPTION: TacticOption = {
  id: 'other',
  text: 'something else entirely, true to who they are',
  kind: 'other',
  intensity: 1,
  source: 'other',
}

/* --------------------------- generation ----------------------------- */

export function tacticGenSystemPrompt(directive = ''): string {
  return [
    AGENT_SENTINEL,
    'You propose options. You do not write the scene, and you do not decide.',
    '',
    'A character has already decided WHAT to do with the player\'s latest move (their',
    'stance is given below). List distinct ways THIS specific character might carry it',
    'out right now — drawn from who they are, their canon, how they feel, their history',
    'with the player, and what the player just said. Another model will pick one.',
    '',
    'RULES:',
    `  • 3 to ${MAX_GENERATED} options, each a genuinely different move — not rewordings of one idea.`,
    '  • SPREAD: at least one light option (intensity 1) and at least one stronger one',
    '    (2 or 3); and not all the same kind.',
    '  • Each option is ONE short phrase naming a kind of move (e.g. "brings up the debt',
    '    the player still owes her"). Never dialogue, never a script, never an outcome.',
    '  • Be specific to this character and this moment where you can — that is the whole',
    '    point of asking you instead of using a generic list.',
    '  • Never decide what the player does, and never resolve the plot.',
    '',
    'Tag each option:',
    '  kind: verbal | action | physical | leverage | social | withdrawal',
    '    (physical = bodily contact or intimidation; leverage = threats, secrets, debts,',
    '    ultimatums; social = involving other people or reputation)',
    '  intensity: 1 light · 2 firm · 3 all in',
    '',
    'Return ONLY JSON: { "options": [ { "text": "...", "kind": "...", "intensity": 1 } ] }',
    directive.trim() ? `\nOPERATOR DIRECTIVE:\n${directive.trim()}` : '',
  ].join('\n')
}

export function tacticGenUserContent(state: string, c: CharacterState, stance: Stance): string {
  return [
    'STATE:',
    '"""',
    state,
    '"""',
    '',
    `${c.name.toUpperCase()}'S STANCE THIS TURN: ${stance} — ${STANCE_MEANING[stance]}`,
    '',
    `How might ${c.name} carry that out? Return only the JSON.`,
  ].join('\n')
}

/** Parse generated options: validate tags, cap text, drop near-duplicates. */
export function parseGeneratedTactics(raw: unknown): { text: string; kind: TacticKind; intensity: Intensity }[] {
  const o = raw as { options?: unknown } | null
  const list = Array.isArray(o?.options) ? (o!.options as unknown[]) : Array.isArray(raw) ? (raw as unknown[]) : []
  const out: { text: string; kind: TacticKind; intensity: Intensity }[] = []
  for (const item of list) {
    const it = (typeof item === 'string' ? { text: item } : item) as { text?: unknown; kind?: unknown; intensity?: unknown }
    const text = typeof it?.text === 'string' ? it.text.trim().replace(/\s+/g, ' ').slice(0, TEXT_CAP) : ''
    if (!text) continue
    const kind: TacticKind = isKind(it.kind) && it.kind !== 'other' ? it.kind : 'verbal'
    const n = typeof it.intensity === 'number' ? Math.round(it.intensity) : Number(it.intensity)
    const intensity = (Number.isFinite(n) ? Math.max(1, Math.min(3, n)) : 2) as Intensity
    if (out.some((x) => similar(x.text, text))) continue
    out.push({ text, kind, intensity })
    if (out.length >= MAX_GENERATED) break
  }
  return out
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  )

/** Token-overlap similarity; ≥0.7 counts as the same idea reworded. */
export function similar(a: string, b: string): boolean {
  const A = words(a)
  const B = words(b)
  if (!A.size || !B.size) return a.trim().toLowerCase() === b.trim().toLowerCase()
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  return inter / (A.size + B.size - inter) >= 0.7
}

/* ----------------------------- policy ------------------------------- */

const val = (c: CharacterState, k: string) => c.emotions[k]?.value ?? 0

/** Feelings that fuel a forceful move. */
const HEAT_KEYS = [
  'anger', 'irritation', 'frustration', 'contempt', 'disgust', 'jealousy', 'defiance',
  'fear', 'anxiety', 'shame', 'embarrassment',
  'desire', 'sexual_arousal', 'possessiveness', 'excitement', 'dominance',
  'sadness', 'grief', 'fatigue', 'boredom',
]

/** Feelings that make a physical move plausible at all. */
const PHYSICAL_KEYS = ['anger', 'fear', 'dominance', 'desire', 'sexual_arousal', 'attraction', 'affection', 'tenderness', 'possessiveness', 'disgust']

export function emotionalHeat(c: CharacterState): number {
  return Math.max(0, ...HEAT_KEYS.map((k) => val(c, k)))
}

/** How forceful a move their current state can carry: light moves always,
 *  firm ones once something is clearly felt, all-in only when it runs hot —
 *  or when an overriding state has taken them over. */
export function intensityCap(c: CharacterState): Intensity {
  if (topOverrideTier(c)) return 3
  const heat = emotionalHeat(c)
  if (heat >= 0.7) return 3
  if (heat >= 0.4) return 2
  return 1
}

export function physicalAllowed(c: CharacterState): boolean {
  return !!topOverrideTier(c) || PHYSICAL_KEYS.some((k) => val(c, k) >= 0.5)
}

export interface TacticMenu {
  options: TacticOption[]
  /** what code filtered out, and why — for the debug trace */
  dropped: { text: string; why: string }[]
  cap: Intensity
}

/** Merge generated options with anchors, filter by plausibility, and add the
 *  escape hatch. Never returns an empty menu: intensity-1 anchors always pass. */
export function buildTacticMenu(
  c: CharacterState,
  stance: Stance,
  generated: { text: string; kind: TacticKind; intensity: Intensity }[],
): TacticMenu {
  const cap = intensityCap(c)
  const physical = physicalAllowed(c)
  const dropped: { text: string; why: string }[] = []
  const options: TacticOption[] = []

  const admit = (o: { text: string; kind: TacticKind; intensity: Intensity }, id: string, source: TacticOption['source']) => {
    if (o.intensity > cap) return dropped.push({ text: o.text, why: `intensity ${o.intensity} > cap ${cap}` })
    if (o.kind === 'physical' && !physical) return dropped.push({ text: o.text, why: 'physical, but nothing physical is in play' })
    if (options.some((x) => similar(x.text, o.text))) return dropped.push({ text: o.text, why: 'duplicate' })
    options.push({ ...o, id, source })
  }

  generated.forEach((o, i) => admit(o, `g${i + 1}`, 'generated'))
  TACTIC_ANCHORS[stance].forEach((o, i) => admit(o, `a${i + 1}`, 'anchor'))
  options.push(OTHER_OPTION)
  return { options, dropped, cap }
}

/* ----------------------------- decide ------------------------------- */

export const Q_TACTIC = 'tactic'

export function tacticQuestion(c: CharacterState, stance: Stance, menu: TacticMenu): Record<string, Question> {
  return {
    [Q_TACTIC]: {
      kind: 'choice',
      instructions:
        `${c.name} has decided to respond this way: ${STANCE_MEANING[stance]}. Given who they are, how they feel, ` +
        `and exactly what the player just did, which of these is how they would actually do it?`,
      options: Object.fromEntries(menu.options.map((o) => [o.id, o.text])),
    },
  }
}

/** Approval shapes HOW, not just WHAT: people who like you reach for words,
 *  not threats; people who hate you reach for leverage sooner. */
export function tacticWeights(approval: number, kind: TacticKind): number {
  if (kind === 'leverage') {
    if (approval >= 4000) return 0.25
    if (approval >= 2000) return 0.5
    if (approval <= -2000) return 1.3
  }
  if (kind === 'physical' && approval >= 4000) return 0.6
  return 1
}

export interface ResolvedTactic {
  option: TacticOption
  runnerUp: TacticOption | null
  margin: number
  torn: boolean
  dist: Record<string, number>
}

export function resolveTactic(
  answer: Decision | undefined,
  c: CharacterState,
  menu: TacticMenu,
  opts: { temperature?: number; rng?: () => number } = {},
): ResolvedTactic | null {
  if (!answer) return null
  const temperature = opts.temperature ?? 0.7
  const rng = opts.rng ?? Math.random
  const ids = menu.options.map((o) => o.id)

  const raw: Record<string, number> = {}
  for (const id of ids) raw[id] = 0
  if (answer.dist) for (const [k, v] of Object.entries(answer.dist)) if (k in raw && Number.isFinite(v)) raw[k] = Math.max(0, v)
  if (ids.every((id) => raw[id] === 0)) {
    if (!(answer.value in raw)) return null
    raw[answer.value] = 1
  }

  const byId = Object.fromEntries(menu.options.map((o) => [o.id, o]))
  const adjusted: Record<string, number> = {}
  for (const id of ids) adjusted[id] = raw[id] * tacticWeights(c.approval ?? 0, byId[id].kind)
  const sum = ids.reduce((a, id) => a + adjusted[id], 0)
  if (!(sum > 0)) return null
  const dist: Record<string, number> = {}
  for (const id of ids) dist[id] = adjusted[id] / sum

  const ranked = [...ids].sort((a, b) => dist[b] - dist[a])
  const margin = dist[ranked[0]] - (dist[ranked[1]] ?? 0)

  let chosen = ranked[0]
  if (temperature > 0) {
    const w = ids.map((id) => Math.pow(dist[id], 1 / temperature))
    const total = w.reduce((a, b) => a + b, 0)
    let r = rng() * total
    for (let i = 0; i < ids.length; i++) {
      r -= w[i]
      if (r <= 0) {
        chosen = ids[i]
        break
      }
    }
  }
  const runnerUpId = ranked[0] === chosen ? ranked[1] : ranked[0]
  return {
    option: byId[chosen],
    runnerUp: runnerUpId ? byId[runnerUpId] : null,
    margin,
    torn: margin < TORN_MARGIN,
    dist,
  }
}

/* ----------------------------- render ------------------------------- */

/** The "how" clause appended to the stance line. Empty for the escape hatch —
 *  "something else, in character" is the writer's call, not ours. */
export function tacticClause(t: ResolvedTactic | null | undefined): string {
  if (!t || t.option.kind === 'other') return ''
  let s = `How: ${t.option.text} (${INTENSITY_WORD[t.option.intensity]}).`
  if (t.torn && t.runnerUp && t.runnerUp.kind !== 'other') s += ` Half-tempted instead to ${t.runnerUp.text}.`
  return s
}

export function describeTactic(t: ResolvedTactic, menu: TacticMenu): string {
  const rows = menu.options
    .map((o) => `      ${o.id} [${o.source}, ${o.kind}, ${o.intensity}] ${(t.dist[o.id] * 100).toFixed(0)}% — ${o.text}`)
    .join('\n')
  const dropped = menu.dropped.length
    ? `\n    dropped by policy:\n${menu.dropped.map((d) => `      × ${d.text} (${d.why})`).join('\n')}`
    : ''
  return `  tactic: ${t.option.id} "${t.option.text}"${t.torn ? ' (torn)' : ''} · margin ${t.margin.toFixed(2)} · intensity cap ${menu.cap}\n${rows}${dropped}`
}
