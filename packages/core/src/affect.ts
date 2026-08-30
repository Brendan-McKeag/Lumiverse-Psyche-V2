/* ------------------------------------------------------------------ *
 * Psyche — the affect model
 *
 * A character's mind is a 40-dimension vector of named feelings.
 *
 *  - 38 of them are UNIPOLAR, in [0, 1]: 0 means the feeling is entirely
 *    absent, 1 means it is all-consuming and drives the character to
 *    extremes. `sexual_arousal` is one of these (this engine targets adult,
 *    Tapestries-style roleplay where arousal is a first-class mood).
 *
 *  - 2 of them are BIPOLAR, in [-1, 1]:
 *      • `valence` — the character's energy / psychological arousal. -1 is
 *        inert, drained, shut down; +1 is wired, activated, lit up.
 *      • `mood` — the character's agreeableness. -1 is hostile and
 *        contrary; +1 is warm and accommodating.
 *
 * NON-LINEARITY. As in real life, the closer a feeling is to its extreme,
 * the harder it is to push further. We model each axis with a hidden linear
 * "pressure" accumulator p and a saturating transfer to the displayed value:
 *
 *      unipolar:  value = 1 - e^(-p)        (p >= 0)
 *      bipolar:   value = tanh(p)
 *
 * Stimulus is applied as an additive nudge in pressure-space, so a fixed
 * push buys ever-smaller movement as the value saturates: getting from
 * 0.90 to 0.95 costs as much stimulus as getting from 0.00 to ~0.61. The
 * extreme is approached, effectively, asymptotically.
 * ------------------------------------------------------------------ */

export type AxisKind = 'unipolar' | 'bipolar'

export interface EmotionDef {
  /** stable storage key (snake_case) */
  key: string
  /** human label for the panel + prompts */
  label: string
  kind: AxisKind
  /** one-line anchor of what this feeling means, used in prompts + rubric */
  blurb: string
}

/* The two bipolar core axes the brief mandates, then 38 unipolar feelings
 * (including the mandated `sexual_arousal`). 40 total. The unipolar set is a
 * deliberately broad palette for character roleplay: bonding & desire, the
 * joy family, social standing & power dynamics, and the full negative range. */
