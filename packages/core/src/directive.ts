import { EMOTIONS, EMOTION_BY_KEY, EmotionDef, BehaviorClass, behaviorClass, describeValue } from './affect'
import type { CharacterState, RunState } from './state'
import { approvalLine } from './approval'
import { rubricFor } from './rubrics'

/* ----------------- live state -> injected directive ---------------- */
/*
 * The core output of the engine: a compact block describing how each present
 * character feels RIGHT NOW, injected into the reply generation so the
 * visible character actually behaves the emotion. Numbers are translated to
 * behavioral language; we never ask the model to recite a value.
 */

const SALIENT_UNI = 0.25 // unipolar feelings at/above this are worth mentioning

const v = (c: CharacterState, k: string) => c.emotions[k]?.value ?? 0

/** Salient unipolar feelings grouped by how they push behavior, strongest first. */
function groupedSalient(c: CharacterState): Record<BehaviorClass, { def: EmotionDef; value: number }[]> {
  const groups = {} as Record<BehaviorClass, { def: EmotionDef; value: number }[]>
  for (const def of EMOTIONS) {
    if (def.kind === 'bipolar') continue
    const val = v(c, def.key)
    if (val < SALIENT_UNI) continue
    const cls = behaviorClass(def.key)
    ;(groups[cls] ??= []).push({ def, value: val })
  }
  for (const k of Object.keys(groups) as BehaviorClass[]) groups[k].sort((a, b) => b.value - a.value)
  return groups
}

const fmtList = (rows: { def: EmotionDef; value: number }[]) =>
  rows
    .slice(0, 3)
    .map(({ def, value }) => `${def.label.toLowerCase().split(' (')[0]} (${describeValue(def, value).label})`)
    .join(', ')

/**
 * The behavioral anchor for the STRONGEST feeling in a group. Only the
 * leader carries its rubric: one concrete line per behavioral pull is a
 * signal, four of them would be a paragraph — and a paragraph is what
 * outweighs everything else in the prompt.
 */
const leadRubric = (rows: { def: EmotionDef; value: number }[]): string => {
  if (!rows.length) return ''
  const { def, value } = rows[0]
  const anchor = rubricFor(def, value)
  return anchor ? ` — ${anchor}` : ''
}

/** Opposing strong feelings that should read as visible inner conflict. */
function detectTensions(c: CharacterState): string[] {
  const out: string[] = []
  const approach = Math.max(v(c, 'affection'), v(c, 'attraction'), v(c, 'desire'), v(c, 'tenderness'), v(c, 'trust'))
  const guard = Math.max(v(c, 'fear'), v(c, 'anxiety'), v(c, 'insecurity'), v(c, 'shame'), v(c, 'embarrassment'))
  if (v(c, 'desire') >= 0.45 && v(c, 'shame') >= 0.4) out.push('wants what they feel they should not — desire fighting shame')
  else if (approach >= 0.45 && guard >= 0.4) out.push('drawn closer but braced to be hurt — approach, then retreat')
  if (v(c, 'anger') >= 0.45 && Math.max(v(c, 'affection'), v(c, 'tenderness')) >= 0.4)
    out.push('angry at someone they still care for — heat over a tender spot')
  if (v(c, 'dominance') >= 0.45 && v(c, 'submission') >= 0.4) out.push('torn between taking control and giving in')
  if (v(c, 'sexual_arousal') >= 0.5 && v(c, 'trust') < 0.3 && Math.max(v(c, 'fear'), v(c, 'anxiety')) >= 0.3)
    out.push('aroused but not safe — wary of their own wanting')
  return out.slice(0, 2)
}

/**
 * The deterministic, always-current grounding: energy + agreeableness, feelings
 * grouped by behavioral pull, the power stance, and any inner tensions. Recomputed
 * from live values on every injection, so manual edits take effect immediately.
 */
