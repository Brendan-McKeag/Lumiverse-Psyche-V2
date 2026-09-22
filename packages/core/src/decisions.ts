import type { CharacterState } from './state'
import { canonForInjection } from './state'
import { approvalLine } from './approval'
import { groundedReadout, overrideDirective } from './directive'
import { AGENT_SENTINEL } from './prompts'

/* ------------------------------------------------------------------ *
 * Psyche (core) — the decision layer
 *
 * A "decision model" (in the Jev AI sense) answers a small set of TYPED,
 * BOUNDED questions about a state and returns probabilities, not prose.
 * Psyche uses it right before each reply to settle the one thing the prose
 * writer is worst at deciding for itself: what each present character
 * actually DOES with the player's move this turn — comply, negotiate,
 * stall, refuse, withdraw — and how sure they are about it.
 *
 * The judgment comes from the model; the MOVE is made here, in code:
 *   • approval biases the distribution (policy lives in application code,
 *     not in a prompt the prose model may or may not honor);
 *   • a hard line the model flags with high probability suppresses
 *     compliance regardless of approval;
 *   • the stance is SAMPLED from the adjusted distribution, not argmaxed,
 *     so a character can surprise you in proportion to how open the
 *     question genuinely was;
 *   • a narrow top-two margin becomes a visible "torn" cue — the model's
 *     uncertainty is rendered as the character's hesitation;
 *   • last turn's stance is sticky unless the player changed the terms.
 *
 * Everything here is pure: question sets, state rendering, distribution
 * math, output parsing for both transports, and the injected block. The
 * transports (an LLM asked for JSON, or the Jev HTTP API) live in the
 * plugin's src/judge.ts.
 * ------------------------------------------------------------------ */

/* ------------------------------- types ------------------------------ */

export type Question =
  | { kind: 'choice'; instructions: string; options: Record<string, string> }
  | { kind: 'score'; instructions: string; rubric: string[] }
  | { kind: 'noul'; instructions: string }

/** One answered question. `p` is the probability of `value` (1 when the
 *  transport could only give a point answer). `dist` is the full
 *  distribution when available (choice/score). For noul, `value` is
 *  'yes'/'no' and `p` is P(yes). */
export interface Decision {
  value: string
  p: number
  dist?: Record<string, number>
}

export interface Judge {
  classify(state: string, questions: Record<string, Question>, signal?: AbortSignal): Promise<Record<string, Decision>>
}

/* ------------------------------ stances ----------------------------- */

export const STANCES = ['comply', 'comply_reluctantly', 'negotiate', 'stall', 'refuse', 'withdraw', 'escalate'] as const
export type Stance = (typeof STANCES)[number]

export const STANCE_MEANING: Record<Stance, string> = {
  comply: 'goes along with what the player wants, willingly enough',
  comply_reluctantly: 'goes along with it, but it costs them and the reluctance shows',
  negotiate: 'does not simply give it — counters, sets terms, asks for something back',
  stall: 'neither yes nor no — deflects, delays, changes the subject, buys time',
  refuse: 'says no, and holds it',
  withdraw: 'pulls back — disengages, goes quiet, or moves to leave',
  escalate: 'pushes back harder than the moment asked for — raises the stakes',
}

/** How the stance reads on the page — a boundary and a compass, not a script. */
const STANCE_CUE: Record<Stance, string> = {
  comply: 'goes along with it — willingly. No manufactured friction.',
  comply_reluctantly: 'goes along with it, but the reluctance is visible; this costs them something and they let it show.',
  negotiate: "doesn't give it away — counters, sets terms, asks for something in return. What they'd take is theirs to name.",
  stall: 'neither yes nor no — deflects, delays, changes the subject, buys time. Do not resolve it this reply.',
  refuse: 'says no, and holds it. Not cruel by default, but not moved by pressure either.',
  withdraw: 'pulls back — disengages, goes quiet, or moves to end this. Less, not more.',
  escalate: 'pushes back harder than the moment asked for — raises the stakes rather than absorbing them.',
}

export const isStance = (s: unknown): s is Stance => typeof s === 'string' && (STANCES as readonly string[]).includes(s)

/* ---------------------------- question set --------------------------- */

export const Q_STANCE = 'stance'
export const Q_HARD_LINE = 'hard_line'
export const Q_CHANGED_TERMS = 'changed_terms'
export const Q_LEAVES = 'leaves'