export const EMOTIONS: EmotionDef[] = [
  // ── bipolar core ──────────────────────────────────────────────
  { key: 'valence', label: 'Valence (energy)', kind: 'bipolar', blurb: 'overall psychological energy/arousal: drained & inert at -1, wired & activated at +1' },
  { key: 'mood', label: 'Mood (agreeableness)', kind: 'bipolar', blurb: 'overall agreeableness: hostile & contrary at -1, warm & accommodating at +1' },

  // ── bonding & desire ──────────────────────────────────────────
  { key: 'affection', label: 'Affection', kind: 'unipolar', blurb: 'warm fondness and care toward someone' },
  { key: 'attraction', label: 'Attraction', kind: 'unipolar', blurb: 'romantic/physical pull toward someone' },
  { key: 'desire', label: 'Desire', kind: 'unipolar', blurb: 'wanting — to have, to be near, to claim (the craving, not the body state)' },
  { key: 'sexual_arousal', label: 'Sexual arousal', kind: 'unipolar', blurb: 'physical sexual arousal: the body responding, heat building' },
  { key: 'tenderness', label: 'Tenderness', kind: 'unipolar', blurb: 'gentle protective softness toward someone vulnerable' },
  { key: 'trust', label: 'Trust', kind: 'unipolar', blurb: 'felt safety and willingness to be open with someone' },
  { key: 'adoration', label: 'Adoration', kind: 'unipolar', blurb: 'reverent devotion; placing someone above oneself' },
  { key: 'gratitude', label: 'Gratitude', kind: 'unipolar', blurb: 'thankful appreciation for what another has done' },

  // ── joy family ────────────────────────────────────────────────
  { key: 'joy', label: 'Joy', kind: 'unipolar', blurb: 'bright happiness and delight in the moment' },
  { key: 'contentment', label: 'Contentment', kind: 'unipolar', blurb: 'settled, easy satisfaction; nothing lacking' },
  { key: 'excitement', label: 'Excitement', kind: 'unipolar', blurb: 'eager, keyed-up energy toward what is coming' },
  { key: 'amusement', label: 'Amusement', kind: 'unipolar', blurb: 'playful mirth; finding something funny' },
  { key: 'playfulness', label: 'Playfulness', kind: 'unipolar', blurb: 'teasing, mischievous willingness to play' },
  { key: 'curiosity', label: 'Curiosity', kind: 'unipolar', blurb: 'drawn to explore, learn, probe' },
  { key: 'hope', label: 'Hope', kind: 'unipolar', blurb: 'expectation that things may turn out well' },
  { key: 'confidence', label: 'Confidence', kind: 'unipolar', blurb: 'self-assurance; certainty in one\'s footing' },
  { key: 'pride', label: 'Pride', kind: 'unipolar', blurb: 'satisfaction in one\'s own worth or achievement' },

  // ── social standing & power dynamics ──────────────────────────
  { key: 'dominance', label: 'Dominance', kind: 'unipolar', blurb: 'drive to lead, control, take charge of the exchange' },
  { key: 'submission', label: 'Submission', kind: 'unipolar', blurb: 'pull to yield, defer, give over control' },
  { key: 'possessiveness', label: 'Possessiveness', kind: 'unipolar', blurb: 'wanting someone or something to be yours alone' },
  { key: 'defiance', label: 'Defiance', kind: 'unipolar', blurb: 'refusal to comply; pushing back against pressure' },

  // ── negative range ────────────────────────────────────────────
  { key: 'fear', label: 'Fear', kind: 'unipolar', blurb: 'acute alarm at present danger' },
  { key: 'anxiety', label: 'Anxiety', kind: 'unipolar', blurb: 'diffuse dread about what might happen' },
  { key: 'insecurity', label: 'Insecurity', kind: 'unipolar', blurb: 'doubt about one\'s own worth or standing' },
  { key: 'embarrassment', label: 'Embarrassment', kind: 'unipolar', blurb: 'flustered self-consciousness at being exposed' },
  { key: 'shame', label: 'Shame', kind: 'unipolar', blurb: 'painful sense of being fundamentally wrong or bad' },
  { key: 'guilt', label: 'Guilt', kind: 'unipolar', blurb: 'remorse over a specific harm one caused' },
  { key: 'sadness', label: 'Sadness', kind: 'unipolar', blurb: 'low, heavy sorrow' },
  { key: 'loneliness', label: 'Loneliness', kind: 'unipolar', blurb: 'ache of disconnection from others' },
  { key: 'grief', label: 'Grief', kind: 'unipolar', blurb: 'deep mourning over a loss' },
  { key: 'jealousy', label: 'Jealousy', kind: 'unipolar', blurb: 'fear of losing someone\'s regard to a rival' },
  { key: 'boredom', label: 'Boredom', kind: 'unipolar', blurb: 'restless, unstimulated flatness' },
  { key: 'fatigue', label: 'Fatigue', kind: 'unipolar', blurb: 'physical/emotional tiredness, depletion' },
  { key: 'anger', label: 'Anger', kind: 'unipolar', blurb: 'hot hostility at a wrong or obstacle' },
  { key: 'irritation', label: 'Irritation', kind: 'unipolar', blurb: 'low-grade annoyance, friction' },
  { key: 'frustration', label: 'Frustration', kind: 'unipolar', blurb: 'thwarted strain when blocked from a goal' },
  { key: 'contempt', label: 'Contempt', kind: 'unipolar', blurb: 'cold disdain; looking down on someone' },
  { key: 'disgust', label: 'Disgust', kind: 'unipolar', blurb: 'visceral revulsion, wanting distance' },
]

export const EMOTION_BY_KEY: Record<string, EmotionDef> = Object.fromEntries(
  EMOTIONS.map((e) => [e.key, e]),
)

export const EMOTION_KEYS = EMOTIONS.map((e) => e.key)

/* ----------------------- behavioral grouping ----------------------- */
/* How each unipolar feeling tends to move behavior, used to weave the injected
 * guidance into approach / guard / aggression / etc. rather than a flat list. */
export type BehaviorClass = 'approach' | 'guard' | 'down' | 'aggression' | 'assert' | 'yield' | 'other'

const BEHAVIOR_CLASS: Record<string, BehaviorClass> = {
  // drawn toward connection / engagement
  affection: 'approach', attraction: 'approach', desire: 'approach', sexual_arousal: 'approach',
  tenderness: 'approach', trust: 'approach', adoration: 'approach', gratitude: 'approach',
  joy: 'approach', contentment: 'approach', excitement: 'approach', amusement: 'approach',
  playfulness: 'approach', curiosity: 'approach', hope: 'approach', confidence: 'approach',
  pride: 'approach', possessiveness: 'approach',
  // braced, self-protective, shrinking
  fear: 'guard', anxiety: 'guard', insecurity: 'guard', embarrassment: 'guard', shame: 'guard', guilt: 'guard',
  // low, heavy, withdrawing
  sadness: 'down', loneliness: 'down', grief: 'down', boredom: 'down', fatigue: 'down',
  // pushing against, friction
  anger: 'aggression', irritation: 'aggression', frustration: 'aggression', jealousy: 'aggression',
  contempt: 'aggression', disgust: 'aggression', defiance: 'aggression',
  // power stance
  dominance: 'assert', submission: 'yield',
}