export function groundedReadout(c: CharacterState): string {
  const lines: string[] = []
  const valenceDef = EMOTION_BY_KEY['valence']
  const moodDef = EMOTION_BY_KEY['mood']
  const valenceAnchor = rubricFor(valenceDef, v(c, 'valence'))
  const moodAnchor = rubricFor(moodDef, v(c, 'mood'))
  lines.push(
    `  energy: ${describeValue(valenceDef, v(c, 'valence')).meaning}${valenceAnchor ? ` — ${valenceAnchor}` : ''}`,
  )
  lines.push(
    `  agreeableness: ${describeValue(moodDef, v(c, 'mood')).meaning}${moodAnchor ? ` — ${moodAnchor}` : ''}`,
  )

  const g = groupedSalient(c)
  if (g.approach?.length) lines.push(`  pulling them toward you: ${fmtList(g.approach)}${leadRubric(g.approach)}`)
  if (g.guard?.length) lines.push(`  holding back / wary: ${fmtList(g.guard)}${leadRubric(g.guard)}`)
  if (g.down?.length) lines.push(`  weighing them down: ${fmtList(g.down)}${leadRubric(g.down)}`)
  if (g.aggression?.length) lines.push(`  sharp edge / friction: ${fmtList(g.aggression)}${leadRubric(g.aggression)}`)

  const power: string[] = []
  if (v(c, 'dominance') >= SALIENT_UNI) power.push('wants to take charge')
  if (v(c, 'submission') >= SALIENT_UNI) power.push('inclined to yield, defer')
  if (power.length) lines.push(`  power: ${power.join('; ')}`)

  for (const t of detectTensions(c)) lines.push(`  tension: ${t}`)

  if (lines.length === 2) lines.push('  (emotionally quiet, even-keeled)')
  return lines.join('\n')
}

/* ------------------------ investment register ---------------------- */
/*
 * Read the live vector and say out loud how much this character is enjoying
 * the scene — and what that does to their initiative. Recomputed live like
 * groundedReadout, so manual edits bite immediately.
 */

export function investmentRegister(c: CharacterState): string {
  const spark = Math.max(v(c, 'joy'), v(c, 'excitement'), v(c, 'curiosity'), v(c, 'attraction'))
  const litUp = spark >= 0.45 && v(c, 'boredom') < 0.3 && v(c, 'mood') > 0
  if (litUp)
    return (
      'genuinely enjoying this — and it shows: they give more, build on what the' +
      ' player offers AND add their own, take risks, initiate. Their pleasure in' +
      ' the scene is visible in how they play it.'
    )
  const disinvested = v(c, 'boredom') >= 0.45 || (v(c, 'valence') <= -0.35 && v(c, 'mood') <= 0)
  if (disinvested)
    return (
      "not feeling it — and they don't fake it. They give less, redirect toward" +
      ' what THEY care about, or start winding the scene down. No service enthusiasm.'
    )
  return (
    'engaged but not yet won over — they participate, but their warmth and' +
    ' initiative must be earned.'
  )
}

/* ------------------------ delivery register ------------------------ */
/*
 * Energy-matched delivery: state-derived direction on how much the character
 * says and how much effort it carries — so a drained or sulking character
 * actually reads drained or sulking. Recomputed live per injection.
 */

export function deliveryRegister(c: CharacterState): string[] {
  const lines: string[] = []
  if (v(c, 'valence') <= -0.35 || v(c, 'fatigue') >= 0.5 || v(c, 'sadness') >= 0.55)
    lines.push(
      'running on empty — short, flat dialogue, minimal effort; they answer what' +
        ' they must and volunteer little. Narration may stay rich, but THEIR engagement shrinks.',
    )
  if (v(c, 'anger') >= 0.45 || v(c, 'irritation') >= 0.55)
    lines.push('clipped, interruptive speech; refuses to elaborate; ends lines early.')
  if (v(c, 'anxiety') >= 0.45 || v(c, 'insecurity') >= 0.5)
    lines.push('hedges, qualifies, trails off mid-thought; circles back to reassure or retract.')
  if (v(c, 'valence') <= -0.5 && v(c, 'mood') <= -0.2)
    lines.push(
      'disengaging — one-line answers are in character; they may try to wind the scene down or leave.',
    )
  if (v(c, 'valence') >= 0.5 && v(c, 'mood') >= 0.3)
    lines.push('lit up — quick, expansive, talkative; carries the scene.')
  return lines
}

type OverrideTier = 'intense' | 'overwhelming' | 'all-consuming'

/** The dominance tier of a feeling that should OVERRIDE normal characterization. */
function overrideTier(value: number, kind: EmotionDef['kind']): OverrideTier | null {
  const m = kind === 'bipolar' ? Math.abs(value) : value
  if (m >= 0.985) return 'all-consuming'
  if (m >= 0.93) return 'overwhelming'
  if (m >= 0.88) return 'intense'
  return null
}

