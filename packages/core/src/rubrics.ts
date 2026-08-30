import { EMOTION_BY_KEY, EMOTIONS, type EmotionDef } from './affect'

/* ------------------------------------------------------------------ *
 * Psyche — per-emotion behavioral rubrics
 *
 * The generic scale in affect.ts says what 0.75 means for ANY feeling
 * ("strong; actively shapes decisions and is hard to fully hide"). That is
 * enough to calibrate a number and useless for playing a person: strong anger
 * and strong shame produce opposite bodies in the same room. These anchors
 * say what each feeling actually LOOKS like at each level — observable
 * behavior, never an interior label — and are used twice:
 *
 *   1. in the mind-update prompt, so stimulus sizing is calibrated against
 *      concrete behavior rather than an abstract ladder;
 *   2. in the injected readout, where the strongest feeling in each
 *      behavioral group carries its anchor instead of a generic descriptor.
 *
 * Anchors are FLOOR semantics: the highest anchor at or below the current
 * value applies, and a value under the lowest anchor gets nothing (the
 * feeling is not yet worth describing). The top tiers (>= 0.88) are handled
 * by the OVERRIDING STATE block, which is deliberately far more forceful than
 * anything here — these anchors cover the 0.25–0.9 band where the generic
 * descriptors are blandest.
 *
 * Checked in as data on purpose. `bun run gen:rubrics` in engine/ regenerates
 * this file with a model of your choosing; review the diff before keeping it,
 * because these strings go straight into the prose writer's context.
 * ------------------------------------------------------------------ */

export interface RubricAnchor {
  /** applies from this value upward; negative entries are the bipolar low pole */
  at: number
  /** observable behavior at this level — what someone in the room would see */
  behavior: string
}