export function turnQuestions(c: CharacterState): Record<string, Question> {
  return {
    [Q_STANCE]: {
      kind: 'choice',
      instructions:
        `What does ${c.name} actually DO with the player's latest move this turn — not what would keep the scene ` +
        `moving, not what the player wants, but what this specific person, feeling what they feel, with the ` +
        `standing the player has with them, would genuinely do?`,
      options: { ...STANCE_MEANING },
    },
    [Q_HARD_LINE]: {
      kind: 'noul',
      instructions:
        `Does the player's latest move ask ${c.name} to do, allow, or accept something they would flatly refuse ` +
        `no matter how much they like the player — a genuine hard line, given who they are?`,
    },
    [Q_CHANGED_TERMS]: {
      kind: 'noul',
      instructions:
        `Compared with the previous exchange, did the player materially change what is on the table for ${c.name} — ` +
        `a new offer, new information, a real concession, a real threat — rather than repeating or rephrasing the same ask?`,
    },
    [Q_LEAVES]: {
      kind: 'noul',
      instructions: `Would ${c.name}, as they are right now, end this conversation or leave the scene this turn?`,
    },
  }
}

/* ------------------------------ state ------------------------------- */

const SCENE_TAIL = 3500

/** The state a judge sees for ONE character: who they are, how they feel,
 *  what just happened, and what the player just did. Compact on purpose —
 *  a decision model is not a place to paste the whole story. */
export function decisionState(
  c: CharacterState,
  playerMessage: string,
  recentScene: string,
  cardContext: string,
): string {
  const canon = canonForInjection(c.canon ?? '', 1200)
  const override = overrideDirective(c)
  const prev = c.lastDecision
  return [
    `CHARACTER: ${c.name}${c.isPrimary ? ' (the card character)' : ' (supporting character)'}`,
    cardContext && c.isPrimary ? `CARD:\n${cardContext.slice(0, 2500)}` : null,
    canon ? `ESTABLISHED CANON:\n${canon}` : null,
    'CURRENT STATE:',
    `  ${approvalLine(c)}`,
    groundedReadout(c),
    override || null,
    prev ? `  last turn they chose to: ${prev.stance}${prev.torn ? ' (and were torn about it)' : ''}` : null,
    '',
    'RECENT SCENE (most recent last):',
    recentScene.trim().slice(-SCENE_TAIL) || '(the scene has just begun)',
    '',
    "THE PLAYER'S LATEST MOVE:",
    playerMessage.trim() || '(nothing yet — the scene is opening)',
  ]
    .filter((l): l is string => l !== null)
    .join('\n')
}

/* --------------------------- policy in code -------------------------- */

/** Multiplicative weights applied to the raw stance distribution by the
 *  character's approval band. This is the one place the "approval buys
 *  latitude" rule is enforced numerically rather than by exhortation. */
export function approvalWeights(approval: number): Partial<Record<Stance, number>> {
  const a = approval
  if (a >= 4000) return { comply: 1.8, comply_reluctantly: 1.3, refuse: 0.5, withdraw: 0.6, escalate: 0.5 }
  if (a >= 2000) return { comply: 1.4, comply_reluctantly: 1.15, refuse: 0.75, escalate: 0.8 }
  if (a >= 1000) return { comply: 1.15, refuse: 0.9 }
  if (a <= -4000) return { refuse: 1.8, escalate: 1.4, stall: 1.1, comply: 0.5, comply_reluctantly: 0.7 }
  if (a <= -2000) return { refuse: 1.4, stall: 1.2, negotiate: 1.1, comply: 0.75 }
  if (a <= -1000) return { refuse: 1.15, negotiate: 1.1, comply: 0.9 }
  return {}
}

export const HARD_LINE_THRESHOLD = 0.8
export const STICKY_WEIGHT = 1.5
export const TORN_MARGIN = 0.15
export const DEFAULT_RESOLVE_TEMPERATURE = 0.7

export interface ResolvedDecision {
  stance: Stance
  /** top-1 minus top-2 probability in the ADJUSTED distribution */
  margin: number
  torn: boolean
  /** the runner-up, for the torn cue */
  runnerUp: Stance
  /** P(hard line) as the judge saw it */
  hardLine: number
  /** P(leaves) as the judge saw it */
  leaves: number
  /** the adjusted, normalized distribution the stance was drawn from */
  dist: Record<Stance, number>
}