/** The strongest override tier in play, or null. */
export function topOverrideTier(c: CharacterState): OverrideTier | null {
  let best: OverrideTier | null = null
  const rank = { intense: 1, overwhelming: 2, 'all-consuming': 3 } as const
  for (const def of EMOTIONS) {
    const t = overrideTier(v(c, def.key), def.kind)
    if (t && (!best || rank[t] > rank[best])) best = t
  }
  return best
}

/**
 * When a feeling reaches the top tiers it is not just "another item in the list"
 * — it seizes priority over composure. Returns '' when nothing is that high.
 */
export function overrideDirective(c: CharacterState): string {
  const rows = EMOTIONS.map((def) => ({ def, val: v(c, def.key), tier: overrideTier(v(c, def.key), def.kind) }))
    .filter((r) => r.tier)
    .sort((a, b) => Math.abs(b.val) - Math.abs(a.val))
  if (!rows.length) return ''

  const lines: string[] = [
    '‼ OVERRIDING STATE — this OUTRANKS composure. Play it at full force; do not',
    '   soften, balance, or "stay in character" against it:',
  ]
  for (const { def, val, tier } of rows) {
    const name = def.label.toLowerCase().split(' (')[0]
    const desc = describeValue(def, val).meaning
    if (tier === 'all-consuming') {
      lines.push(
        `  • ${name} is ALL-CONSUMING. It has wholly taken ${c.name} over. Drop their usual` +
          ` composure and restraint — right now they ARE this feeling and act on it past every` +
          ` limit, however out of character that is for who they usually are (${desc}).`,
      )
    } else if (tier === 'overwhelming') {
      lines.push(
        `  • ${name} is OVERWHELMING — it crowds out their other feelings and their judgment;` +
          ` composure is failing and it dictates what they do and say (${desc}).`,
      )
    } else {
      lines.push(
        `  • ${name} is INTENSE and dominating them — it breaks through composure and runs the` +
          ` moment (${desc}).`,
      )
    }
  }
  return lines.join('\n')
}

function characterBlock(c: CharacterState, humanTexture = true): string {
  const lines: string[] = []
  lines.push(`## ${c.name}${c.isPrimary ? '' : ' (supporting character)'}`)

  const override = overrideDirective(c)
  if (override) lines.push(override) // highest priority — placed first, before anything moderating

  lines.push('')
  lines.push('Underneath (embody — do not narrate or name any of this):')
  lines.push(groundedReadout(c))
  lines.push(`  ${approvalLine(c)}`)
  lines.push(`  investment in the scene: ${investmentRegister(c)}`)
  if (humanTexture) for (const d of deliveryRegister(c)) lines.push(`  delivery: ${d}`)

  return lines.join('\n')
}

/** Options for building the injected directive. All optional; defaults preserve prior behavior. */
export interface DirectiveOpts {
  /** energy-matched delivery lines; defaults on */
  humanTexture?: boolean
}

/**
 * Build the system block injected for the active reply. We always include the
 * primary and any present supporting characters so multi-character scenes stay
 * coherent. Returns null when there is nothing present (so we inject nothing).
 */
export function buildDirective(run: RunState, opts: DirectiveOpts = {}): string | null {
  const present = Object.values(run.characters).filter((c) => c.present)
  if (!present.length) return null
  present.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)) // primary first

  const humanTexture = opts.humanTexture !== false
  const blocks = present.map((c) => characterBlock(c, humanTexture)).join('\n\n')
  return [
    '[Psyche — emotional state]',
    'Each character below carries a live emotional state and an APPROVAL ledger —',
    "their accumulated, durable opinion of the player. High approval buys trust and",
    "willingness: they'll go along even when it cuts against their own preferences.",
    'Low approval means guardedness, pushback, refusal. It moves slowly; act the',
    'current level, do not leap ahead of it.',
    '',
    'EMBODIMENT: act their state through behavior — posture, tone, word choice, what',
    'they reach for and hold back; let stronger feelings break composure. Never',
    'recite, name, or mention any of these notes — just live them.',
    '',
    ...(humanTexture
      ? [
          'MATCH THEIR ENERGY: the length and effort of each character\'s dialogue must',
          'track their state, not a service standard. A drained, bored, or withdrawn',
          'character gives less — short lines, low effort — even while the surrounding',
          'narration stays vivid. An energized character gives more.',
          '',
        ]
      : []),
    'PRIORITY: if a character has an "OVERRIDING STATE", it dominates EVERYTHING else',
    'about them for this reply. Do not moderate it to keep them "composed"; at',
    'all-consuming intensity they break from their usual self and are wholly run by',
    'that feeling.',
    '',
    blocks,
  ].join('\n')
}