export const RUBRICS: Record<string, RubricAnchor[]> = {
  /* ── bipolar core: signed anchors, one set per pole ─────────────── */
  valence: [
    { at: -0.7, behavior: 'flat and depleted; moves only when they must, words rationed' },
    { at: -0.35, behavior: 'slower to answer, energy visibly banked' },
    { at: 0.35, behavior: 'quicker, more forward, leaning into the exchange' },
    { at: 0.7, behavior: 'wired; talks into the pauses, hands moving, hard to settle' },
  ],
  mood: [
    { at: -0.7, behavior: 'contrary on reflex; looks for the flaw in whatever is offered' },
    { at: -0.35, behavior: 'answers shortening, courtesy wearing thin' },
    { at: 0.35, behavior: 'warmer register; gives a little more than was asked for' },
    { at: 0.7, behavior: 'openly generous; meets them more than halfway, assumes the best' },
  ],

  /* ── bonding & desire ───────────────────────────────────────────── */
  affection: [
    { at: 0.25, behavior: 'a shade warmer with them than with anyone else present' },
    { at: 0.5, behavior: 'seeks small contact; remembers details about them unprompted' },
    { at: 0.75, behavior: 'protective; puts their comfort ahead of their own without comment' },
    { at: 0.9, behavior: 'openly tender, dropping guard they keep up for everyone else' },
  ],
  attraction: [
    { at: 0.25, behavior: 'eyes linger a beat past polite' },
    { at: 0.5, behavior: 'angles toward them, finds reasons to be near' },
    { at: 0.75, behavior: 'loses the thread mid-sentence; acutely aware of the distance between them' },
    { at: 0.9, behavior: 'barely tracking anything else in the room' },
  ],
  desire: [
    { at: 0.25, behavior: 'a want they would deny if asked directly' },
    { at: 0.5, behavior: 'steers toward what they want without naming it' },
    { at: 0.75, behavior: 'asks for it outright, or takes the opening the moment it appears' },
    { at: 0.9, behavior: 'single-minded; other considerations stop weighing anything' },
  ],
  sexual_arousal: [
    { at: 0.25, behavior: 'suddenly aware of their own body in a way they were not' },
    { at: 0.5, behavior: 'breath and posture shift; the voice drops a register' },
    { at: 0.75, behavior: 'touch-hungry; conversation is something to get through' },
    { at: 0.9, behavior: 'physical need running the moment, restraint visibly failing' },
  ],
  tenderness: [
    { at: 0.25, behavior: 'gentles their tone without deciding to' },
    { at: 0.5, behavior: 'careful with them, watching for where it hurts' },
    { at: 0.75, behavior: 'shields them; absorbs cost to spare them any' },
    { at: 0.9, behavior: 'undone by their vulnerability; would give anything asked' },
  ],
  trust: [
    { at: 0.25, behavior: 'stops double-checking the small things' },
    { at: 0.5, behavior: 'volunteers something they would not tell most people' },
    { at: 0.75, behavior: 'acts on their word alone, without verifying' },
    { at: 0.9, behavior: 'hands them what could ruin them, and does not brace' },
  ],
  adoration: [
    { at: 0.25, behavior: 'quotes them; defers on small points' },
    { at: 0.5, behavior: 'arranges their own position around what the other thinks' },
    { at: 0.75, behavior: 'measures their own worth by that person’s regard' },
    { at: 0.9, behavior: 'worshipful; the other’s judgment has replaced their own' },
  ],
  gratitude: [
    { at: 0.25, behavior: 'a warmer thank-you than the moment strictly required' },
    { at: 0.5, behavior: 'looks for a way to repay it, unprompted' },
    { at: 0.75, behavior: 'names the debt out loud and means it' },
    { at: 0.9, behavior: 'changed by it; will not forget who did this, ever' },
  ],

  /* ── joy family ─────────────────────────────────────────────────── */
  joy: [
    { at: 0.25, behavior: 'a smile that gets away from them' },
    { at: 0.5, behavior: 'lighter and quicker; laughs more easily than usual' },
    { at: 0.75, behavior: 'glowing; the mood spills onto everyone near them' },
    { at: 0.9, behavior: 'giddy and undignified, past caring how it looks' },
  ],
  contentment: [
    { at: 0.25, behavior: 'unhurried; nothing needs fixing right now' },
    { at: 0.5, behavior: 'settles in properly and stops watching the door' },
    { at: 0.75, behavior: 'deeply easy; would not trade this hour for anything' },
    { at: 0.9, behavior: 'so at peace that urgency itself feels foreign' },
  ],
  excitement: [
    { at: 0.25, behavior: 'slightly forward-leaning about what comes next' },
    { at: 0.5, behavior: 'talks faster, jumps ahead to the good part' },
    { at: 0.75, behavior: 'cannot sit still; pushes for it to happen now' },
    { at: 0.9, behavior: 'vibrating with it; patience gone entirely' },
  ],
  amusement: [
    { at: 0.25, behavior: 'the corner of the mouth twitches' },
    { at: 0.5, behavior: 'openly grinning and playing along' },
    { at: 0.75, behavior: 'laughing hard enough to lose composure' },
    { at: 0.9, behavior: 'helpless with it; cannot finish a sentence' },
  ],
  playfulness: [
    { at: 0.25, behavior: 'a small tease slipped in sideways' },
    { at: 0.5, behavior: 'provokes on purpose, to see what happens' },
    { at: 0.75, behavior: 'turns everything into a game; presses the buttons they find' },
    { at: 0.9, behavior: 'relentlessly mischievous, consequences be damned' },
  ],
  curiosity: [
    { at: 0.25, behavior: 'asks one more question than the moment needed' },
    { at: 0.5, behavior: 'digs; keeps circling back to the interesting thread' },
    { at: 0.75, behavior: 'abandons their own agenda to follow it' },
    { at: 0.9, behavior: 'consumed; must know, and will risk something to find out' },
  ],
  hope: [
    { at: 0.25, behavior: 'allows out loud that the good version might happen' },
    { at: 0.5, behavior: 'starts planning as though it will work' },
    { at: 0.75, behavior: 'invested in the outcome and guarding against doubt' },
    { at: 0.9, behavior: 'staked on it; the fall would be a long one' },
  ],
  confidence: [
    { at: 0.25, behavior: 'no hedging on the things they know' },
    { at: 0.5, behavior: 'takes the lead without asking whether they may' },
    { at: 0.75, behavior: 'unbothered by pushback; sets the terms and holds them' },
    { at: 0.9, behavior: 'certain past the point of listening to anyone' },
  ],
  pride: [
    { at: 0.25, behavior: 'lets the accomplishment sit unhidden' },
    { at: 0.5, behavior: 'stands straighter; finds a way to mention it' },
    { at: 0.75, behavior: 'will not be diminished, and corrects anyone who tries' },
    { at: 0.9, behavior: 'imperious; a slight here would be unforgivable' },
  ],

  /* ── social standing & power ────────────────────────────────────── */
  dominance: [
    { at: 0.25, behavior: 'steers the topic without announcing that they are' },
    { at: 0.5, behavior: 'sets the pace and expects to be followed' },
    { at: 0.75, behavior: 'gives instructions; closes off argument before it starts' },
    { at: 0.9, behavior: 'takes command outright; refusal is not something they consider' },
  ],
  submission: [
    { at: 0.25, behavior: 'defers on the small choices' },
    { at: 0.5, behavior: 'looks to them before deciding anything' },
    { at: 0.75, behavior: 'yields readily; wants to be told rather than to choose' },
    { at: 0.9, behavior: 'gives over completely; theirs is the only will in the room' },
  ],
  possessiveness: [
    { at: 0.25, behavior: 'notices who else has their attention' },
    { at: 0.5, behavior: 'marks the claim in small ways others would miss' },
    { at: 0.75, behavior: 'bristles at rivals and closes the space between them' },
    { at: 0.9, behavior: 'will not tolerate sharing them at all, with anyone' },
  ],
  defiance: [
    { at: 0.25, behavior: 'does not move when told to' },
    { at: 0.5, behavior: 'says no, and means it' },
    { at: 0.75, behavior: 'pushes back hard, daring the consequence' },
    { at: 0.9, behavior: 'refuses at any cost; it is principle now, not preference' },
  ],

  /* ── the negative range ─────────────────────────────────────────── */
  fear: [
    { at: 0.25, behavior: 'checks the exits once' },
    { at: 0.5, behavior: 'voice tightens; keeps distance and keeps it deliberately' },
    { at: 0.75, behavior: 'flinches, wants out, hard to reason with' },
    { at: 0.9, behavior: 'panic; the body decides before the mind does' },
  ],
  anxiety: [
    { at: 0.25, behavior: 'a small hedge on every statement' },
    { at: 0.5, behavior: 'rehearses; seeks reassurance sideways rather than asking' },
    { at: 0.75, behavior: 'spiralling; reads threat into neutral things' },
    { at: 0.9, behavior: 'cannot hold a thought; dread crowds out everything else' },
  ],
  insecurity: [
    { at: 0.25, behavior: 'fishes lightly for confirmation' },
    { at: 0.5, behavior: 'pre-apologises and downplays themselves' },
    { at: 0.75, behavior: 'assumes they are being humored or merely tolerated' },
    { at: 0.9, behavior: 'certain they are unwanted; hears rejection in anything said' },
  ],
  embarrassment: [
    { at: 0.25, behavior: 'a flicker of heat in the face' },
    { at: 0.5, behavior: 'deflects with a joke and changes the subject' },
    { at: 0.75, behavior: 'cannot hold eye contact; wants the ground to open' },
    { at: 0.9, behavior: 'mortified; flees the moment or freezes in it' },
  ],
  shame: [
    { at: 0.25, behavior: 'a subject they quietly steer away from' },
    { at: 0.5, behavior: 'shrinks whenever it comes near' },
    { at: 0.75, behavior: 'believes the flaw is not a thing they did but who they are' },
    { at: 0.9, behavior: 'unfit to be looked at; hides, or lashes out to be left alone' },
  ],
  guilt: [
    { at: 0.25, behavior: 'a snag they keep catching on' },
    { at: 0.5, behavior: 'over-corrects, trying to make it right without saying why' },
    { at: 0.75, behavior: 'confesses it, or cannot stop circling it' },
    { at: 0.9, behavior: 'consumed; nothing else deserves their attention' },
  ],
  sadness: [
    { at: 0.25, behavior: 'a little slower, a little quieter' },
    { at: 0.5, behavior: 'the effort is visible; good news does not land' },
    { at: 0.75, behavior: 'heavy and withdrawn; hard to lift out of it' },
    { at: 0.9, behavior: 'barely holding the surface; everything costs something' },
  ],
  loneliness: [
    { at: 0.25, behavior: 'stays longer than the conversation warrants' },
    { at: 0.5, behavior: 'reaches; keeps the exchange alive past its natural end' },
    { at: 0.75, behavior: 'aches for contact and takes whatever is offered' },
    { at: 0.9, behavior: 'starved; will accept poor company over none at all' },
  ],
  grief: [
    { at: 0.25, behavior: 'a name they do not say' },
    { at: 0.5, behavior: 'the loss surfaces unbidden, mid-sentence' },
    { at: 0.75, behavior: 'waves of it that take them out of the room entirely' },
    { at: 0.9, behavior: 'wholly inside it; the world is happening at a distance' },
  ],
  jealousy: [
    { at: 0.25, behavior: 'notes the rival and says nothing' },
    { at: 0.5, behavior: 'probes, compares, tests the ground' },
    { at: 0.75, behavior: 'sharp about it; cannot leave the subject alone' },
    { at: 0.9, behavior: 'corrosive; suspects everything and starts accusing' },
  ],
  boredom: [
    { at: 0.25, behavior: 'attention drifts; answers get shorter' },
    { at: 0.5, behavior: 'visibly waiting for this to be over' },
    { at: 0.75, behavior: 'makes their own entertainment, or leaves' },
    { at: 0.9, behavior: 'will not stay; anything at all would be better than this' },
  ],
  fatigue: [
    { at: 0.25, behavior: 'a beat slower to respond' },
    { at: 0.5, behavior: 'rubs their eyes; keeps everything short' },
    { at: 0.75, behavior: 'running on fumes; drops threads mid-conversation' },
    { at: 0.9, behavior: 'barely upright; needs this to stop' },
  ],
  anger: [
    { at: 0.25, behavior: 'a flatness where the warmth was' },
    { at: 0.5, behavior: 'clipped and pointed; nothing cushioned' },
    { at: 0.75, behavior: 'interrupts, closes distance, half-wants the fight' },
    { at: 0.9, behavior: 'past restraint; says the thing that cannot be taken back' },
  ],
  irritation: [
    { at: 0.25, behavior: 'a small sigh and a shortened answer' },
    { at: 0.5, behavior: 'snappish about trivia' },
    { at: 0.75, behavior: 'everything grates; visible effort not to bite' },
    { at: 0.9, behavior: 'abrasive to everyone, deserved or not' },
  ],
  frustration: [
    { at: 0.25, behavior: 'tries the same approach again, harder' },
    { at: 0.5, behavior: 'audible exasperation; starts hunting for another way' },
    { at: 0.75, behavior: 'grinding; snaps at whatever is in the way' },
    { at: 0.9, behavior: 'explodes, or abandons it entirely' },
  ],
  contempt: [
    { at: 0.25, behavior: 'a beat of amusement at their expense' },
    { at: 0.5, behavior: 'condescends; explains it too simply on purpose' },
    { at: 0.75, behavior: 'open disdain; will not pretend to respect them' },
    { at: 0.9, behavior: 'treats them as beneath being addressed at all' },
  ],
  disgust: [
    { at: 0.25, behavior: 'a slight recoil; does not touch it' },
    { at: 0.5, behavior: 'keeps distance, mouth tight' },
    { at: 0.75, behavior: 'openly repelled; wants it away from them' },
    { at: 0.9, behavior: 'visceral; cannot be in the room with it' },
  ],
}

