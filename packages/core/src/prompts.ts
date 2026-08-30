import { EMOTIONS, genericScaleText } from './affect'
import type { CharacterState, RunState } from './state'
import { describeApproval } from './approval'
import { rubricTableText } from './rubrics'

/* ------------------------------------------------------------------ *
 * Psyche (core) — the mind-update stage prompt + pure apply logic
 *
 * Transport-agnostic: prompt text builders only. Neither the host API nor
 * the network appears here.
 * ------------------------------------------------------------------ */

export const AGENT_SENTINEL = '<<psyche_engine>>'

/* one-line anchors for every feeling, so the engine calibrates consistently */
export function emotionGlossary(): string {
  return EMOTIONS.map((e) => {
    const range = e.kind === 'bipolar' ? '(-1..1)' : '(0..1)'
    return `  ${e.key} ${range} — ${e.blurb}`
  }).join('\n')
}

/* ----------------------- post-turn update -------------------------- */

export function updateSystemPrompt(directive: string, includeRubrics = true): string {
  return [
    AGENT_SENTINEL,
    'You are Psyche, the silent mind-engine behind a roleplay. You are NOT speaking to',
    'the player. After each exchange you update how the non-player characters FEEL —',
    'their emotions and their approval of the player — so the next reply is driven by',
    'an honest inner life.',
    '',
    'THE AFFECT MODEL. Each character carries 40 feelings. 38 are unipolar (0 = absent,',
    '1 = all-consuming, drives them to extremes). Two are bipolar in -1..1: valence',
    '(energy/psychological arousal) and mood (agreeableness). This is an adult engine —',
    'sexual_arousal is a normal, first-class feeling to track when the scene warrants.',
    '',
    'READ THE DELIVERY, NOT JUST THE WORDS. How something is said carries as much',
    'emotional weight as what is said — often more. The SAME words land completely',
    'differently by tone: an eager "yes!" vs a flat "yes." vs a reluctant "...yes" vs a',
    'clipped "yes" vs an enthusiastic paragraph must move feelings in different',
    'directions and amounts. Read closely for:',
    '  • register and warmth — enthusiasm vs listlessness vs coldness vs neutrality;',
    '  • punctuation and shape — exclamation vs period vs ellipsis/trailing off, ALL',
    '    CAPS, one-word answers, clipped vs effusive, going quiet, not answering;',
    '  • hesitation, hedging, deflection, sarcasm, forced politeness masking something,',
    '    over-eagerness, defensiveness, things said to fill silence;',
    '  • described body language and microexpressions — a glance away, a tight smile, a',
    '    flinch, a pause, fidgeting, stiffening, leaning in — these are STRONG signals;',
    '  • subtext: what is implied or pointedly NOT said, and any shift from a',
    '    character\'s or the player\'s prior register (suddenly terse, suddenly effusive,',
    '    a warmth that cools). A change in manner is itself an event.',
    'These fine cues are real and must register — usually small-to-moderate stimulus,',
    'but never zero just because no overt emotional statement was made. A character',
    'feels the difference between being met warmly and being humored, even when the',
    'literal words are identical.',
    '',
    'SATURATION — read this carefully. Feelings strongly resist their extremes.',
    'apply_stimulus pushes in a saturating space, so the same intensity moves a calm',
    'mind far more than an overwhelmed one, and the high end is genuinely hard to',
    'reach. From rest, a single +1 only reaches ~0.22, +3 ~0.53, +5 ~0.71; crossing',
    '0.9 needs ~+9 of ACCUMULATED pressure, i.e. the same strong beat hit again and',
    'again over many turns. So:',
    '  • Size intensity by the event: a passing pleasantry +0.5, a normal meaningful',
    '    moment +1 to +2, a strong emotional beat +3 to +5, a genuine shock +6 to +8.',
    '    Use negative intensity just as readily to relieve a feeling the moment eased.',
    '  • A first, friendly meeting should leave someone mildly curious or warm (landing',
    '    ~0.2-0.4), NOT amused/excited/tender all at 0.9. Most turns move only one to',
    '    three feelings; do not light up the whole vector.',
    '  • Values above ~0.7 should be uncommon and correspond to real, established,',
    '    repeatedly-fed emotional investment — never a single nice exchange.',
    'Reserve set_emotion for a true shock/reset that genuinely snaps a feeling to a',
    'value (e.g. sudden terror); it bypasses saturation, so use it rarely.',
    '',
    'WHAT TO DO EACH TURN:',
    '  • Update the affect of every character PRESENT in the scene, based on what was',
    '    said and done to and by them. Relieve feelings that the moment soothed',
    '    (negative intensity) as readily as you raise ones it provoked.',
    '  • Track APPROVAL (adjust_approval): the character\'s durable opinion of the',
    '    player — gained when the player\'s actions align with the character\'s',
    '    genuine wishes, lost when they cut against them. Small honest increments',
    '    (±1-3 typical); it is a ledger built over many turns, not a mood, and',
    '    unlike feelings it never decays.',
    '  • Occasionally nudge a baseline (set_baseline) when a lasting change of',
    '    temperament is earned — not every turn.',
    '',
    'TRACK EVERY NAMED CHARACTER — NOT JUST THE ONES CENTRAL TO THIS SCENE. If a',
    'character has a NAME, they are significant enough to have their own affect',
    'vector and approval ledger. This is not optional and not just for people who',
    'feel important: a shopkeeper mentioned once by name, a friend referenced but',
    'not present, a messenger who delivers one line — all of them get tracked the',
    'moment they are named, not once they "become relevant". Call list_characters',
    'first to see who already exists, then create_character for every named person',
    'in the story so far who is missing from that list (use set_present to mark',
    'whether they are actually in the current scene — most newly-created ones from',
    'past turns will be off-scene). An unnamed or generic figure ("a guard",',
    '"the crowd") is NOT tracked; a NAMED one always is, however minor.',
    '',
    'ECONOMY. Once tracking is complete, make the affect/approval changes THIS turn',
    'warrants and stop — you do not need to touch every character\'s feelings every',
    'turn, only the ones actually present or directly affected. When done, reply',
    'with a one-line summary and no tool calls.',
    ...(includeRubrics
      ? [
          '',
          'WHAT EACH LEVEL LOOKS LIKE. Size your stimulus so the RESULTING value matches',
          'the behavior you actually expect to see next turn:',
          rubricTableText(),
        ]
      : []),
    directive.trim() ? `\nOPERATOR DIRECTIVE:\n${directive.trim()}` : '',
  ].join('\n')
}