function normalize(d: Record<Stance, number>): Record<Stance, number> {
  let sum = 0
  for (const s of STANCES) sum += Math.max(0, d[s] ?? 0)
  const out = {} as Record<Stance, number>
  for (const s of STANCES) out[s] = sum > 0 ? Math.max(0, d[s] ?? 0) / sum : 1 / STANCES.length
  return out
}

/** A well-formed stance distribution from whatever the judge returned. A
 *  point answer becomes a peaked distribution; garbage becomes uniform. */
export function stanceDistribution(d: Decision | undefined): Record<Stance, number> {
  const out = {} as Record<Stance, number>
  for (const s of STANCES) out[s] = 0
  if (d?.dist) {
    for (const [k, v] of Object.entries(d.dist)) if (isStance(k) && Number.isFinite(v)) out[k] = Math.max(0, v)
  }
  const total = STANCES.reduce((acc, s) => acc + out[s], 0)
  if (total <= 0) {
    if (d && isStance(d.value)) {
      const p = Math.min(1, Math.max(0, d.p || 1))
      const rest = (1 - p) / (STANCES.length - 1)
      for (const s of STANCES) out[s] = s === d.value ? p : rest
    } else {
      for (const s of STANCES) out[s] = 1
    }
  }
  return normalize(out)
}

export function resolveStance(
  answers: Record<string, Decision>,
  c: CharacterState,
  opts: { temperature?: number; rng?: () => number } = {},
): ResolvedDecision {
  const temperature = opts.temperature ?? DEFAULT_RESOLVE_TEMPERATURE
  const rng = opts.rng ?? Math.random

  const raw = stanceDistribution(answers[Q_STANCE])
  const hardLine = clamp01(answers[Q_HARD_LINE]?.p ?? 0)
  const changedTerms = clamp01(answers[Q_CHANGED_TERMS]?.p ?? 0)
  const leaves = clamp01(answers[Q_LEAVES]?.p ?? 0)

  const adjusted = { ...raw }
  // 1. approval policy
  for (const [s, w] of Object.entries(approvalWeights(c.approval ?? 0))) adjusted[s as Stance] *= w as number
  // 2. hard lines are not for sale: a flagged hard line takes compliance off
  //    the table regardless of approval, and makes refusal the natural read
  if (hardLine >= HARD_LINE_THRESHOLD) {
    adjusted.comply *= 0.02
    adjusted.comply_reluctantly *= 0.2
    adjusted.refuse *= 1.5
  }
  // 3. stickiness: people don't flip because the player asked twice
  const prev = c.lastDecision?.stance
  if (prev && isStance(prev) && changedTerms < 0.5) adjusted[prev] *= STICKY_WEIGHT

  const dist = normalize(adjusted)
  const ranked = [...STANCES].sort((a, b) => dist[b] - dist[a])
  const margin = dist[ranked[0]] - dist[ranked[1]]

  const stance = temperature <= 0 ? ranked[0] : sample(dist, temperature, rng)
  const runnerUp = ranked[0] === stance ? ranked[1] : ranked[0]

  return { stance, margin, torn: margin < TORN_MARGIN, runnerUp, hardLine, leaves, dist }
}

function sample(dist: Record<Stance, number>, temperature: number, rng: () => number): Stance {
  const weights = STANCES.map((s) => Math.pow(dist[s], 1 / temperature))
  const total = weights.reduce((a, b) => a + b, 0)
  if (!(total > 0)) return STANCES[0]
  let r = rng() * total
  for (let i = 0; i < STANCES.length; i++) {
    r -= weights[i]
    if (r <= 0) return STANCES[i]
  }
  return STANCES[STANCES.length - 1]
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0)

/* ------------------------------ apply -------------------------------- */

export interface StoredDecision {
  stance: Stance
  margin: number
  torn: boolean
  hardLine: number
  leaves: number
  turnSeq: number
  at: number
}

/** Record this turn's decision on every present character (kept for
 *  stickiness next turn and for panel visibility); clears anyone who
 *  didn't get one so nothing stale drives a later turn. */
export function applyDecisions(present: CharacterState[], resolved: Record<string, ResolvedDecision>, turnSeq: number): void {
  const now = Date.now()
  for (const c of present) {
    const r = resolved[c.id]
    c.lastDecision = r
      ? { stance: r.stance, margin: r.margin, torn: r.torn, hardLine: r.hardLine, leaves: r.leaves, turnSeq, at: now }
      : undefined
  }
}