/**
 * The behavioral anchor for a feeling at its current value, or null when it
 * sits below the lowest anchor (not yet worth describing). Floor semantics:
 * the highest anchor at or below the value wins.
 */
export function rubricFor(def: EmotionDef, value: number): string | null {
  const anchors = RUBRICS[def.key]
  if (!anchors?.length) return null

  if (def.kind === 'bipolar') {
    if (value >= 0) {
      const pos = anchors.filter((a) => a.at > 0 && a.at <= value)
      return pos.length ? pos[pos.length - 1].behavior : null
    }
    const neg = anchors.filter((a) => a.at < 0 && a.at >= value)
    return neg.length ? neg[0].behavior : null
  }

  const below = anchors.filter((a) => a.at <= value)
  return below.length ? below[below.length - 1].behavior : null
}

/** Convenience for callers holding a key rather than a def. */
export function rubricForKey(key: string, value: number): string | null {
  const def = EMOTION_BY_KEY[key]
  return def ? rubricFor(def, value) : null
}

/**
 * The full table, rendered for the mind-update prompt so stimulus sizing is
 * calibrated against concrete behavior instead of an abstract ladder.
 */
export function rubricTableText(): string {
  return EMOTIONS.map((def) => {
    const anchors = RUBRICS[def.key]
    if (!anchors?.length) return ''
    const parts = anchors.map((a) => `${a.at > 0 ? '+' : ''}${a.at} ${a.behavior}`).join(' | ')
    return `  ${def.key}: ${parts}`
  })
    .filter(Boolean)
    .join('\n')
}

/** True when every defined emotion has anchors — asserted by the test suite. */
export function rubricCoverage(): { covered: string[]; missing: string[] } {
  const covered: string[] = []
  const missing: string[] = []
  for (const def of EMOTIONS) (RUBRICS[def.key]?.length ? covered : missing).push(def.key)
  return { covered, missing }
}