export function behaviorClass(key: string): BehaviorClass {
  return BEHAVIOR_CLASS[key] ?? 'other'
}

/* ----------------------- pressure <-> value ------------------------ */
// Largest magnitude we let a value reach, so atanh/-ln stay finite.
const VMAX = 0.9995

const clampUni = (v: number) => Math.max(0, Math.min(VMAX, v))
const clampBi = (v: number) => Math.max(-VMAX, Math.min(VMAX, v))

/** displayed value -> hidden pressure */
export function toPressure(def: EmotionDef, value: number): number {
  if (def.kind === 'bipolar') {
    const v = clampBi(value)
    return Math.atanh(v)
  }
  const v = clampUni(value)
  return -Math.log(1 - v)
}

/** hidden pressure -> displayed value */
export function fromPressure(def: EmotionDef, p: number): number {
  if (def.kind === 'bipolar') return clampBi(Math.tanh(p))
  return clampUni(1 - Math.exp(-p))
}

/*
 * How much a unit of `intensity` actually moves the hidden pressure. Kept well
 * below 1 so the extremes stay genuinely hard to reach: from rest, +1 lands
 * ~0.22, +2 ~0.39, +3 ~0.53, +5 ~0.71, and you need ~+9 of accumulated
 * intensity to cross 0.9. A pleasant first meeting (a +1 nudge) should leave a
 * character mildly curious, not overwhelmed.
 */
export const STIMULUS_GAIN = 0.25

/**
 * Apply a signed stimulus to a feeling and return the new value. `intensity`
 * is the raw strength of what happened (roughly: +1 a normal jolt, +3 a strong
 * blow, +6 a life-altering shock); it is scaled by STIMULUS_GAIN before being
 * added in pressure-space. Because pressure saturates, the same intensity moves
 * a calm character far more than an already-overwhelmed one — the asymptotic
 * difficulty near the extremes is automatic, and large/sustained pressure over
 * many turns is required to approach 1.0.
 */
export function applyStimulus(def: EmotionDef, current: number, intensity: number): number {
  return fromPressure(def, toPressure(def, current) + intensity * STIMULUS_GAIN)
}

/* Ceilings applied to seeded (raw-set) values so a brand-new run never opens
 * pegged near the extreme. A resting temperament is, by definition, not an
 * all-consuming state; the start of a scene is rarely a crisis. Genuine
 * extremes have to be EARNED through play, via stimulus. */
export const SEED_BASELINE_CEIL = 0.4
export const SEED_OPENING_CEIL = 0.55

/** Clamp a seeded value into the calibrated range for its axis + role. */
export function clampSeed(def: EmotionDef, value: number, role: 'baseline' | 'opening'): number {
  const ceil = role === 'baseline' ? SEED_BASELINE_CEIL : SEED_OPENING_CEIL
  if (def.kind === 'bipolar') {
    const m = Math.min(Math.abs(value), ceil)
    return value < 0 ? -m : m
  }
  return Math.max(0, Math.min(ceil, value))
}

/**
 * Relax a feeling toward its baseline by `rate` (0..1) of the pressure gap.
 * Homeostasis: spikes decay back toward the character's resting temperament
 * unless something keeps feeding them. Applied once per turn before the engine
 * reasons, so the model sees a mind that is already cooling down.
 */
export function relaxToward(def: EmotionDef, current: number, baseline: number, rate: number): number {
  const pc = toPressure(def, current)
  const pb = toPressure(def, baseline)
  return fromPressure(def, pc + Math.max(0, Math.min(1, rate)) * (pb - pc))
}

/* --------------------------- breakpoints --------------------------- */
/* The brief asks the meaning of each axis to be pinned at 0.25, 0.50, 0.75,
 * 0.80, 0.90, 0.95 and 1.00 (mirrored to the negatives on the bipolar axes).
 * These generic level descriptors apply to every feeling; per-emotion
 * behavioral rubrics (rubrics.ts, generated offline and checked in as data)
 * refine them once that module lands. */