/* ------------------------------ render ------------------------------- */

export function stanceLine(c: CharacterState, r: ResolvedDecision): string {
  const parts: string[] = [`This turn, ${c.name} ${STANCE_CUE[r.stance]}`]
  if (r.torn) parts.push(`They are visibly torn between that and the pull to ${STANCE_MEANING[r.runnerUp]} — it can waver mid-reply.`)
  if (r.hardLine >= HARD_LINE_THRESHOLD) parts.push('What was asked brushes something they will not cross, and they know it.')
  else if (r.hardLine >= 0.5) parts.push('What was asked is close to a line for them.')
  if (r.leaves >= 0.75) parts.push('They are ready to end this or leave; let them, if the reply carries them there.')
  return parts.join(' ')
}

export function formatDecisionBlock(present: CharacterState[], resolved: Record<string, ResolvedDecision>): string | null {
  const rows = present.filter((c) => resolved[c.id])
  if (!rows.length) return null
  return [
    "[Psyche — each character's stance on the player's move this turn. This is what they DO",
    'with it, decided already; how it plays out on the page is yours. Never name or recite this.]',
    '',
    ...rows.map((c) => `## ${c.name}\n${stanceLine(c, resolved[c.id])}`),
  ].join('\n\n')
}

/* ------------------------- transport: LLM-as-judge ------------------- */
/* An ordinary chat model asked for probabilities as JSON. Self-reported
 * probabilities are not calibrated, so the "torn" cue is a heuristic on
 * this transport; the Jev transport below gives real ones. */

export function llmJudgeSystemPrompt(): string {
  return [
    AGENT_SENTINEL,
    'You are a decision model. You do not write prose, explain, or roleplay. You read a',
    'state and answer a fixed set of typed questions about it with PROBABILITIES.',
    '',
    'For a "choice" question, return a probability for EVERY option, summing to 1 — your',
    'honest distribution over what this person would do, not a one-hot pick. If it is',
    'genuinely close, say so with close numbers. For a "noul" (yes/no) question, return',
    'a single probability of YES in 0..1.',
    '',
    'Judge the character honestly from their card, canon, current feelings, and standing',
    'with the player. The player wanting something is evidence about the player, not',
    'about what the character will do.',
    '',
    'Return ONLY a JSON object keyed by question id. Example shape:',
    '{ "stance": { "comply": 0.1, "refuse": 0.6, ... }, "hard_line": 0.85 }',
  ].join('\n')
}

export function llmJudgeUserContent(state: string, questions: Record<string, Question>): string {
  const qs = Object.entries(questions).map(([id, q]) => {
    if (q.kind === 'choice') {
      const opts = Object.entries(q.options)
        .map(([k, desc]) => `      ${k}: ${desc}`)
        .join('\n')
      return `  ${id} (choice — a probability for each option):\n    ${q.instructions}\n    options:\n${opts}`
    }
    if (q.kind === 'score') return `  ${id} (score — a probability for each level, in order ${q.rubric.join(' < ')}):\n    ${q.instructions}`
    return `  ${id} (yes/no — a single probability of YES):\n    ${q.instructions}`
  })
  return ['STATE:', '"""', state, '"""', '', 'QUESTIONS:', ...qs, '', 'Return only the JSON.'].join('\n')
}

/** Parse the LLM judge's JSON into decisions. Tolerant: a bare option
 *  string, a {"choice": "x"} object, or a full distribution all work. */
export function parseLlmJudgeOutput(raw: unknown, questions: Record<string, Question>): Record<string, Decision> {
  const out: Record<string, Decision> = {}
  if (!raw || typeof raw !== 'object') return out
  const o = raw as Record<string, unknown>
  for (const [id, q] of Object.entries(questions)) {
    const v = o[id]
    if (v === undefined || v === null) continue
    if (q.kind === 'noul') {
      const p = noulProbability(v)
      if (p !== null) out[id] = { value: p >= 0.5 ? 'yes' : 'no', p }
      continue
    }
    const keys = q.kind === 'choice' ? Object.keys(q.options) : q.rubric
    const d = distributionFrom(v, keys)
    if (d) {
      const best = keys.reduce((a, b) => (d[b] > d[a] ? b : a), keys[0])
      out[id] = { value: best, p: d[best], dist: d }
    }
  }
  return out
}

