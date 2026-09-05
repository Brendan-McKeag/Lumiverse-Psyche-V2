import { EMOTIONS, genericScaleText } from './affect'
import type { CharacterState, RunState } from './state'
import { canonForInjection } from './state'
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

/* ------------------------- JSON extraction -------------------------- */
/* Used by any stage that gets a direct JSON response rather than driving the
 * tool-calling loop (currently: the offscreen simulation stage). */

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  if (start === -1) return null

  const end = raw.lastIndexOf('}')
  if (end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1))
    } catch {
      /* fall through to salvage */
    }
  }
  // A local model that hits its output limit truncates mid-string, and the
  // whole stage's work is then thrown away over a missing brace. Salvaging a
  // partial object recovers the fields that did arrive, which for a per-
  // character JSON contract is usually most of them.
  return salvageJson(raw.slice(start))
}

/**
 * Parse JSON that was cut off in flight: close whatever string and structures
 * were still open, discarding any dangling key with no value.
 */
export function salvageJson(s: string): unknown {
  /** What is still open at the end of a fragment. */
  const scan = (str: string) => {
    let inString = false
    let escaped = false
    const stack: string[] = []
    for (const ch of str) {
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === '{') stack.push('}')
      else if (ch === '[') stack.push(']')
      else if (ch === '}' || ch === ']') stack.pop()
    }
    return { inString, stack }
  }

  // Nothing left open means this was not a truncation, and repairing it would
  // be guessing at a different problem.
  if (!scan(s).stack.length) return null

  let body = s
  for (let attempt = 0; attempt < 6; attempt++) {
    const { inString, stack } = scan(body)
    if (!stack.length) break
    const candidate =
      `${(inString ? `${body}"` : body).replace(/[\s,]*$/, '').replace(/:\s*$/, ': null')}` +
      stack.slice().reverse().join('')
    try {
      return JSON.parse(candidate)
    } catch {
      // Rewind past the fragment that was still being written — the last
      // quoted run — then drop any container it had just opened, so a
      // half-started element does not survive as an empty object.
      const lastQuote = body.lastIndexOf('"', body.length - 2)
      if (lastQuote <= 0) break
      body = body
        .slice(0, lastQuote)
        .replace(/[\s,]*$/, '')
        .replace(/,?\s*[[{]\s*$/, '')
    }
  }
  return null
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
    'REACTIVE VS RELATIONAL. Not every feeling earns its intensity the same way.',
    'Physiological/in-the-moment states — sexual_arousal, desire, excitement,',
    'fear, anger — can legitimately spike hard within a single scene; that is',
    'how bodies and adrenaline actually work. RELATIONAL/attachment states —',
    'affection, adoration, trust, tenderness — are different: they represent',
    'earned emotional investment, not how intense a moment felt. A single',
    'scene, however physically or emotionally charged, should rarely push',
    'these past ~0.4-0.5 unless the characters have genuinely built history',
    'together (multiple meaningful exchanges, demonstrated reliability, real',
    'approval already earned) — chemistry is not the same as attachment, and a',
    'satisfying one-time encounter with someone just met is not grounds for',
    'adoration or worshipful trust. Let APPROVAL be your guide: a character',
    'whose approval of the player is still low or neutral has not earned the',
    'right to feel deeply attached, no matter how intense the moment was.',
    '',
    'Example: a satisfying casual hookup with someone just met might reasonably',
    'push sexual_arousal to ~0.7-0.8 and desire to ~0.5-0.6 that same scene —',
    'the body responding is real and immediate. But affection, adoration, and',
    'trust should stay low (~0.1-0.3) unless the story has independently built',
    'real emotional connection beyond the physical. If the card and the story',
    'so far give no reason to expect deep attachment, do not manufacture one',
    'just because the scene was intense.',
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
    '  • When something happens that a character would specifically remember or',
    '    could later act on (a promise, a threat, something told to them in',
    '    confidence, a plan made), note_knowledge it for them — this is what lets',
    '    them act sensibly off-stage later. Do not log routine scene description.',
    '  • GROW WHO THEY ARE (update_canon): given who this character already is',
    '    and what\'s actually happening in the story right now, does an',
    '    undiscovered fine detail come to mind — a habit, a memory, a piece of',
    '    history, a physical tell — that would make for compelling storytelling',
    '    and real character development? If so, record it. This is discovery,',
    '    not a checklist: invent only when the scene genuinely suggests',
    '    something, never to fill a quota every turn.',
    '  • Occasionally nudge a baseline (set_baseline) when a lasting change of',
    '    temperament is earned — not every turn.',
    '',
    'CANON IS LAW. Once a fact is recorded it is FIXED truth: never contradict',
    'or quietly retcon it — only extend it, or rarely reword without changing',
    'meaning. You may freely invent to fill blanks, but never contradict what',
    'the card states about the primary character, or anything already in canon.',
    '',
    'HONEST, NOT COMPLIANT. What the player says, wants, or implies about a',
    'character is a data point, never automatic truth. Before recording',
    'anything, weigh it against the card and everything that has actually',
    'happened in the story: does this genuinely fit who this character is, or',
    'would recording it just be going along with the player? When the honest',
    'read diverges from what was suggested or implied, canon should say so —',
    'including recording the opposite of what was implied (e.g. "despite',
    'seeming to enjoy X, they actually don\'t, and go along with it for other',
    'reasons") rather than silently accepting a flattering or convenient',
    'version. update_canon\'s "replace" mode can soften, qualify, or deepen an',
    'earlier entry once a truer picture emerges — that is refinement, not',
    'retconning, as long as it doesn\'t erase something the story has actually',
    'shown to be true (a demonstrated action, an established plot fact).',
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
    .map((c) => {
      const canon = canonForInjection(c.canon ?? '')
      return [
        `### ${c.id} — ${c.name} [${c.isPrimary ? 'primary' : 'supporting'}, ${c.present ? 'present' : 'off-scene'}]`,
        `approval of the player: ${c.approval ?? 0} (${describeApproval(c.approval ?? 0).label})`,
        `feelings: ${emotionSummary(c)}`,
        canon ? `established canon (do not contradict):\n${canon}` : 'established canon: (none yet)',
      ].join('\n')
    })
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