export const UNIPOLAR_BREAKS = [0.25, 0.5, 0.75, 0.8, 0.9, 0.95, 1.0] as const
export const BIPOLAR_BREAKS = [0.25, 0.5, 0.75, 0.8, 0.9, 0.95, 1.0] as const

interface Level {
  at: number
  label: string
  meaning: string
}

const UNIPOLAR_LEVELS: Level[] = [
  { at: 0.0, label: 'absent', meaning: 'not felt at all; plays no part in behavior' },
  { at: 0.25, label: 'faint', meaning: 'a faint undercurrent, easily overridden by anything else' },
  { at: 0.5, label: 'present', meaning: 'clearly present and noticeable; colors word choice and tone' },
  { at: 0.75, label: 'strong', meaning: 'strong; actively shapes decisions and is hard to fully hide' },
  { at: 0.8, label: 'pronounced', meaning: 'pronounced; leaks into body language and breaks through composure' },
  { at: 0.9, label: 'intense', meaning: 'intense; dominates the moment and is very hard to mask' },
  { at: 0.95, label: 'overwhelming', meaning: 'overwhelming; crowds out competing feelings and reason' },
  { at: 1.0, label: 'all-consuming', meaning: 'all-consuming; drives the character to extremes, past restraint' },
]

/** Pole word pairs for the bipolar axes (negative pole, positive pole). */
const BIPOLAR_POLES: Record<string, { neg: string; pos: string }> = {
  valence: { neg: 'drained / inert / shut down', pos: 'wired / activated / lit up' },
  mood: { neg: 'hostile / contrary / cold', pos: 'warm / accommodating / open' },
}

const BIPOLAR_MAG: { at: number; label: string }[] = [
  { at: 0.0, label: 'neutral' },
  { at: 0.25, label: 'faintly' },
  { at: 0.5, label: 'clearly' },
  { at: 0.75, label: 'strongly' },
  { at: 0.8, label: 'pronouncedly' },
  { at: 0.9, label: 'intensely' },
  { at: 0.95, label: 'overwhelmingly' },
  { at: 1.0, label: 'totally' },
]

function nearestLevel<T extends { at: number }>(levels: T[], v: number): T {
  let best = levels[0]
  for (const l of levels) if (Math.abs(l.at - v) <= Math.abs(best.at - v)) best = l
  return best
}

/** A short descriptor of where a value sits on its axis, for panel + prompts. */
export function describeValue(def: EmotionDef, value: number): { label: string; meaning: string } {
  if (def.kind === 'bipolar') {
    const poles = BIPOLAR_POLES[def.key] ?? { neg: 'negative pole', pos: 'positive pole' }
    const mag = nearestLevel(BIPOLAR_MAG, Math.abs(value))
    if (mag.at === 0) return { label: 'neutral', meaning: `balanced between ${poles.neg} and ${poles.pos}` }
    const pole = value < 0 ? poles.neg : poles.pos
    return { label: `${mag.label} ${value < 0 ? '−' : '+'}`, meaning: `${mag.label} ${pole}` }
  }
  const lvl = nearestLevel(UNIPOLAR_LEVELS, value)
  return { label: lvl.label, meaning: lvl.meaning }
}

/** The generic level scale, rendered for the rubric/agent context. */
export function genericScaleText(): string {
  const uni = UNIPOLAR_LEVELS.map((l) => `  ${l.at.toFixed(2)} — ${l.label}: ${l.meaning}`).join('\n')
  const bip = BIPOLAR_MAG.filter((m) => m.at > 0)
    .map((m) => `  ±${m.at.toFixed(2)} — ${m.label} toward the signed pole`)
    .join('\n')
  return [
    'UNIPOLAR feelings (0..1), where 0 is absent and 1 is all-consuming:',
    uni,
    '',
    'BIPOLAR axes (valence, mood; -1..+1), magnitude meaning (sign picks the pole):',
    '  0.00 — neutral: balanced between the two poles',
    bip,
  ].join('\n')
}

/* --------------------------- defaults ------------------------------ */

/** A temperate resting mind: everything quiet, the bipolar axes centered. */
export function neutralVector(): Record<string, { value: number; baseline: number }> {
  const out: Record<string, { value: number; baseline: number }> = {}
  for (const e of EMOTIONS) {
    const v = e.kind === 'bipolar' ? 0 : 0.05
    out[e.key] = { value: v, baseline: v }
  }
  return out
}