function noulProbability(v: unknown): number | null {
  if (typeof v === 'number') return clamp01(v)
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'string') {
    const n = Number(v)
    if (Number.isFinite(n)) return clamp01(n)
    const s = v.trim().toLowerCase()
    if (s === 'yes' || s === 'true') return 1
    if (s === 'no' || s === 'false') return 0
    return null
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['p', 'probability', 'yes', 'noul', 'value']) {
      const p = noulProbability(o[k])
      if (p !== null) return p
    }
  }
  return null
}

function distributionFrom(v: unknown, keys: string[]): Record<string, number> | null {
  const out: Record<string, number> = {}
  for (const k of keys) out[k] = 0
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (!keys.includes(s)) return null
    out[s] = 1
    return out
  }
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const nested = o.probabilities ?? o.dist ?? o.distribution
  if (nested && typeof nested === 'object') return distributionFrom(nested, keys)
  let any = false
  for (const k of keys) {
    const n = o[k]
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) {
      out[k] = n
      any = true
    }
  }
  if (any) {
    const sum = keys.reduce((a, k) => a + out[k], 0)
    if (sum > 0) for (const k of keys) out[k] /= sum
    return out
  }
  const pick = o.choice ?? o.value ?? o.answer
  if (typeof pick === 'string' && keys.includes(pick.trim().toLowerCase())) {
    const p = typeof o.p === 'number' ? clamp01(o.p) : typeof o.confidence === 'number' ? clamp01(o.confidence) : 1
    const rest = keys.length > 1 ? (1 - p) / (keys.length - 1) : 0
    for (const k of keys) out[k] = k === pick.trim().toLowerCase() ? p : rest
    return out
  }
  return null
}

/* --------------------------- transport: Jev AI ----------------------- */
/* https://thejevai.com/docs — POST /v1/systemone with { state, model,
 * questions }, answers come back keyed by question id. */

export const JEV_ENDPOINT = 'https://thejevai.com/v1/systemone'
export const JEV_MODEL = 'jev-latest'

export function jevRequestBody(state: string, questions: Record<string, Question>): Record<string, unknown> {
  const q: Record<string, unknown> = {}
  for (const [id, def] of Object.entries(questions)) {
    if (def.kind === 'choice') q[id] = { type: 'choice', instructions: def.instructions, criteria: def.options }
    else if (def.kind === 'score') q[id] = { type: 'score', instructions: def.instructions, criteria: def.rubric }
    else q[id] = { type: 'noul', instructions: def.instructions }
  }
  return { state, model: JEV_MODEL, questions: q }
}

export function parseJevResponse(raw: unknown, questions: Record<string, Question>): Record<string, Decision> {
  const out: Record<string, Decision> = {}
  const answers = (raw as { answers?: unknown } | null)?.answers
  if (!answers || typeof answers !== 'object') return out
  const a = answers as Record<string, Record<string, unknown>>
  for (const [id, q] of Object.entries(questions)) {
    const ans = a[id]
    if (!ans || typeof ans !== 'object') continue
    if (q.kind === 'noul') {
      const p = noulProbability(ans.noul)
      if (p !== null) out[id] = { value: p >= 0.5 ? 'yes' : 'no', p }
      continue
    }
    const keys = q.kind === 'choice' ? Object.keys(q.options) : q.rubric
    const dist = distributionFrom(ans.probabilities, keys)
    const picked = q.kind === 'choice' ? ans.choice : ans.score
    const value =
      typeof picked === 'string' && keys.includes(picked) ? picked
      : typeof picked === 'number' && keys[picked] ? keys[picked]
      : dist ? keys.reduce((x, y) => (dist[y] > dist[x] ? y : x), keys[0]) : null
    if (!value) continue
    const p = dist ? dist[value] : typeof ans.confidence === 'number' ? clamp01(ans.confidence) : 1
    out[id] = { value, p, ...(dist ? { dist } : {}) }
  }
  return out
}

/* ------------------------------ debug -------------------------------- */

export function describeResolved(r: ResolvedDecision): string {
  const dist = STANCES.map((s) => `${s} ${(r.dist[s] * 100).toFixed(0)}%`).join(', ')
  return (
    `${r.stance}${r.torn ? ' (torn vs ' + r.runnerUp + ')' : ''} · margin ${r.margin.toFixed(2)}` +
    ` · hard line ${(r.hardLine * 100).toFixed(0)}% · leaves ${(r.leaves * 100).toFixed(0)}%\n    dist: ${dist}`
  )
}