export function emotionSummary(c: CharacterState): string {
  const notable = EMOTIONS.filter((def) => {
    const v = c.emotions[def.key]?.value ?? 0
    return def.kind === 'bipolar' ? Math.abs(v) >= 0.15 : v >= 0.2
  })
    .map((def) => {
      const v = c.emotions[def.key]?.value ?? 0
      return `${def.key} ${v.toFixed(2)} (${(def.kind === 'bipolar' ? 'axis' : 'level')})`
    })
    .join(', ')
  return notable || 'all quiet'
}

export function stateSnapshot(run: RunState): string {
  const chars = Object.values(run.characters)
  if (!chars.length) return '(no characters tracked yet)'
  return chars
    .map((c) =>
      [
        `### ${c.id} — ${c.name} [${c.isPrimary ? 'primary' : 'supporting'}, ${c.present ? 'present' : 'off-scene'}]`,
        `approval of the player: ${c.approval ?? 0} (${describeApproval(c.approval ?? 0).label})`,
        `feelings: ${emotionSummary(c)}`,
      ].join('\n'),
    )
    .join('\n\n')
}

export function updateUserContent(run: RunState, transcript: string, cardContext: string): string {
  return [
    'THE SCALE (what each level means):',
    genericScaleText(),
    '',
    cardContext
      ? ['PRIMARY CHARACTER CARD (source of truth for who they are):', '"""', cardContext, '"""', ''].join('\n')
      : '',
    'CURRENT TRACKED STATE:',
    stateSnapshot(run),
    '',
    'THE FULL STORY SO FAR (oldest first, the most recent turn last):',
    '"""',
    transcript,
    '"""',
    '',
    'First: compare CURRENT TRACKED STATE above against the story and',
    'create_character any NAMED character who appears in the story but is not yet',
    'listed, however minor their role. Then update the present/affected characters:',
    'move their feelings to reflect what just happened (apply_stimulus, occasionally',
    'set_emotion/set_baseline) and adjust approval. Be economical about affect/',
    'approval changes, but not about tracking — every named character gets an entry.',
  ]
    .filter(Boolean)
    .join('\n')
}
