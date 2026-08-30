// @bun
// packages/core/src/affect.ts
var EMOTIONS = [
  { key: "valence", label: "Valence (energy)", kind: "bipolar", blurb: "overall psychological energy/arousal: drained & inert at -1, wired & activated at +1" },
  { key: "mood", label: "Mood (agreeableness)", kind: "bipolar", blurb: "overall agreeableness: hostile & contrary at -1, warm & accommodating at +1" },
  { key: "affection", label: "Affection", kind: "unipolar", blurb: "warm fondness and care toward someone" },
  { key: "attraction", label: "Attraction", kind: "unipolar", blurb: "romantic/physical pull toward someone" },
  { key: "desire", label: "Desire", kind: "unipolar", blurb: "wanting \u2014 to have, to be near, to claim (the craving, not the body state)" },
  { key: "sexual_arousal", label: "Sexual arousal", kind: "unipolar", blurb: "physical sexual arousal: the body responding, heat building" },
  { key: "tenderness", label: "Tenderness", kind: "unipolar", blurb: "gentle protective softness toward someone vulnerable" },
  { key: "trust", label: "Trust", kind: "unipolar", blurb: "felt safety and willingness to be open with someone" },
  { key: "adoration", label: "Adoration", kind: "unipolar", blurb: "reverent devotion; placing someone above oneself" },
  { key: "gratitude", label: "Gratitude", kind: "unipolar", blurb: "thankful appreciation for what another has done" },
  { key: "joy", label: "Joy", kind: "unipolar", blurb: "bright happiness and delight in the moment" },
  { key: "contentment", label: "Contentment", kind: "unipolar", blurb: "settled, easy satisfaction; nothing lacking" },
  { key: "excitement", label: "Excitement", kind: "unipolar", blurb: "eager, keyed-up energy toward what is coming" },
  { key: "amusement", label: "Amusement", kind: "unipolar", blurb: "playful mirth; finding something funny" },
  { key: "playfulness", label: "Playfulness", kind: "unipolar", blurb: "teasing, mischievous willingness to play" },
  { key: "curiosity", label: "Curiosity", kind: "unipolar", blurb: "drawn to explore, learn, probe" },
  { key: "hope", label: "Hope", kind: "unipolar", blurb: "expectation that things may turn out well" },
  { key: "confidence", label: "Confidence", kind: "unipolar", blurb: "self-assurance; certainty in one's footing" },
  { key: "pride", label: "Pride", kind: "unipolar", blurb: "satisfaction in one's own worth or achievement" },
  { key: "dominance", label: "Dominance", kind: "unipolar", blurb: "drive to lead, control, take charge of the exchange" },
  { key: "submission", label: "Submission", kind: "unipolar", blurb: "pull to yield, defer, give over control" },
  { key: "possessiveness", label: "Possessiveness", kind: "unipolar", blurb: "wanting someone or something to be yours alone" },
  { key: "defiance", label: "Defiance", kind: "unipolar", blurb: "refusal to comply; pushing back against pressure" },
  { key: "fear", label: "Fear", kind: "unipolar", blurb: "acute alarm at present danger" },
  { key: "anxiety", label: "Anxiety", kind: "unipolar", blurb: "diffuse dread about what might happen" },
  { key: "insecurity", label: "Insecurity", kind: "unipolar", blurb: "doubt about one's own worth or standing" },
  { key: "embarrassment", label: "Embarrassment", kind: "unipolar", blurb: "flustered self-consciousness at being exposed" },
  { key: "shame", label: "Shame", kind: "unipolar", blurb: "painful sense of being fundamentally wrong or bad" },
  { key: "guilt", label: "Guilt", kind: "unipolar", blurb: "remorse over a specific harm one caused" },
  { key: "sadness", label: "Sadness", kind: "unipolar", blurb: "low, heavy sorrow" },
  { key: "loneliness", label: "Loneliness", kind: "unipolar", blurb: "ache of disconnection from others" },
  { key: "grief", label: "Grief", kind: "unipolar", blurb: "deep mourning over a loss" },
  { key: "jealousy", label: "Jealousy", kind: "unipolar", blurb: "fear of losing someone's regard to a rival" },
  { key: "boredom", label: "Boredom", kind: "unipolar", blurb: "restless, unstimulated flatness" },
  { key: "fatigue", label: "Fatigue", kind: "unipolar", blurb: "physical/emotional tiredness, depletion" },
  { key: "anger", label: "Anger", kind: "unipolar", blurb: "hot hostility at a wrong or obstacle" },
  { key: "irritation", label: "Irritation", kind: "unipolar", blurb: "low-grade annoyance, friction" },
  { key: "frustration", label: "Frustration", kind: "unipolar", blurb: "thwarted strain when blocked from a goal" },
  { key: "contempt", label: "Contempt", kind: "unipolar", blurb: "cold disdain; looking down on someone" },
  { key: "disgust", label: "Disgust", kind: "unipolar", blurb: "visceral revulsion, wanting distance" }
];
var EMOTION_BY_KEY = Object.fromEntries(EMOTIONS.map((e) => [e.key, e]));
var EMOTION_KEYS = EMOTIONS.map((e) => e.key);
var BEHAVIOR_CLASS = {
  affection: "approach",
  attraction: "approach",
  desire: "approach",
  sexual_arousal: "approach",
  tenderness: "approach",
  trust: "approach",
  adoration: "approach",
  gratitude: "approach",
  joy: "approach",
  contentment: "approach",
  excitement: "approach",
  amusement: "approach",
  playfulness: "approach",
  curiosity: "approach",
  hope: "approach",
  confidence: "approach",
  pride: "approach",
  possessiveness: "approach",
  fear: "guard",
  anxiety: "guard",
  insecurity: "guard",
  embarrassment: "guard",
  shame: "guard",
  guilt: "guard",
  sadness: "down",
  loneliness: "down",
  grief: "down",
  boredom: "down",
  fatigue: "down",
  anger: "aggression",
  irritation: "aggression",
  frustration: "aggression",
  jealousy: "aggression",
  contempt: "aggression",
  disgust: "aggression",
  defiance: "aggression",
  dominance: "assert",
  submission: "yield"
};
function behaviorClass(key) {
  return BEHAVIOR_CLASS[key] ?? "other";
}
var VMAX = 0.9995;
var clampUni = (v) => Math.max(0, Math.min(VMAX, v));
var clampBi = (v) => Math.max(-VMAX, Math.min(VMAX, v));
function toPressure(def, value) {
  if (def.kind === "bipolar") {
    const v2 = clampBi(value);
    return Math.atanh(v2);
  }
  const v = clampUni(value);
  return -Math.log(1 - v);
}
function fromPressure(def, p) {
  if (def.kind === "bipolar")
    return clampBi(Math.tanh(p));
  return clampUni(1 - Math.exp(-p));
}
var STIMULUS_GAIN = 0.25;
function applyStimulus(def, current, intensity) {
  return fromPressure(def, toPressure(def, current) + intensity * STIMULUS_GAIN);
}
function relaxToward(def, current, baseline, rate) {
  const pc = toPressure(def, current);
  const pb = toPressure(def, baseline);
  return fromPressure(def, pc + Math.max(0, Math.min(1, rate)) * (pb - pc));
}
var UNIPOLAR_LEVELS = [
  { at: 0, label: "absent", meaning: "not felt at all; plays no part in behavior" },
  { at: 0.25, label: "faint", meaning: "a faint undercurrent, easily overridden by anything else" },
  { at: 0.5, label: "present", meaning: "clearly present and noticeable; colors word choice and tone" },
  { at: 0.75, label: "strong", meaning: "strong; actively shapes decisions and is hard to fully hide" },
  { at: 0.8, label: "pronounced", meaning: "pronounced; leaks into body language and breaks through composure" },
  { at: 0.9, label: "intense", meaning: "intense; dominates the moment and is very hard to mask" },
  { at: 0.95, label: "overwhelming", meaning: "overwhelming; crowds out competing feelings and reason" },
  { at: 1, label: "all-consuming", meaning: "all-consuming; drives the character to extremes, past restraint" }
];
var BIPOLAR_POLES = {
  valence: { neg: "drained / inert / shut down", pos: "wired / activated / lit up" },
  mood: { neg: "hostile / contrary / cold", pos: "warm / accommodating / open" }
};
var BIPOLAR_MAG = [
  { at: 0, label: "neutral" },
  { at: 0.25, label: "faintly" },
  { at: 0.5, label: "clearly" },
  { at: 0.75, label: "strongly" },
  { at: 0.8, label: "pronouncedly" },
  { at: 0.9, label: "intensely" },
  { at: 0.95, label: "overwhelmingly" },
  { at: 1, label: "totally" }
];
function nearestLevel(levels, v) {
  let best = levels[0];
  for (const l of levels)
    if (Math.abs(l.at - v) <= Math.abs(best.at - v))
      best = l;
  return best;
}
function describeValue(def, value) {
  if (def.kind === "bipolar") {
    const poles = BIPOLAR_POLES[def.key] ?? { neg: "negative pole", pos: "positive pole" };
    const mag = nearestLevel(BIPOLAR_MAG, Math.abs(value));
    if (mag.at === 0)
      return { label: "neutral", meaning: `balanced between ${poles.neg} and ${poles.pos}` };
    const pole = value < 0 ? poles.neg : poles.pos;
    return { label: `${mag.label} ${value < 0 ? "\u2212" : "+"}`, meaning: `${mag.label} ${pole}` };
  }
  const lvl = nearestLevel(UNIPOLAR_LEVELS, value);
  return { label: lvl.label, meaning: lvl.meaning };
}
function genericScaleText() {
  const uni = UNIPOLAR_LEVELS.map((l) => `  ${l.at.toFixed(2)} \u2014 ${l.label}: ${l.meaning}`).join(`
`);
  const bip = BIPOLAR_MAG.filter((m) => m.at > 0).map((m) => `  \xB1${m.at.toFixed(2)} \u2014 ${m.label} toward the signed pole`).join(`
`);
  return [
    "UNIPOLAR feelings (0..1), where 0 is absent and 1 is all-consuming:",
    uni,
    "",
    "BIPOLAR axes (valence, mood; -1..+1), magnitude meaning (sign picks the pole):",
    "  0.00 \u2014 neutral: balanced between the two poles",
    bip
  ].join(`
`);
}
function neutralVector() {
  const out = {};
  for (const e of EMOTIONS) {
    const v = e.kind === "bipolar" ? 0 : 0.05;
    out[e.key] = { value: v, baseline: v };
  }
  return out;
}

// packages/core/src/state.ts
var KNOWLEDGE_CAP = 20;
function emptyRun(chatId) {
  const now = Date.now();
  return {
    chatId,
    characterId: null,
    characters: {},
    turnSeq: 0,
    createdAt: now,
    updatedAt: now
  };
}
function newCharacter(id, name, isPrimary) {
  return {
    id,
    name,
    isPrimary,
    present: isPrimary,
    emotions: neutralVector(),
    approval: 0,
    knowledge: [],
    updatedAt: Date.now()
  };
}
function backfillEmotions(c) {
  const nv = neutralVector();
  for (const k of Object.keys(nv))
    if (!c.emotions[k])
      c.emotions[k] = nv[k];
  c.approval ??= 0;
  c.knowledge ??= [];
}
function pushKnowledge(c, entry) {
  const e = entry.trim();
  if (!e)
    return;
  c.knowledge = [...c.knowledge ?? [], e].slice(-KNOWLEDGE_CAP);
}
function ensurePrimary(run, id, name) {
  run.characterId = id;
  let primary = Object.values(run.characters).find((c) => c.isPrimary);
  if (!primary) {
    const slug = slugify(name) || "protagonist_char";
    primary = newCharacter(run.characters[slug] ? `${slug}_main` : slug, name, true);
    run.characters[primary.id] = primary;
  }
  primary.name = name;
  primary.present = true;
  return primary;
}
function slugify(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return base || `npc_${Math.random().toString(36).slice(2, 7)}`;
}
// packages/core/src/approval.ts
var APPROVAL_MIN = -1e4;
var APPROVAL_MAX = 1e4;
var APPROVAL_BANDS = [
  {
    at: 1e4,
    pos: { label: "unshakeable bond", meaning: "absolute; nothing the player could do would break it \u2014 their lives are entwined" },
    neg: { label: "implacable enemy", meaning: "absolute; nothing could mend it \u2014 destroying the player is a purpose in itself" }
  },
  {
    at: 9000,
    pos: { label: "transcendent", meaning: "beyond ordinary loyalty; the player's wellbeing IS their own \u2014 hard to imagine a line that would break this" },
    neg: { label: "irredeemable", meaning: "beyond ordinary enmity; harming the player has become how they measure a good day" }
  },
  {
    at: 8000,
    pos: { label: "inseparable", meaning: "near-absolute; only a fundamental betrayal could shake it, and they would not believe it at first" },
    neg: { label: "irreconcilable", meaning: "near-absolute enmity; only an extraordinary act could crack it, and they would distrust it as a trick" }
  },
  {
    at: 7000,
    pos: { label: "lifelong", meaning: "identity-level attachment; they would uproot their life for the player without being asked" },
    neg: { label: "sworn against", meaning: "a dedicated enemy; opposes the player at real personal cost, and plans ahead to do it" }
  },
  {
    at: 6000,
    pos: { label: "bound", meaning: "the player is family, inner circle; loyalty survives serious tests and public cost" },
    neg: { label: "embittered", meaning: "hatred woven into who they are; sabotages on sight, poisons others against the player" }
  },
  {
    at: 5000,
    pos: { label: "profoundly loyal", meaning: "stakes their own safety and standing on the player as a matter of course" },
    neg: { label: "vengeful", meaning: "actively seeks to harm or thwart the player, not just refuse them" }
  },
  {
    at: 4000,
    pos: { label: "devoted", meaning: "their default is yes, even at real cost to themselves \u2014 a betrayal here would be shattering" },
    neg: { label: "hostile", meaning: "their default is no; only self-interest or coercion moves them to cooperate" }
  },
  {
    at: 3000,
    pos: { label: "deeply trusted", meaning: "extends serious latitude \u2014 takes risks on the player's word alone" },
    neg: { label: "resented", meaning: "actively resists, tests, or undermines; any cooperation is strictly transactional" }
  },
  {
    at: 2000,
    pos: { label: "trusted", meaning: "will go along with requests that cut against their own preferences, within reason" },
    neg: { label: "disliked", meaning: "needs convincing even for reasonable asks; pushes back readily" }
  },
  {
    at: 1000,
    pos: { label: "warm", meaning: "openly at ease; shares more, volunteers help, extends real trust" },
    neg: { label: "distrustful", meaning: "guarded; verifies claims, keeps things back" }
  },
  {
    at: 10,
    pos: { label: "mildly favorable", meaning: "a small benefit of the doubt, granted" },
    neg: { label: "mildly wary", meaning: "a small benefit of the doubt, withheld" }
  }
];
function describeApproval(a) {
  const v = Math.max(APPROVAL_MIN, Math.min(APPROVAL_MAX, a));
  for (const band of APPROVAL_BANDS) {
    if (Math.abs(v) >= band.at)
      return v > 0 ? band.pos : band.neg;
  }
  return { label: "neutral", meaning: "no formed opinion; trust and patience are at their defaults" };
}
function approvalLine(c) {
  const a = c.approval ?? 0;
  const d = describeApproval(a);
  return `approval of the player: ${d.label} (${Math.round(a)}) \u2014 ${d.meaning}`;
}
// packages/core/src/rubrics.ts
var RUBRICS = {
  valence: [
    { at: -0.7, behavior: "flat and depleted; moves only when they must, words rationed" },
    { at: -0.35, behavior: "slower to answer, energy visibly banked" },
    { at: 0.35, behavior: "quicker, more forward, leaning into the exchange" },
    { at: 0.7, behavior: "wired; talks into the pauses, hands moving, hard to settle" }
  ],
  mood: [
    { at: -0.7, behavior: "contrary on reflex; looks for the flaw in whatever is offered" },
    { at: -0.35, behavior: "answers shortening, courtesy wearing thin" },
    { at: 0.35, behavior: "warmer register; gives a little more than was asked for" },
    { at: 0.7, behavior: "openly generous; meets them more than halfway, assumes the best" }
  ],
  affection: [
    { at: 0.25, behavior: "a shade warmer with them than with anyone else present" },
    { at: 0.5, behavior: "seeks small contact; remembers details about them unprompted" },
    { at: 0.75, behavior: "protective; puts their comfort ahead of their own without comment" },
    { at: 0.9, behavior: "openly tender, dropping guard they keep up for everyone else" }
  ],
  attraction: [
    { at: 0.25, behavior: "eyes linger a beat past polite" },
    { at: 0.5, behavior: "angles toward them, finds reasons to be near" },
    { at: 0.75, behavior: "loses the thread mid-sentence; acutely aware of the distance between them" },
    { at: 0.9, behavior: "barely tracking anything else in the room" }
  ],
  desire: [
    { at: 0.25, behavior: "a want they would deny if asked directly" },
    { at: 0.5, behavior: "steers toward what they want without naming it" },
    { at: 0.75, behavior: "asks for it outright, or takes the opening the moment it appears" },
    { at: 0.9, behavior: "single-minded; other considerations stop weighing anything" }
  ],
  sexual_arousal: [
    { at: 0.25, behavior: "suddenly aware of their own body in a way they were not" },
    { at: 0.5, behavior: "breath and posture shift; the voice drops a register" },
    { at: 0.75, behavior: "touch-hungry; conversation is something to get through" },
    { at: 0.9, behavior: "physical need running the moment, restraint visibly failing" }
  ],
  tenderness: [
    { at: 0.25, behavior: "gentles their tone without deciding to" },
    { at: 0.5, behavior: "careful with them, watching for where it hurts" },
    { at: 0.75, behavior: "shields them; absorbs cost to spare them any" },
    { at: 0.9, behavior: "undone by their vulnerability; would give anything asked" }
  ],
  trust: [
    { at: 0.25, behavior: "stops double-checking the small things" },
    { at: 0.5, behavior: "volunteers something they would not tell most people" },
    { at: 0.75, behavior: "acts on their word alone, without verifying" },
    { at: 0.9, behavior: "hands them what could ruin them, and does not brace" }
  ],
  adoration: [
    { at: 0.25, behavior: "quotes them; defers on small points" },
    { at: 0.5, behavior: "arranges their own position around what the other thinks" },
    { at: 0.75, behavior: "measures their own worth by that person\u2019s regard" },
    { at: 0.9, behavior: "worshipful; the other\u2019s judgment has replaced their own" }
  ],
  gratitude: [
    { at: 0.25, behavior: "a warmer thank-you than the moment strictly required" },
    { at: 0.5, behavior: "looks for a way to repay it, unprompted" },
    { at: 0.75, behavior: "names the debt out loud and means it" },
    { at: 0.9, behavior: "changed by it; will not forget who did this, ever" }
  ],
  joy: [
    { at: 0.25, behavior: "a smile that gets away from them" },
    { at: 0.5, behavior: "lighter and quicker; laughs more easily than usual" },
    { at: 0.75, behavior: "glowing; the mood spills onto everyone near them" },
    { at: 0.9, behavior: "giddy and undignified, past caring how it looks" }
  ],
  contentment: [
    { at: 0.25, behavior: "unhurried; nothing needs fixing right now" },
    { at: 0.5, behavior: "settles in properly and stops watching the door" },
    { at: 0.75, behavior: "deeply easy; would not trade this hour for anything" },
    { at: 0.9, behavior: "so at peace that urgency itself feels foreign" }
  ],
  excitement: [
    { at: 0.25, behavior: "slightly forward-leaning about what comes next" },
    { at: 0.5, behavior: "talks faster, jumps ahead to the good part" },
    { at: 0.75, behavior: "cannot sit still; pushes for it to happen now" },
    { at: 0.9, behavior: "vibrating with it; patience gone entirely" }
  ],
  amusement: [
    { at: 0.25, behavior: "the corner of the mouth twitches" },
    { at: 0.5, behavior: "openly grinning and playing along" },
    { at: 0.75, behavior: "laughing hard enough to lose composure" },
    { at: 0.9, behavior: "helpless with it; cannot finish a sentence" }
  ],
  playfulness: [
    { at: 0.25, behavior: "a small tease slipped in sideways" },
    { at: 0.5, behavior: "provokes on purpose, to see what happens" },
    { at: 0.75, behavior: "turns everything into a game; presses the buttons they find" },
    { at: 0.9, behavior: "relentlessly mischievous, consequences be damned" }
  ],
  curiosity: [
    { at: 0.25, behavior: "asks one more question than the moment needed" },
    { at: 0.5, behavior: "digs; keeps circling back to the interesting thread" },
    { at: 0.75, behavior: "abandons their own agenda to follow it" },
    { at: 0.9, behavior: "consumed; must know, and will risk something to find out" }
  ],
  hope: [
    { at: 0.25, behavior: "allows out loud that the good version might happen" },
    { at: 0.5, behavior: "starts planning as though it will work" },
    { at: 0.75, behavior: "invested in the outcome and guarding against doubt" },
    { at: 0.9, behavior: "staked on it; the fall would be a long one" }
  ],
  confidence: [
    { at: 0.25, behavior: "no hedging on the things they know" },
    { at: 0.5, behavior: "takes the lead without asking whether they may" },
    { at: 0.75, behavior: "unbothered by pushback; sets the terms and holds them" },
    { at: 0.9, behavior: "certain past the point of listening to anyone" }
  ],
  pride: [
    { at: 0.25, behavior: "lets the accomplishment sit unhidden" },
    { at: 0.5, behavior: "stands straighter; finds a way to mention it" },
    { at: 0.75, behavior: "will not be diminished, and corrects anyone who tries" },
    { at: 0.9, behavior: "imperious; a slight here would be unforgivable" }
  ],
  dominance: [
    { at: 0.25, behavior: "steers the topic without announcing that they are" },
    { at: 0.5, behavior: "sets the pace and expects to be followed" },
    { at: 0.75, behavior: "gives instructions; closes off argument before it starts" },
    { at: 0.9, behavior: "takes command outright; refusal is not something they consider" }
  ],
  submission: [
    { at: 0.25, behavior: "defers on the small choices" },
    { at: 0.5, behavior: "looks to them before deciding anything" },
    { at: 0.75, behavior: "yields readily; wants to be told rather than to choose" },
    { at: 0.9, behavior: "gives over completely; theirs is the only will in the room" }
  ],
  possessiveness: [
    { at: 0.25, behavior: "notices who else has their attention" },
    { at: 0.5, behavior: "marks the claim in small ways others would miss" },
    { at: 0.75, behavior: "bristles at rivals and closes the space between them" },
    { at: 0.9, behavior: "will not tolerate sharing them at all, with anyone" }
  ],
  defiance: [
    { at: 0.25, behavior: "does not move when told to" },
    { at: 0.5, behavior: "says no, and means it" },
    { at: 0.75, behavior: "pushes back hard, daring the consequence" },
    { at: 0.9, behavior: "refuses at any cost; it is principle now, not preference" }
  ],
  fear: [
    { at: 0.25, behavior: "checks the exits once" },
    { at: 0.5, behavior: "voice tightens; keeps distance and keeps it deliberately" },
    { at: 0.75, behavior: "flinches, wants out, hard to reason with" },
    { at: 0.9, behavior: "panic; the body decides before the mind does" }
  ],
  anxiety: [
    { at: 0.25, behavior: "a small hedge on every statement" },
    { at: 0.5, behavior: "rehearses; seeks reassurance sideways rather than asking" },
    { at: 0.75, behavior: "spiralling; reads threat into neutral things" },
    { at: 0.9, behavior: "cannot hold a thought; dread crowds out everything else" }
  ],
  insecurity: [
    { at: 0.25, behavior: "fishes lightly for confirmation" },
    { at: 0.5, behavior: "pre-apologises and downplays themselves" },
    { at: 0.75, behavior: "assumes they are being humored or merely tolerated" },
    { at: 0.9, behavior: "certain they are unwanted; hears rejection in anything said" }
  ],
  embarrassment: [
    { at: 0.25, behavior: "a flicker of heat in the face" },
    { at: 0.5, behavior: "deflects with a joke and changes the subject" },
    { at: 0.75, behavior: "cannot hold eye contact; wants the ground to open" },
    { at: 0.9, behavior: "mortified; flees the moment or freezes in it" }
  ],
  shame: [
    { at: 0.25, behavior: "a subject they quietly steer away from" },
    { at: 0.5, behavior: "shrinks whenever it comes near" },
    { at: 0.75, behavior: "believes the flaw is not a thing they did but who they are" },
    { at: 0.9, behavior: "unfit to be looked at; hides, or lashes out to be left alone" }
  ],
  guilt: [
    { at: 0.25, behavior: "a snag they keep catching on" },
    { at: 0.5, behavior: "over-corrects, trying to make it right without saying why" },
    { at: 0.75, behavior: "confesses it, or cannot stop circling it" },
    { at: 0.9, behavior: "consumed; nothing else deserves their attention" }
  ],
  sadness: [
    { at: 0.25, behavior: "a little slower, a little quieter" },
    { at: 0.5, behavior: "the effort is visible; good news does not land" },
    { at: 0.75, behavior: "heavy and withdrawn; hard to lift out of it" },
    { at: 0.9, behavior: "barely holding the surface; everything costs something" }
  ],
  loneliness: [
    { at: 0.25, behavior: "stays longer than the conversation warrants" },
    { at: 0.5, behavior: "reaches; keeps the exchange alive past its natural end" },
    { at: 0.75, behavior: "aches for contact and takes whatever is offered" },
    { at: 0.9, behavior: "starved; will accept poor company over none at all" }
  ],
  grief: [
    { at: 0.25, behavior: "a name they do not say" },
    { at: 0.5, behavior: "the loss surfaces unbidden, mid-sentence" },
    { at: 0.75, behavior: "waves of it that take them out of the room entirely" },
    { at: 0.9, behavior: "wholly inside it; the world is happening at a distance" }
  ],
  jealousy: [
    { at: 0.25, behavior: "notes the rival and says nothing" },
    { at: 0.5, behavior: "probes, compares, tests the ground" },
    { at: 0.75, behavior: "sharp about it; cannot leave the subject alone" },
    { at: 0.9, behavior: "corrosive; suspects everything and starts accusing" }
  ],
  boredom: [
    { at: 0.25, behavior: "attention drifts; answers get shorter" },
    { at: 0.5, behavior: "visibly waiting for this to be over" },
    { at: 0.75, behavior: "makes their own entertainment, or leaves" },
    { at: 0.9, behavior: "will not stay; anything at all would be better than this" }
  ],
  fatigue: [
    { at: 0.25, behavior: "a beat slower to respond" },
    { at: 0.5, behavior: "rubs their eyes; keeps everything short" },
    { at: 0.75, behavior: "running on fumes; drops threads mid-conversation" },
    { at: 0.9, behavior: "barely upright; needs this to stop" }
  ],
  anger: [
    { at: 0.25, behavior: "a flatness where the warmth was" },
    { at: 0.5, behavior: "clipped and pointed; nothing cushioned" },
    { at: 0.75, behavior: "interrupts, closes distance, half-wants the fight" },
    { at: 0.9, behavior: "past restraint; says the thing that cannot be taken back" }
  ],
  irritation: [
    { at: 0.25, behavior: "a small sigh and a shortened answer" },
    { at: 0.5, behavior: "snappish about trivia" },
    { at: 0.75, behavior: "everything grates; visible effort not to bite" },
    { at: 0.9, behavior: "abrasive to everyone, deserved or not" }
  ],
  frustration: [
    { at: 0.25, behavior: "tries the same approach again, harder" },
    { at: 0.5, behavior: "audible exasperation; starts hunting for another way" },
    { at: 0.75, behavior: "grinding; snaps at whatever is in the way" },
    { at: 0.9, behavior: "explodes, or abandons it entirely" }
  ],
  contempt: [
    { at: 0.25, behavior: "a beat of amusement at their expense" },
    { at: 0.5, behavior: "condescends; explains it too simply on purpose" },
    { at: 0.75, behavior: "open disdain; will not pretend to respect them" },
    { at: 0.9, behavior: "treats them as beneath being addressed at all" }
  ],
  disgust: [
    { at: 0.25, behavior: "a slight recoil; does not touch it" },
    { at: 0.5, behavior: "keeps distance, mouth tight" },
    { at: 0.75, behavior: "openly repelled; wants it away from them" },
    { at: 0.9, behavior: "visceral; cannot be in the room with it" }
  ]
};
function rubricFor(def, value) {
  const anchors = RUBRICS[def.key];
  if (!anchors?.length)
    return null;
  if (def.kind === "bipolar") {
    if (value >= 0) {
      const pos = anchors.filter((a) => a.at > 0 && a.at <= value);
      return pos.length ? pos[pos.length - 1].behavior : null;
    }
    const neg = anchors.filter((a) => a.at < 0 && a.at >= value);
    return neg.length ? neg[0].behavior : null;
  }
  const below = anchors.filter((a) => a.at <= value);
  return below.length ? below[below.length - 1].behavior : null;
}
function rubricTableText() {
  return EMOTIONS.map((def) => {
    const anchors = RUBRICS[def.key];
    if (!anchors?.length)
      return "";
    const parts = anchors.map((a) => `${a.at > 0 ? "+" : ""}${a.at} ${a.behavior}`).join(" | ");
    return `  ${def.key}: ${parts}`;
  }).filter(Boolean).join(`
`);
}

// packages/core/src/directive.ts
var SALIENT_UNI = 0.25;
var v = (c, k) => c.emotions[k]?.value ?? 0;
function groupedSalient(c) {
  const groups = {};
  for (const def of EMOTIONS) {
    if (def.kind === "bipolar")
      continue;
    const val = v(c, def.key);
    if (val < SALIENT_UNI)
      continue;
    const cls = behaviorClass(def.key);
    (groups[cls] ??= []).push({ def, value: val });
  }
  for (const k of Object.keys(groups))
    groups[k].sort((a, b) => b.value - a.value);
  return groups;
}
var fmtList = (rows) => rows.slice(0, 3).map(({ def, value }) => `${def.label.toLowerCase().split(" (")[0]} (${describeValue(def, value).label})`).join(", ");
var leadRubric = (rows) => {
  if (!rows.length)
    return "";
  const { def, value } = rows[0];
  const anchor = rubricFor(def, value);
  return anchor ? ` \u2014 ${anchor}` : "";
};
function detectTensions(c) {
  const out = [];
  const approach = Math.max(v(c, "affection"), v(c, "attraction"), v(c, "desire"), v(c, "tenderness"), v(c, "trust"));
  const guard = Math.max(v(c, "fear"), v(c, "anxiety"), v(c, "insecurity"), v(c, "shame"), v(c, "embarrassment"));
  if (v(c, "desire") >= 0.45 && v(c, "shame") >= 0.4)
    out.push("wants what they feel they should not \u2014 desire fighting shame");
  else if (approach >= 0.45 && guard >= 0.4)
    out.push("drawn closer but braced to be hurt \u2014 approach, then retreat");
  if (v(c, "anger") >= 0.45 && Math.max(v(c, "affection"), v(c, "tenderness")) >= 0.4)
    out.push("angry at someone they still care for \u2014 heat over a tender spot");
  if (v(c, "dominance") >= 0.45 && v(c, "submission") >= 0.4)
    out.push("torn between taking control and giving in");
  if (v(c, "sexual_arousal") >= 0.5 && v(c, "trust") < 0.3 && Math.max(v(c, "fear"), v(c, "anxiety")) >= 0.3)
    out.push("aroused but not safe \u2014 wary of their own wanting");
  return out.slice(0, 2);
}
function groundedReadout(c) {
  const lines = [];
  const valenceDef = EMOTION_BY_KEY["valence"];
  const moodDef = EMOTION_BY_KEY["mood"];
  const valenceAnchor = rubricFor(valenceDef, v(c, "valence"));
  const moodAnchor = rubricFor(moodDef, v(c, "mood"));
  lines.push(`  energy: ${describeValue(valenceDef, v(c, "valence")).meaning}${valenceAnchor ? ` \u2014 ${valenceAnchor}` : ""}`);
  lines.push(`  agreeableness: ${describeValue(moodDef, v(c, "mood")).meaning}${moodAnchor ? ` \u2014 ${moodAnchor}` : ""}`);
  const g = groupedSalient(c);
  if (g.approach?.length)
    lines.push(`  pulling them toward you: ${fmtList(g.approach)}${leadRubric(g.approach)}`);
  if (g.guard?.length)
    lines.push(`  holding back / wary: ${fmtList(g.guard)}${leadRubric(g.guard)}`);
  if (g.down?.length)
    lines.push(`  weighing them down: ${fmtList(g.down)}${leadRubric(g.down)}`);
  if (g.aggression?.length)
    lines.push(`  sharp edge / friction: ${fmtList(g.aggression)}${leadRubric(g.aggression)}`);
  const power = [];
  if (v(c, "dominance") >= SALIENT_UNI)
    power.push("wants to take charge");
  if (v(c, "submission") >= SALIENT_UNI)
    power.push("inclined to yield, defer");
  if (power.length)
    lines.push(`  power: ${power.join("; ")}`);
  for (const t of detectTensions(c))
    lines.push(`  tension: ${t}`);
  if (lines.length === 2)
    lines.push("  (emotionally quiet, even-keeled)");
  return lines.join(`
`);
}
function investmentRegister(c) {
  const spark = Math.max(v(c, "joy"), v(c, "excitement"), v(c, "curiosity"), v(c, "attraction"));
  const litUp = spark >= 0.45 && v(c, "boredom") < 0.3 && v(c, "mood") > 0;
  if (litUp)
    return "genuinely enjoying this \u2014 and it shows: they give more, build on what the" + " player offers AND add their own, take risks, initiate. Their pleasure in" + " the scene is visible in how they play it.";
  const disinvested = v(c, "boredom") >= 0.45 || v(c, "valence") <= -0.35 && v(c, "mood") <= 0;
  if (disinvested)
    return "not feeling it \u2014 and they don't fake it. They give less, redirect toward" + " what THEY care about, or start winding the scene down. No service enthusiasm.";
  return "engaged but not yet won over \u2014 they participate, but their warmth and" + " initiative must be earned.";
}
function deliveryRegister(c) {
  const lines = [];
  if (v(c, "valence") <= -0.35 || v(c, "fatigue") >= 0.5 || v(c, "sadness") >= 0.55)
    lines.push("running on empty \u2014 short, flat dialogue, minimal effort; they answer what" + " they must and volunteer little. Narration may stay rich, but THEIR engagement shrinks.");
  if (v(c, "anger") >= 0.45 || v(c, "irritation") >= 0.55)
    lines.push("clipped, interruptive speech; refuses to elaborate; ends lines early.");
  if (v(c, "anxiety") >= 0.45 || v(c, "insecurity") >= 0.5)
    lines.push("hedges, qualifies, trails off mid-thought; circles back to reassure or retract.");
  if (v(c, "valence") <= -0.5 && v(c, "mood") <= -0.2)
    lines.push("disengaging \u2014 one-line answers are in character; they may try to wind the scene down or leave.");
  if (v(c, "valence") >= 0.5 && v(c, "mood") >= 0.3)
    lines.push("lit up \u2014 quick, expansive, talkative; carries the scene.");
  return lines;
}
function overrideTier(value, kind) {
  const m = kind === "bipolar" ? Math.abs(value) : value;
  if (m >= 0.985)
    return "all-consuming";
  if (m >= 0.93)
    return "overwhelming";
  if (m >= 0.88)
    return "intense";
  return null;
}
function overrideDirective(c) {
  const rows = EMOTIONS.map((def) => ({ def, val: v(c, def.key), tier: overrideTier(v(c, def.key), def.kind) })).filter((r) => r.tier).sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
  if (!rows.length)
    return "";
  const lines = [
    "\u203C OVERRIDING STATE \u2014 this OUTRANKS composure. Play it at full force; do not",
    '   soften, balance, or "stay in character" against it:'
  ];
  for (const { def, val, tier } of rows) {
    const name = def.label.toLowerCase().split(" (")[0];
    const desc = describeValue(def, val).meaning;
    if (tier === "all-consuming") {
      lines.push(`  \u2022 ${name} is ALL-CONSUMING. It has wholly taken ${c.name} over. Drop their usual` + ` composure and restraint \u2014 right now they ARE this feeling and act on it past every` + ` limit, however out of character that is for who they usually are (${desc}).`);
    } else if (tier === "overwhelming") {
      lines.push(`  \u2022 ${name} is OVERWHELMING \u2014 it crowds out their other feelings and their judgment;` + ` composure is failing and it dictates what they do and say (${desc}).`);
    } else {
      lines.push(`  \u2022 ${name} is INTENSE and dominating them \u2014 it breaks through composure and runs the` + ` moment (${desc}).`);
    }
  }
  return lines.join(`
`);
}
function characterBlock(c, humanTexture = true) {
  const lines = [];
  lines.push(`## ${c.name}${c.isPrimary ? "" : " (supporting character)"}`);
  const override = overrideDirective(c);
  if (override)
    lines.push(override);
  lines.push("");
  lines.push("Underneath (embody \u2014 do not narrate or name any of this):");
  lines.push(groundedReadout(c));
  lines.push(`  ${approvalLine(c)}`);
  lines.push(`  investment in the scene: ${investmentRegister(c)}`);
  if (humanTexture)
    for (const d of deliveryRegister(c))
      lines.push(`  delivery: ${d}`);
  if (c.offscreenSummary?.trim())
    lines.push(`  since you last saw them: ${c.offscreenSummary.trim()}`);
  return lines.join(`
`);
}
function buildDirective(run, opts = {}) {
  const present = Object.values(run.characters).filter((c) => c.present);
  if (!present.length)
    return null;
  present.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const humanTexture = opts.humanTexture !== false;
  const blocks = present.map((c) => characterBlock(c, humanTexture)).join(`

`);
  return [
    "[Psyche \u2014 emotional state]",
    "Each character below carries a live emotional state and an APPROVAL ledger \u2014",
    "their accumulated, durable opinion of the player. High approval buys trust and",
    "willingness: they'll go along even when it cuts against their own preferences.",
    "Low approval means guardedness, pushback, refusal. It moves slowly; act the",
    "current level, do not leap ahead of it.",
    "",
    "EMBODIMENT: act their state through behavior \u2014 posture, tone, word choice, what",
    "they reach for and hold back; let stronger feelings break composure. Never",
    "recite, name, or mention any of these notes \u2014 just live them.",
    "",
    ...humanTexture ? [
      "MATCH THEIR ENERGY: the length and effort of each character's dialogue must",
      "track their state, not a service standard. A drained, bored, or withdrawn",
      "character gives less \u2014 short lines, low effort \u2014 even while the surrounding",
      "narration stays vivid. An energized character gives more.",
      ""
    ] : [],
    'PRIORITY: if a character has an "OVERRIDING STATE", it dominates EVERYTHING else',
    'about them for this reply. Do not moderate it to keep them "composed"; at',
    "all-consuming intensity they break from their usual self and are wholly run by",
    "that feeling.",
    "",
    blocks
  ].join(`
`);
}

// src/run.ts
var runPath = (chatId) => `runs/${chatId}.json`;
var PSYCHE_EXT = "psyche";
var injectMetaPath = (cid) => `inject/${cid}.json`;
function isInjectionEntry(extensions) {
  const wf = extensions?.[PSYCHE_EXT];
  return Boolean(wf?.inject);
}
async function ensureInjectionEntry(characterId, characterName, userId) {
  try {
    const meta = await spindle.storage.getJson(injectMetaPath(characterId), {
      fallback: null
    });
    if (meta?.entryId) {
      const entry2 = await spindle.world_books.entries.get(meta.entryId, userId).catch(() => null);
      if (entry2) {
        if (entry2.disabled || !entry2.constant) {
          await spindle.world_books.entries.update(meta.entryId, { disabled: false, constant: true }, userId).catch(() => {});
        }
        return meta.entryId;
      }
    }
    const book = await spindle.world_books.create({
      name: `${characterName || "Character"} \u2014 Psyche`,
      description: "Live emotional state injected by the Psyche extension. Managed automatically.",
      metadata: { psyche: true }
    }, userId);
    const entry = await spindle.world_books.entries.create(book.id, {
      comment: "[Psyche] live emotional state",
      content: "(emotional state will appear here while Psyche is active)",
      key: ["__psyche_state__"],
      disabled: false,
      constant: true,
      extensions: { [PSYCHE_EXT]: { inject: true } }
    }, userId);
    const char = await spindle.characters.get(characterId, userId).catch(() => null);
    const current = char?.world_book_ids ?? [];
    if (!current.includes(book.id)) {
      await spindle.characters.update(characterId, { world_book_ids: [...current, book.id] }, userId);
    }
    await spindle.storage.setJson(injectMetaPath(characterId), { bookId: book.id, entryId: entry.id });
    spindle.log.info(`[psyche] provisioned injection entry ${entry.id} for character ${characterId}`);
    return entry.id;
  } catch (err) {
    spindle.log.error(`[psyche] ensureInjectionEntry failed: ${String(err)}`);
    return null;
  }
}

// packages/core/src/tools.ts
var str = (a, k, d = "") => typeof a[k] === "string" ? a[k] : d;
var num = (a, k) => {
  const v2 = a[k];
  return typeof v2 === "number" && Number.isFinite(v2) ? v2 : null;
};
var bool = (a, k) => Boolean(a[k]);
var EMOTION_LIST = EMOTION_KEYS.join(", ");
var TOOL_SCHEMAS = [
  {
    name: "list_characters",
    description: "List every character tracked in this run \u2014 id, name, whether primary (the card character) or a supporting NPC, and whether present in the scene. Call first to orient yourself.",
    parameters: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "read_character",
    description: "Read one character's current affect vector (each feeling's value + resting baseline) and approval of the player. Read before you revise so you know their exact starting point.",
    parameters: {
      type: "object",
      properties: { character_id: { type: "string" } },
      required: ["character_id"],
      additionalProperties: false
    }
  },
  {
    name: "create_character",
    description: "Introduce a new supporting character (NPC) that has entered the run. Do NOT create the player. Only create characters the story actually introduces.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        present: { type: "boolean", description: "Are they in the scene with the player right now?" }
      },
      required: ["name"],
      additionalProperties: false
    }
  },
  {
    name: "set_present",
    description: "Mark whether a character is currently in the scene with the player. Only present characters have their emotional state injected into the reply. Off-scene characters keep their state frozen until they return.",
    parameters: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        present: { type: "boolean" }
      },
      required: ["character_id", "present"],
      additionalProperties: false
    }
  },
  {
    name: "delete_character",
    description: "Remove a character from the run entirely (e.g. they were merged, never mattered, or are permanently gone). Irreversible.",
    parameters: {
      type: "object",
      properties: { character_id: { type: "string" } },
      required: ["character_id"],
      additionalProperties: false
    }
  },
  {
    name: "apply_stimulus",
    description: `Nudge ONE feeling up or down in response to what just happened \u2014 the primary way you move a mind. \`intensity\` is the signed strength of the event: a passing pleasantry +0.5, a normal meaningful moment +1 to +2, a strong emotional beat +3 to +5, a genuine shock +6 to +8; negative values relieve the feeling. Feelings saturate HARD, so from rest +1 only reaches ~0.22, +3 ~0.53, +5 ~0.71, and crossing 0.9 needs ~+9 of pressure accumulated over many turns \u2014 high values must be earned, never granted by one nice exchange. Valid emotions: ${EMOTION_LIST}.`,
    parameters: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        emotion: { type: "string", description: "One emotion key from the valid list." },
        intensity: { type: "number", description: "Signed event strength, typically -8..+8 (most turns \xB10.5..2)." },
        reason: { type: "string", description: "Brief why, for the log/panel." }
      },
      required: ["character_id", "emotion", "intensity"],
      additionalProperties: false
    }
  },
  {
    name: "set_emotion",
    description: "Hard-set ONE feeling to an exact value, bypassing the saturation curve. Use sparingly \u2014 for a narrative reset (e.g. a shock that instantly maxes fear). Unipolar feelings take 0..1; valence and mood take -1..1.",
    parameters: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        emotion: { type: "string" },
        value: { type: "number" },
        reason: { type: "string" }
      },
      required: ["character_id", "emotion", "value"],
      additionalProperties: false
    }
  },
  {
    name: "set_baseline",
    description: "Set a feeling's resting baseline \u2014 the temperament it relaxes toward over time when nothing feeds it. Use to shape lasting personality shifts (e.g. growing trust makes wariness rest lower). Same ranges as set_emotion.",
    parameters: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        emotion: { type: "string" },
        value: { type: "number" }
      },
      required: ["character_id", "emotion", "value"],
      additionalProperties: false
    }
  },
  {
    name: "adjust_approval",
    description: "Adjust the character's APPROVAL of the PLAYER \u2014 their accumulated, durable opinion, RPG-style (-10000..+10000, never decays). Move it when the player's words or actions align with, or cut against, the character's GENUINE wishes. Signed integer delta, hard-capped at \xB110 per call: \xB11-3 a minor beat, \xB14-7 a significant one, \xB18-10 a major betrayal or sacrifice. Most turns warrant 0 or \xB11-3 for at most one or two characters; do not adjust by reflex every turn. This is a ledger built over many turns, not a mood.",
    parameters: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        delta: { type: "number", description: "Signed integer, clamped to -10..+10." },
        reason: { type: "string", description: "Brief why, for the log/panel." }
      },
      required: ["character_id", "delta"],
      additionalProperties: false
    }
  },
  {
    name: "note_knowledge",
    description: 'Log one short fact THIS character now personally knows \u2014 something they witnessed, were directly told, or noticed themselves this turn. This feeds what they can reason from later when they act off-stage; do not log anything they did not actually perceive. Keep it to one plain sentence, their own frame of reference (e.g. "the player promised to meet me at the docks tonight", not a scene summary).',
    parameters: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        text: { type: "string", description: "One short first-person-relevant fact, plain sentence." }
      },
      required: ["character_id", "text"],
      additionalProperties: false
    }
  }
];
function find(run, id) {
  if (run.characters[id])
    return run.characters[id];
  const slug = slugify(id);
  if (run.characters[slug])
    return run.characters[slug];
  const byName = Object.values(run.characters).find((c) => c.name.toLowerCase() === id.toLowerCase());
  return byName ?? null;
}
function clampForKind(key, value) {
  const def = EMOTION_BY_KEY[key];
  if (!def)
    return value;
  return def.kind === "bipolar" ? Math.max(-1, Math.min(1, value)) : Math.max(0, Math.min(1, value));
}
async function executeTool(run, name, args) {
  switch (name) {
    case "list_characters": {
      const rows = Object.values(run.characters);
      if (!rows.length)
        return "No characters tracked yet.";
      return rows.map((c) => `- ${c.id} \u2014 ${c.name} [${c.isPrimary ? "primary" : "supporting"}, ${c.present ? "present" : "off-scene"}]`).join(`
`);
    }
    case "read_character": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      const feelings = EMOTIONS.map((def) => {
        const e = c.emotions[def.key] ?? { value: 0, baseline: 0 };
        const d = describeValue(def, e.value);
        return `  ${def.key}: ${e.value.toFixed(3)} (${d.label}) [baseline ${e.baseline.toFixed(2)}]`;
      }).join(`
`);
      return [
        `id: ${c.id}`,
        `name: ${c.name}`,
        `role: ${c.isPrimary ? "primary (card character)" : "supporting"}`,
        `present: ${c.present}`,
        `approval of the player: ${c.approval ?? 0} (${describeApproval(c.approval ?? 0).label})`,
        `affect:
${feelings}`
      ].join(`
`);
    }
    case "create_character": {
      const cname = str(args, "name").trim();
      if (!cname)
        return "create_character requires a name.";
      let id = slugify(cname);
      if (run.characters[id])
        id = `${id}_${Math.random().toString(36).slice(2, 5)}`;
      const c = newCharacter(id, cname, false);
      c.present = args.present === undefined ? true : bool(args, "present");
      run.characters[id] = c;
      return `Created supporting character ${id} (${cname}).`;
    }
    case "set_present": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      c.present = bool(args, "present");
      c.updatedAt = Date.now();
      return `${c.id} is now ${c.present ? "present" : "off-scene"}.`;
    }
    case "delete_character": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      if (c.isPrimary)
        return "Refusing to delete the primary card character.";
      delete run.characters[c.id];
      return `Deleted ${c.id}.`;
    }
    case "apply_stimulus": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      const key = str(args, "emotion").trim();
      const def = EMOTION_BY_KEY[key];
      if (!def)
        return `Unknown emotion "${key}". Valid: ${EMOTION_LIST}.`;
      const intensity = num(args, "intensity");
      if (intensity === null)
        return "apply_stimulus requires a numeric intensity.";
      backfillEmotions(c);
      const before = c.emotions[key].value;
      const after = applyStimulus(def, before, intensity);
      c.emotions[key].value = after;
      c.updatedAt = Date.now();
      const d = describeValue(def, after);
      return `${c.id} ${key}: ${before.toFixed(3)} -> ${after.toFixed(3)} (${d.label}).`;
    }
    case "set_emotion": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      const key = str(args, "emotion").trim();
      const def = EMOTION_BY_KEY[key];
      if (!def)
        return `Unknown emotion "${key}". Valid: ${EMOTION_LIST}.`;
      const value = num(args, "value");
      if (value === null)
        return "set_emotion requires a numeric value.";
      backfillEmotions(c);
      const v2 = clampForKind(key, value);
      c.emotions[key].value = v2;
      c.updatedAt = Date.now();
      return `${c.id} ${key} set to ${v2.toFixed(3)} (${describeValue(def, v2).label}).`;
    }
    case "set_baseline": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      const key = str(args, "emotion").trim();
      if (!EMOTION_BY_KEY[key])
        return `Unknown emotion "${key}". Valid: ${EMOTION_LIST}.`;
      const value = num(args, "value");
      if (value === null)
        return "set_baseline requires a numeric value.";
      backfillEmotions(c);
      c.emotions[key].baseline = clampForKind(key, value);
      c.updatedAt = Date.now();
      return `${c.id} ${key} baseline set to ${c.emotions[key].baseline.toFixed(3)}.`;
    }
    case "adjust_approval": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      const delta = num(args, "delta");
      if (delta === null)
        return "adjust_approval requires a numeric delta.";
      backfillEmotions(c);
      const d = Math.max(-10, Math.min(10, Math.round(delta)));
      const before = c.approval ?? 0;
      const after = Math.max(APPROVAL_MIN, Math.min(APPROVAL_MAX, before + d));
      c.approval = after;
      c.updatedAt = Date.now();
      return `${c.id} approval: ${before} -> ${after} (${describeApproval(after).label}).`;
    }
    case "note_knowledge": {
      const c = find(run, str(args, "character_id"));
      if (!c)
        return `No character "${str(args, "character_id")}".`;
      const text = str(args, "text").trim();
      if (!text)
        return "note_knowledge requires text.";
      pushKnowledge(c, text);
      c.updatedAt = Date.now();
      return `${c.id} now knows: "${text}"`;
    }
    default:
      return `Unknown tool ${name}.`;
  }
}

// packages/core/src/prompts.ts
var AGENT_SENTINEL = "<<psyche_engine>>";
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  if (start === -1)
    return null;
  const end = raw.lastIndexOf("}");
  if (end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {}
  }
  return salvageJson(raw.slice(start));
}
function salvageJson(s) {
  const scan = (str2) => {
    let inString = false;
    let escaped = false;
    const stack = [];
    for (const ch of str2) {
      if (inString) {
        if (escaped)
          escaped = false;
        else if (ch === "\\")
          escaped = true;
        else if (ch === '"')
          inString = false;
        continue;
      }
      if (ch === '"')
        inString = true;
      else if (ch === "{")
        stack.push("}");
      else if (ch === "[")
        stack.push("]");
      else if (ch === "}" || ch === "]")
        stack.pop();
    }
    return { inString, stack };
  };
  if (!scan(s).stack.length)
    return null;
  let body = s;
  for (let attempt = 0;attempt < 6; attempt++) {
    const { inString, stack } = scan(body);
    if (!stack.length)
      break;
    const candidate = `${(inString ? `${body}"` : body).replace(/[\s,]*$/, "").replace(/:\s*$/, ": null")}` + stack.slice().reverse().join("");
    try {
      return JSON.parse(candidate);
    } catch {
      const lastQuote = body.lastIndexOf('"', body.length - 2);
      if (lastQuote <= 0)
        break;
      body = body.slice(0, lastQuote).replace(/[\s,]*$/, "").replace(/,?\s*[[{]\s*$/, "");
    }
  }
  return null;
}
function updateSystemPrompt(directive2, includeRubrics = true) {
  return [
    AGENT_SENTINEL,
    "You are Psyche, the silent mind-engine behind a roleplay. You are NOT speaking to",
    "the player. After each exchange you update how the non-player characters FEEL \u2014",
    "their emotions and their approval of the player \u2014 so the next reply is driven by",
    "an honest inner life.",
    "",
    "THE AFFECT MODEL. Each character carries 40 feelings. 38 are unipolar (0 = absent,",
    "1 = all-consuming, drives them to extremes). Two are bipolar in -1..1: valence",
    "(energy/psychological arousal) and mood (agreeableness). This is an adult engine \u2014",
    "sexual_arousal is a normal, first-class feeling to track when the scene warrants.",
    "",
    "READ THE DELIVERY, NOT JUST THE WORDS. How something is said carries as much",
    "emotional weight as what is said \u2014 often more. The SAME words land completely",
    'differently by tone: an eager "yes!" vs a flat "yes." vs a reluctant "...yes" vs a',
    'clipped "yes" vs an enthusiastic paragraph must move feelings in different',
    "directions and amounts. Read closely for:",
    "  \u2022 register and warmth \u2014 enthusiasm vs listlessness vs coldness vs neutrality;",
    "  \u2022 punctuation and shape \u2014 exclamation vs period vs ellipsis/trailing off, ALL",
    "    CAPS, one-word answers, clipped vs effusive, going quiet, not answering;",
    "  \u2022 hesitation, hedging, deflection, sarcasm, forced politeness masking something,",
    "    over-eagerness, defensiveness, things said to fill silence;",
    "  \u2022 described body language and microexpressions \u2014 a glance away, a tight smile, a",
    "    flinch, a pause, fidgeting, stiffening, leaning in \u2014 these are STRONG signals;",
    "  \u2022 subtext: what is implied or pointedly NOT said, and any shift from a",
    "    character's or the player's prior register (suddenly terse, suddenly effusive,",
    "    a warmth that cools). A change in manner is itself an event.",
    "These fine cues are real and must register \u2014 usually small-to-moderate stimulus,",
    "but never zero just because no overt emotional statement was made. A character",
    "feels the difference between being met warmly and being humored, even when the",
    "literal words are identical.",
    "",
    "SATURATION \u2014 read this carefully. Feelings strongly resist their extremes.",
    "apply_stimulus pushes in a saturating space, so the same intensity moves a calm",
    "mind far more than an overwhelmed one, and the high end is genuinely hard to",
    "reach. From rest, a single +1 only reaches ~0.22, +3 ~0.53, +5 ~0.71; crossing",
    "0.9 needs ~+9 of ACCUMULATED pressure, i.e. the same strong beat hit again and",
    "again over many turns. So:",
    "  \u2022 Size intensity by the event: a passing pleasantry +0.5, a normal meaningful",
    "    moment +1 to +2, a strong emotional beat +3 to +5, a genuine shock +6 to +8.",
    "    Use negative intensity just as readily to relieve a feeling the moment eased.",
    "  \u2022 A first, friendly meeting should leave someone mildly curious or warm (landing",
    "    ~0.2-0.4), NOT amused/excited/tender all at 0.9. Most turns move only one to",
    "    three feelings; do not light up the whole vector.",
    "  \u2022 Values above ~0.7 should be uncommon and correspond to real, established,",
    "    repeatedly-fed emotional investment \u2014 never a single nice exchange.",
    "Reserve set_emotion for a true shock/reset that genuinely snaps a feeling to a",
    "value (e.g. sudden terror); it bypasses saturation, so use it rarely.",
    "",
    "WHAT TO DO EACH TURN:",
    "  \u2022 Update the affect of every character PRESENT in the scene, based on what was",
    "    said and done to and by them. Relieve feelings that the moment soothed",
    "    (negative intensity) as readily as you raise ones it provoked.",
    "  \u2022 Track APPROVAL (adjust_approval): the character's durable opinion of the",
    "    player \u2014 gained when the player's actions align with the character's",
    "    genuine wishes, lost when they cut against them. Small honest increments",
    "    (\xB11-3 typical); it is a ledger built over many turns, not a mood, and",
    "    unlike feelings it never decays.",
    "  \u2022 When something happens that a character would specifically remember or",
    "    could later act on (a promise, a threat, something told to them in",
    "    confidence, a plan made), note_knowledge it for them \u2014 this is what lets",
    "    them act sensibly off-stage later. Do not log routine scene description.",
    "  \u2022 Occasionally nudge a baseline (set_baseline) when a lasting change of",
    "    temperament is earned \u2014 not every turn.",
    "",
    "TRACK EVERY NAMED CHARACTER \u2014 NOT JUST THE ONES CENTRAL TO THIS SCENE. If a",
    "character has a NAME, they are significant enough to have their own affect",
    "vector and approval ledger. This is not optional and not just for people who",
    "feel important: a shopkeeper mentioned once by name, a friend referenced but",
    "not present, a messenger who delivers one line \u2014 all of them get tracked the",
    'moment they are named, not once they "become relevant". Call list_characters',
    "first to see who already exists, then create_character for every named person",
    "in the story so far who is missing from that list (use set_present to mark",
    "whether they are actually in the current scene \u2014 most newly-created ones from",
    'past turns will be off-scene). An unnamed or generic figure ("a guard",',
    '"the crowd") is NOT tracked; a NAMED one always is, however minor.',
    "",
    "ECONOMY. Once tracking is complete, make the affect/approval changes THIS turn",
    "warrants and stop \u2014 you do not need to touch every character's feelings every",
    "turn, only the ones actually present or directly affected. When done, reply",
    "with a one-line summary and no tool calls.",
    ...includeRubrics ? [
      "",
      "WHAT EACH LEVEL LOOKS LIKE. Size your stimulus so the RESULTING value matches",
      "the behavior you actually expect to see next turn:",
      rubricTableText()
    ] : [],
    directive2.trim() ? `
OPERATOR DIRECTIVE:
${directive2.trim()}` : ""
  ].join(`
`);
}
function emotionSummary(c) {
  const notable = EMOTIONS.filter((def) => {
    const v2 = c.emotions[def.key]?.value ?? 0;
    return def.kind === "bipolar" ? Math.abs(v2) >= 0.15 : v2 >= 0.2;
  }).map((def) => {
    const v2 = c.emotions[def.key]?.value ?? 0;
    return `${def.key} ${v2.toFixed(2)} (${def.kind === "bipolar" ? "axis" : "level"})`;
  }).join(", ");
  return notable || "all quiet";
}
function stateSnapshot(run) {
  const chars = Object.values(run.characters);
  if (!chars.length)
    return "(no characters tracked yet)";
  return chars.map((c) => [
    `### ${c.id} \u2014 ${c.name} [${c.isPrimary ? "primary" : "supporting"}, ${c.present ? "present" : "off-scene"}]`,
    `approval of the player: ${c.approval ?? 0} (${describeApproval(c.approval ?? 0).label})`,
    `feelings: ${emotionSummary(c)}`
  ].join(`
`)).join(`

`);
}
function updateUserContent(run, transcript, cardContext) {
  return [
    "THE SCALE (what each level means):",
    genericScaleText(),
    "",
    cardContext ? ["PRIMARY CHARACTER CARD (source of truth for who they are):", '"""', cardContext, '"""', ""].join(`
`) : "",
    "CURRENT TRACKED STATE:",
    stateSnapshot(run),
    "",
    "THE FULL STORY SO FAR (oldest first, the most recent turn last):",
    '"""',
    transcript,
    '"""',
    "",
    "First: compare CURRENT TRACKED STATE above against the story and",
    "create_character any NAMED character who appears in the story but is not yet",
    "listed, however minor their role. Then update the present/affected characters:",
    "move their feelings to reflect what just happened (apply_stimulus, occasionally",
    "set_emotion/set_baseline) and adjust approval. Be economical about affect/",
    "approval changes, but not about tracking \u2014 every named character gets an entry."
  ].filter(Boolean).join(`
`);
}

// packages/core/src/offscreen.ts
var OFFSCREEN_EVENT_BUDGET = 1;
var OFFSCREEN_FEELING_CLAMP = 5;
var OFFSCREEN_APPROVAL_CLAMP = 5;
var KNOWLEDGE_CONTEXT_LINES = 8;
var SALIENT_THRESHOLD = 0.35;
var DESCRIPTION_CAP = 4000;
var KNOWLEDGE_LINE_CAP = 2500;
var SUMMARY_CAP = 250;
function salientFeelings(c) {
  const rows = EMOTIONS.filter((def) => def.kind === "unipolar").map((def) => ({ def, value: c.emotions[def.key]?.value ?? 0 })).filter((r) => r.value >= SALIENT_THRESHOLD).sort((a, b) => b.value - a.value).slice(0, 4);
  if (!rows.length)
    return "quiet, even-keeled";
  return rows.map((r) => `${r.def.label.toLowerCase().split(" (")[0]} (${describeValue(r.def, r.value).label})`).join(", ");
}
function castingSystemPrompt() {
  return [
    AGENT_SENTINEL,
    "You are casting this turn's off-stage activity. The player is on stage with",
    "someone else; these characters are elsewhere. You do not write what happens \u2014",
    "you only decide the SHAPE of it: who is alone, and who plausibly crosses paths",
    "with whom.",
    "",
    "Assign every character listed below to exactly one group. A group of one is a",
    "solitary character. A group of two or more means they are together this turn \u2014",
    "only group characters who could plausibly be in the same place, given who they",
    "are and how they currently feel; do not force an encounter that makes no sense.",
    "Most turns, most characters are alone \u2014 that is normal and correct.",
    "",
    'For any group of 2+, add a one-line "steer": the FLAVOR of the interaction (e.g.',
    '"catching up over a drink", "an old disagreement resurfaces", "working together',
    'on something practical") \u2014 never its content, dialogue, or outcome. That gets',
    "written later, by someone else, with more room to think it through.",
    "",
    'Return ONLY JSON: { "groups": [ { "characterIds": ["<id>", ...], "steer": "<optional, only for 2+>" } ] }'
  ].join(`
`);
}
function castingUserContent(roster) {
  return [
    "OFF-STAGE RIGHT NOW:",
    ...roster.map((r) => `  ${r.id} \u2014 ${r.name}: ${r.oneLineState}`),
    "",
    "Cast this turn. Return only the JSON."
  ].join(`
`);
}
function parseCasting(raw, offStageIds) {
  const known = new Set(offStageIds);
  const assigned = new Set;
  const groups = [];
  const o = raw;
  const rawGroups = Array.isArray(o?.groups) ? o.groups : [];
  for (const g of rawGroups) {
    const go = g;
    const ids = Array.isArray(go.characterIds) ? go.characterIds.filter((x) => typeof x === "string" && known.has(x) && !assigned.has(x)) : [];
    if (!ids.length)
      continue;
    for (const id of ids)
      assigned.add(id);
    const steer = typeof go.steer === "string" && go.steer.trim() ? go.steer.trim().slice(0, 200) : undefined;
    groups.push(ids.length > 1 ? { characterIds: ids, steer } : { characterIds: ids });
  }
  for (const id of offStageIds) {
    if (!assigned.has(id))
      groups.push({ characterIds: [id] });
  }
  return { groups };
}
function unitSystemPrompt(eventBudget) {
  return [
    AGENT_SENTINEL,
    "You are the prose writer for this scene \u2014 exactly as much as you would be if the",
    "player were sitting right here watching it. The character(s) below are off-stage",
    "right now, living their own lives, and this is THEIR turn. Write it at full",
    "strength: real setting, real sensory detail, real action, real dialogue if more",
    "than one of them is present \u2014 the same craft and length you would bring to an",
    "on-stage reply. A single flat summary sentence is a failure here, not economy.",
    "",
    "Most turns still call for something modest \u2014 not everyone lives an adventure every",
    'moment \u2014 but "modest" means the STAKES are small, not that the WRITING is thin. A',
    "quiet character doing a small, ordinary thing still gets a fully written scene of",
    "it: how the room feels, what they notice, what they do, what runs through their",
    "head. An empty events list is still the right answer when truly nothing is",
    "happening (they are asleep, in transit, waiting) \u2014 but when you do write something,",
    "commit to it as a real scene, a full paragraph or more.",
    `Write ${eventBudget === 1 ? "one such scene" : `up to ${eventBudget} such scenes`} this turn \u2014 one` + " well-developed scene is normal; only write more than one if this character",
    "genuinely does several distinct, separated things.",
    "",
    "If there is more than one character below, they are TOGETHER right now \u2014 write ONE",
    "shared scene with all of them as participants (dialogue between them is exactly",
    "right here), then give each of them their OWN knowledgeFor entry: THEIR side of it,",
    "in their own voice, as a real first-person paragraph \u2014 what they noticed, said, felt,",
    "concluded. Two participants in the same scene should NOT produce identical",
    "knowledgeFor text; write each one's account the way that person would actually tell",
    "it, which is rarely identical to the other's. Someone not listed below was not",
    "there and knows nothing of it.",
    "",
    "NONE OF THIS REACHES THE PLAYER DIRECTLY. It becomes private knowledge. The player",
    "finds out only if a character later chooses to tell them, or a future turn notices",
    "they would plausibly know. So: do not resolve the story's plot, do not have anyone",
    "discover what the player is doing on stage, and do not write anything happening in",
    'the on-stage location \u2014 treat the "ON-STAGE RIGHT NOW" names below as off-limits,',
    "not participants.",
    "",
    "APPROVAL. Only include an approval delta for a character whose action or reflection",
    "here is EXPLICITLY about the player \u2014 something they already know involving the",
    'player (check their "knows" list below first). Never invent an opinion of the',
    "player out of an unrelated solitary scene. Most characters get no approval delta",
    "most turns. Keep deltas small \u2014 this is private reflection, not a scene with the",
    "player.",
    "",
    "Return ONLY JSON:",
    "{",
    '  "events": [',
    '    { "description": "the full scene, written in real prose \u2014 a paragraph or more,',
    '                       not a summary sentence",',
    '      "participants": ["<id>", ...],',
    `      "knowledgeFor": { "<id>": "that character's own first-person paragraph \u2014 their`,
    '                                 side of it, in their voice" } }',
    "  ],",
    '  "feelings": [ { "characterId": "<id>", "emotion": "<emotion key>", "intensity": 0.0, "reason": "why" } ],',
    '  "approvals": [ { "characterId": "<id>", "delta": 0, "reason": "why, tied to something they know about the player" } ],',
    `  "summaries": { "<id>": "one line: what they've been up to (this one stays SHORT \u2014`,
    `                          it's injected inline once they're back on stage)" }`,
    "}",
    "",
    "Feelings move gently \u2014 intensity roughly \xB10.5 to \xB12 unless something real and",
    "specific happened to them. Only use the character ids you were given."
  ].join(`
`);
}
function unitUserContent(members, steer, onStageNames) {
  return [
    `ON-STAGE RIGHT NOW (off-limits \u2014 do not write anything happening there, they cannot`,
    `know what's said or done there unless told afterward): ${onStageNames.length ? onStageNames.join(", ") : "(nobody)"}`,
    "",
    steer ? `TOGETHER THIS TURN \u2014 ${steer}` : "",
    "",
    ...members.map(({ c, feelings }) => {
      const knowledge = (c.knowledge ?? []).slice(-KNOWLEDGE_CONTEXT_LINES);
      return [
        `### ${c.id} \u2014 ${c.name}`,
        `  ${approvalLine(c)}`,
        `  feeling: ${feelings}`,
        `  recently up to: ${c.offscreenSummary?.trim() || "(nothing notable yet)"}`,
        "  knows (most recent last):",
        knowledge.length ? knowledge.map((k) => `    - ${k}`).join(`
`) : "    (nothing notable)"
      ].join(`
`);
    }),
    "",
    "What happened? Return only the JSON."
  ].filter((l) => l !== "").join(`
`);
}
function parseUnitResult(raw, memberIds, eventBudget) {
  const known = new Set(memberIds);
  const o = raw;
  const events = [];
  const rawEvents = Array.isArray(o?.events) ? o.events : [];
  const eventCountFor = new Map;
  for (const e of rawEvents) {
    const eo = e;
    const description = typeof eo.description === "string" ? eo.description.trim().slice(0, DESCRIPTION_CAP) : "";
    const participants = Array.isArray(eo.participants) ? eo.participants.filter((x) => typeof x === "string" && known.has(x)) : [];
    const knowledgeForRaw = eo.knowledgeFor && typeof eo.knowledgeFor === "object" ? eo.knowledgeFor : {};
    const knowledgeFor = {};
    for (const [id, text] of Object.entries(knowledgeForRaw)) {
      if (!known.has(id) || typeof text !== "string" || !text.trim())
        continue;
      const used = eventCountFor.get(id) ?? 0;
      if (used >= eventBudget)
        continue;
      knowledgeFor[id] = text.trim().slice(0, KNOWLEDGE_LINE_CAP);
      eventCountFor.set(id, used + 1);
    }
    if (!description || !participants.length || !Object.keys(knowledgeFor).length)
      continue;
    events.push({ description, participants, knowledgeFor });
  }
  const feelings = [];
  const rawFeelings = Array.isArray(o?.feelings) ? o.feelings : [];
  for (const f of rawFeelings) {
    const fo = f;
    const characterId = typeof fo.characterId === "string" ? fo.characterId : "";
    const emotion = typeof fo.emotion === "string" ? fo.emotion : "";
    const intensity = typeof fo.intensity === "number" && Number.isFinite(fo.intensity) ? fo.intensity : 0;
    if (!known.has(characterId) || !EMOTION_BY_KEY[emotion] || intensity === 0)
      continue;
    const clamped = Math.max(-OFFSCREEN_FEELING_CLAMP, Math.min(OFFSCREEN_FEELING_CLAMP, intensity));
    feelings.push({ characterId, emotion, intensity: clamped, reason: typeof fo.reason === "string" ? fo.reason.slice(0, 200) : "" });
  }
  const approvals = [];
  const rawApprovals = Array.isArray(o?.approvals) ? o.approvals : [];
  const eventParticipants = new Set(events.flatMap((e) => e.participants));
  for (const a of rawApprovals) {
    const ao = a;
    const characterId = typeof ao.characterId === "string" ? ao.characterId : "";
    const delta = typeof ao.delta === "number" && Number.isFinite(ao.delta) ? Math.round(ao.delta) : 0;
    if (!known.has(characterId) || delta === 0 || !eventParticipants.has(characterId))
      continue;
    const clamped = Math.max(-OFFSCREEN_APPROVAL_CLAMP, Math.min(OFFSCREEN_APPROVAL_CLAMP, delta));
    approvals.push({ characterId, delta: clamped, reason: typeof ao.reason === "string" ? ao.reason.slice(0, 200) : "" });
  }
  const summaries = {};
  const rawSummaries = o?.summaries && typeof o.summaries === "object" ? o.summaries : {};
  for (const [id, text] of Object.entries(rawSummaries)) {
    if (!known.has(id) || typeof text !== "string" || !text.trim())
      continue;
    summaries[id] = text.trim().slice(0, SUMMARY_CAP);
  }
  return { events, feelings, approvals, summaries };
}
function mergeOffscreenResults(results) {
  const merged = { events: [], feelings: [], approvals: [], summaries: {} };
  for (const r of results) {
    merged.events.push(...r.events);
    merged.feelings.push(...r.feelings);
    merged.approvals.push(...r.approvals);
    Object.assign(merged.summaries, r.summaries);
  }
  return merged;
}
function applyOffscreenResult(run, result, turnSeq) {
  const touched = new Set;
  for (const e of result.events) {
    for (const [id, line] of Object.entries(e.knowledgeFor)) {
      const c = run.characters[id];
      if (!c)
        continue;
      pushKnowledge(c, line);
      touched.add(id);
    }
  }
  for (const f of result.feelings) {
    const c = run.characters[f.characterId];
    const def = EMOTION_BY_KEY[f.emotion];
    const e = c?.emotions[f.emotion];
    if (!c || !def || !e)
      continue;
    e.value = applyStimulus(def, e.value, f.intensity);
    touched.add(f.characterId);
  }
  for (const a of result.approvals) {
    const c = run.characters[a.characterId];
    if (!c)
      continue;
    const before = c.approval ?? 0;
    c.approval = Math.max(APPROVAL_MIN, Math.min(APPROVAL_MAX, before + a.delta));
    touched.add(a.characterId);
  }
  for (const [id, summary] of Object.entries(result.summaries)) {
    const c = run.characters[id];
    if (!c)
      continue;
    c.offscreenSummary = summary;
    touched.add(id);
  }
  const now = Date.now();
  for (const id of touched) {
    const c = run.characters[id];
    if (!c)
      continue;
    c.updatedAt = now;
    c.offscreenAtTurn = turnSeq;
    c.lastOffscreenAt = now;
  }
  return { touched, events: result.events.length };
}

// src/agent.ts
function blockToText(b) {
  if (typeof b === "string")
    return b;
  const o = b;
  if (o?.type === "tool_use")
    return `\xABtool_use ${o.name}\xBB
${JSON.stringify(o.input ?? {}, null, 2)}`;
  if (o?.type === "tool_result")
    return `\xABtool_result\xBB
${typeof o.content === "string" ? o.content : JSON.stringify(o.content)}`;
  return JSON.stringify(b);
}
function serializeMessages(messages) {
  return messages.map((m) => {
    const content = Array.isArray(m.content) ? m.content.map(blockToText).join(`
`) : String(m.content ?? "");
    return `========== [${m.role}] ==========
${content}`;
  }).join(`

`);
}
async function runPsycheAgent(run, transcript, cardContext, opts) {
  const messages = [
    { role: "system", content: updateSystemPrompt(opts.directive) },
    { role: "user", content: updateUserContent(run, transcript, cardContext) }
  ];
  const toolCalls = [];
  let rounds = 0;
  let finalNote = "";
  for (;rounds < opts.maxRounds; rounds++) {
    const res = await spindle.generate.quiet({
      type: "quiet",
      messages,
      tools: TOOL_SCHEMAS,
      parameters: { temperature: 0.6 },
      reasoning: { source: "off" },
      signal: opts.signal,
      userId: opts.userId,
      ...opts.connectionId ? { connection_id: opts.connectionId } : {}
    });
    const calls = res.tool_calls ?? [];
    if (calls.length === 0) {
      finalNote = (res.content ?? "").trim();
      break;
    }
    messages.push({
      role: "assistant",
      content: calls.map((c) => ({
        type: "tool_use",
        id: c.call_id,
        name: c.name,
        input: c.args
      }))
    });
    const resultParts = [];
    for (const c of calls) {
      let result;
      try {
        result = await executeTool(run, c.name, c.args);
      } catch (err) {
        result = `Error in ${c.name}: ${String(err)}`;
      }
      toolCalls.push({ tool: c.name, result });
      resultParts.push({ type: "tool_result", tool_use_id: c.call_id, content: result });
    }
    messages.push({ role: "user", content: resultParts });
  }
  opts.onTrace?.({
    at: Date.now(),
    request: serializeMessages(messages),
    response: `final note: ${finalNote || "(none)"}

tool calls (${toolCalls.length}):
` + toolCalls.map((t, i) => `${i + 1}. ${t.tool} -> ${t.result}`).join(`
`),
    meta: `${rounds} rounds \xB7 connection: ${opts.connectionId || "prose default"}`
  });
  return { rounds, toolCalls, finalNote };
}
async function quietJson(system, user, opts) {
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user }
  ];
  const res = await spindle.generate.quiet({
    type: "quiet",
    messages,
    parameters: { temperature: 0.8 },
    ...opts.forceNoReasoning ? { reasoning: { source: "off" } } : {},
    signal: opts.signal,
    userId: opts.userId,
    ...opts.connectionId ? { connection_id: opts.connectionId } : {}
  });
  const content = res.content ?? "";
  return { content, log: { label: "", request: serializeMessages(messages), response: content } };
}
async function runOffscreenStage(run, opts) {
  const offStage = Object.values(run.characters).filter((c) => !c.present);
  if (!offStage.length)
    return null;
  const onStageNames = Object.values(run.characters).filter((c) => c.present).map((c) => c.name);
  const logs = [];
  const roster = offStage.map((c) => ({
    id: c.id,
    name: c.name,
    oneLineState: `${describeApproval(c.approval ?? 0).label} approval; feeling ${salientFeelings(c)}`
  }));
  const castingCall = await quietJson(castingSystemPrompt(), castingUserContent(roster), {
    forceNoReasoning: true,
    signal: opts.signal,
    userId: opts.userId,
    connectionId: opts.connectionId
  });
  logs.push({ ...castingCall.log, label: "casting" });
  const casting = parseCasting(extractJson(castingCall.content), offStage.map((c) => c.id));
  const unitResults = await Promise.all(casting.groups.map(async (g) => {
    const members = g.characterIds.map((id) => run.characters[id]).filter((c) => Boolean(c));
    if (!members.length)
      return null;
    try {
      const call = await quietJson(unitSystemPrompt(opts.eventBudget), unitUserContent(members.map((c) => ({ c, feelings: salientFeelings(c) })), g.steer, onStageNames), { forceNoReasoning: false, signal: opts.signal, userId: opts.userId, connectionId: opts.connectionId });
      logs.push({ ...call.log, label: `unit:${g.characterIds.join("+")}` });
      return parseUnitResult(extractJson(call.content), g.characterIds, opts.eventBudget);
    } catch (err) {
      logs.push({ label: `unit:${g.characterIds.join("+")}`, request: "(failed before response)", response: `Error: ${String(err)}` });
      return null;
    }
  }));
  const merged = mergeOffscreenResults(unitResults.filter((r) => r !== null));
  const { touched, events } = applyOffscreenResult(run, merged, run.turnSeq);
  opts.onTrace?.({
    at: Date.now(),
    request: logs.map((l) => `########## ${l.label} \u2014 REQUEST ##########
${l.request}`).join(`

`),
    response: logs.map((l) => `########## ${l.label} \u2014 RESPONSE ##########
${l.response}`).join(`

`),
    meta: `${casting.groups.length} group(s) \xB7 ${events} event(s) \xB7 ${touched.size} touched \xB7 connection: ${opts.connectionId || "prose default"}`
  });
  return { events, touched: touched.size, groups: casting.groups.length };
}

// src/backend.ts
var DEFAULT_CONFIG = {
  enabled: true,
  maxRounds: 8,
  decayRate: 0.12,
  directive: "",
  agentTimeoutMs: 90000,
  agentConnectionId: "",
  humanTexture: true,
  offscreenEnabled: true,
  offscreenEventBudget: OFFSCREEN_EVENT_BUDGET
};
var CONFIG_PATH = "config.json";
var config = { ...DEFAULT_CONFIG };
var chatChar = new Map;
var running = new Set;
var observers = new Map;
async function loadConfig() {
  const stored = await spindle.storage.getJson(CONFIG_PATH, { fallback: {} });
  config = { ...DEFAULT_CONFIG, ...stored };
}
async function saveConfig() {
  await spindle.storage.setJson(CONFIG_PATH, config, { indent: 2 });
}
async function loadRun(chatId) {
  const run = await spindle.storage.getJson(runPath(chatId), { fallback: emptyRun(chatId) });
  run.turnSeq ??= 0;
  for (const c of Object.values(run.characters))
    backfillEmotions(c);
  return run;
}
async function saveRun(run) {
  run.updatedAt = Date.now();
  await spindle.storage.setJson(runPath(run.chatId), run, { indent: 2 });
}
var debugPath = (chatId) => `debug/${chatId}.json`;
var DBG_REQ_CAP = 24000;
var DBG_RES_CAP = 1e4;
function capText(s, n) {
  if (s.length <= n)
    return s;
  const head = Math.floor(n * 0.7);
  return `${s.slice(0, head)}

\u2026[${s.length - n} chars elided]\u2026

${s.slice(-(n - head))}`;
}
function capTrace(t) {
  return { ...t, request: capText(t.request, DBG_REQ_CAP), response: capText(t.response, DBG_RES_CAP) };
}
async function loadDebug(chatId) {
  return spindle.storage.getJson(debugPath(chatId), { fallback: {} });
}
async function characterForChat(chatId, userId) {
  const cached = chatChar.get(chatId);
  if (cached) {
    const c = await spindle.characters.get(cached, userId);
    return c ? { id: c.id, name: c.name } : null;
  }
  try {
    const chat = await spindle.chats.get(chatId, userId);
    const cid = chat?.character_id;
    if (!cid)
      return null;
    chatChar.set(chatId, cid);
    const c = await spindle.characters.get(cid, userId);
    return c ? { id: c.id, name: c.name } : { id: cid, name: "the character" };
  } catch {
    return null;
  }
}
var lastLoadedConn = new Map;
spindle.on("CONNECTION_PROFILE_LOADED", (payload, userId) => {
  const id = payload?.id;
  if (typeof id === "string" && id)
    lastLoadedConn.set(userId ?? "", id);
});
async function resolveQuietConnection(configured, userId) {
  if (configured)
    return configured;
  try {
    const list = await spindle.connections.list(userId);
    if (!list.length)
      return;
    const last = lastLoadedConn.get(userId ?? "");
    if (last && list.some((c) => c.id === last))
      return last;
    const def = list.find((c) => c.is_default);
    return (def ?? list[0]).id;
  } catch (err) {
    spindle.log.warn(`[psyche] could not resolve a connection (falling back to host default): ${String(err)}`);
    return;
  }
}
var MAX_TRANSCRIPT_CHARS = 120000;
async function buildTranscript(chatId, reply) {
  const lines = [];
  try {
    const msgs = await spindle.chat.getMessages(chatId);
    for (const m of msgs) {
      const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      if (!text.trim())
        continue;
      lines.push(`${m.role === "user" ? "PLAYER" : "CHARACTER"}:
${text.trim()}`);
    }
  } catch {}
  const r = reply.trim();
  if (r && !(lines.length && lines[lines.length - 1].includes(r)))
    lines.push(`CHARACTER:
${r}`);
  return clampTranscript(lines.join(`

`).trim());
}
function clampTranscript(t) {
  if (t.length <= MAX_TRANSCRIPT_CHARS)
    return t;
  const head = Math.floor(MAX_TRANSCRIPT_CHARS * 0.4);
  const tail = MAX_TRANSCRIPT_CHARS - head;
  return `${t.slice(0, head)}

[\u2026 middle of the story elided for length; opening and recent turns shown in full \u2026]

${t.slice(-tail)}`;
}
function buildCardContext(char) {
  const c = char ?? {};
  const cap = (s, n) => s.length > n ? `${s.slice(0, n)}\u2026` : s;
  const fields = [
    ["Name", c.name, 200],
    ["Description", c.description, 2000],
    ["Personality", c.personality, 1000],
    ["Scenario", c.scenario, 1000],
    ["Opening", c.first_mes, 1500]
  ];
  return fields.filter(([, v2]) => typeof v2 === "string" && v2.trim()).map(([k, v2, n]) => `${k}: ${cap(v2.trim(), n)}`).join(`

`);
}
async function runAgentForChat(chatId, reply, userId) {
  if (!config.enabled || !reply.trim())
    return;
  const char = await characterForChat(chatId, userId);
  if (!char)
    return;
  const dbg = { stages: {} };
  const stageErrors = [];
  try {
    const run = await loadRun(chatId);
    ensurePrimary(run, char.id, char.name);
    run.turnSeq = (run.turnSeq ?? 0) + 1;
    relaxPresent(run, config.decayRate);
    const fullChar = await spindle.characters.get(char.id, userId).catch(() => null);
    const cardContext = buildCardContext(fullChar);
    const agentConn = await resolveQuietConnection(config.agentConnectionId, userId);
    const transcript = await buildTranscript(chatId, reply);
    let result = { rounds: 0, toolCalls: [], finalNote: "" };
    try {
      result = await runPsycheAgent(run, transcript, cardContext, {
        maxRounds: config.maxRounds,
        directive: config.directive,
        signal: AbortSignal.timeout(config.agentTimeoutMs),
        userId,
        connectionId: agentConn,
        onTrace: (t) => dbg.stages.update = capTrace(t)
      });
    } catch (err) {
      const m = err instanceof Error && err.name === "AbortError" ? "timed out" : String(err);
      result.finalNote = `update failed (${m})`;
      stageErrors.push({ stage: "update", error: m });
      spindle.log.error(`[psyche] update pass failed \u2014 ${m}`);
    }
    let offscreenNote = "";
    if (config.offscreenEnabled) {
      try {
        const off = await runOffscreenStage(run, {
          eventBudget: config.offscreenEventBudget,
          signal: AbortSignal.timeout(config.agentTimeoutMs),
          userId,
          connectionId: agentConn,
          onTrace: (t) => dbg.stages.offscreen = capTrace(t)
        });
        offscreenNote = off ? `${off.groups} group(s), ${off.events} event(s), ${off.touched} touched` : "no one off-stage";
      } catch (err) {
        const m = err instanceof Error && err.name === "AbortError" ? "timed out" : String(err);
        offscreenNote = `offscreen failed (${m})`;
        stageErrors.push({ stage: "offscreen", error: m });
        spindle.log.error(`[psyche] offscreen pass failed \u2014 ${m}`);
      }
    }
    await saveRun(run);
    await refreshInjection(chatId, userId);
    dbg.injection = {
      at: Date.now(),
      directive: capText(buildDirective(run, { humanTexture: config.humanTexture }) ?? "(nothing injected \u2014 no one present)", DBG_REQ_CAP)
    };
    try {
      const prev = await loadDebug(chatId);
      await spindle.storage.setJson(debugPath(chatId), {
        ...prev,
        ...dbg,
        stages: { ...prev.stages, ...dbg.stages }
      });
    } catch (err) {
      spindle.log.warn(`[psyche] could not save debug traces: ${String(err)}`);
    }
    spindle.sendToFrontend({
      type: "state_changed",
      chatId,
      characterCount: Object.keys(run.characters).length,
      rounds: result.rounds,
      edits: result.toolCalls.length,
      note: result.finalNote,
      offscreenNote,
      stageErrors
    });
    spindle.log.info(`[psyche] ${char.name}: ${result.toolCalls.length} edits / ${result.rounds} rounds` + (offscreenNote ? ` \xB7 offstage: ${offscreenNote}` : ""));
  } catch (err) {
    const msg = err instanceof Error && err.name === "AbortError" ? "engine timed out" : String(err);
    spindle.log.error(`[psyche] engine failed: ${msg}`);
  }
}
function relaxPresent(run, rate) {
  for (const c of Object.values(run.characters)) {
    if (!c.present)
      continue;
    for (const def of EMOTIONS) {
      const e = c.emotions[def.key];
      if (!e)
        continue;
      e.value = relaxToward(def, e.value, e.baseline, rate);
    }
  }
}
var pending = new Map;
function emitEngine(chatId, state2, stage, userId) {
  spindle.sendToFrontend({ type: "engine", chatId, state: state2, stage, queued: pending.has(chatId) }, userId);
}
function scheduleAgent(chatId, reply, userId) {
  if (!config.enabled || !reply.trim())
    return;
  if (running.has(chatId)) {
    pending.set(chatId, { reply, userId });
    spindle.log.info(`[psyche] engine busy for chat ${chatId}; queued latest turn`);
    emitEngine(chatId, "running", "queued another turn", userId);
    return;
  }
  runAgentLoop(chatId, reply, userId);
}
async function runAgentLoop(chatId, reply, userId) {
  running.add(chatId);
  emitEngine(chatId, "running", "starting", userId);
  try {
    await runAgentForChat(chatId, reply, userId);
    while (pending.has(chatId)) {
      const next = pending.get(chatId);
      pending.delete(chatId);
      await runAgentForChat(chatId, next.reply, next.userId);
    }
  } finally {
    running.delete(chatId);
    emitEngine(chatId, "idle", undefined, userId);
  }
}
function ensureObserver(chatId) {
  if (!observers.has(chatId))
    observers.set(chatId, spindle.generate.observe(chatId));
  return observers.get(chatId);
}
function dropObserver(chatId) {
  const o = observers.get(chatId);
  if (o) {
    o.dispose();
    observers.delete(chatId);
  }
}
var genType = new Map;
spindle.on("GENERATION_STARTED", (payload) => {
  if (!config.enabled || !payload.chatId)
    return;
  genType.set(payload.chatId, payload.generationType ?? "normal");
  if (payload.generationType === "quiet" || payload.generationType === "impersonate")
    return;
  ensureObserver(payload.chatId);
});
spindle.on("GENERATION_ENDED", async (payload, userId) => {
  if (!config.enabled || !payload.chatId)
    return;
  const chatId = payload.chatId;
  genType.delete(chatId);
  if (payload.error)
    return dropObserver(chatId);
  const gt = payload.generationType ?? "normal";
  const obs = observers.get(chatId);
  const reply = (payload.content ?? obs?.content ?? "").trim();
  dropObserver(chatId);
  if (gt === "normal")
    scheduleAgent(chatId, reply, userId);
});
spindle.on("GENERATION_STOPPED", async (payload, userId) => {
  if (!config.enabled || !payload.chatId)
    return;
  const obs = observers.get(payload.chatId);
  const reply = (payload.content ?? obs?.content ?? "").trim();
  dropObserver(payload.chatId);
  const gt = genType.get(payload.chatId) ?? "normal";
  genType.delete(payload.chatId);
  if (gt === "normal")
    scheduleAgent(payload.chatId, reply, userId);
});
var loggedInject = false;
async function refreshInjection(chatId, userId) {
  try {
    const char = await characterForChat(chatId, userId);
    if (!char)
      return;
    const entryId = await ensureInjectionEntry(char.id, char.name, userId);
    if (!entryId)
      return;
    const run = await loadRun(chatId).catch(() => null);
    const directive2 = run && buildDirective(run, { humanTexture: config.humanTexture }) || "(no active emotional state)";
    await spindle.world_books.entries.update(entryId, { content: directive2 }, userId);
    if (!loggedInject) {
      loggedInject = true;
      spindle.log.info(`[psyche] wrote emotional state (${directive2.length} chars) to injection entry for chat ${chatId}`);
    }
  } catch (err) {
    spindle.log.error(`[psyche] refreshInjection failed: ${String(err)}`);
  }
}
async function injectionInterceptor(ctx) {
  if (config.enabled)
    return;
  const ids = ctx.entries.filter((e) => isInjectionEntry(e.extensions)).map((e) => e.id);
  return ids.length ? { disabled: ids } : undefined;
}
function registerInjectionInterceptor() {
  try {
    spindle.registerWorldInfoInterceptor(injectionInterceptor, 50);
    spindle.log.info("[psyche] injection interceptor registered");
  } catch (err) {
    spindle.log.warn(`[psyche] interceptor registration failed: ${String(err)}`);
  }
}
async function activeChatId(payloadChatId, userId) {
  if (payloadChatId)
    return payloadChatId;
  try {
    const active = await spindle.chats.getActive(userId);
    return active?.id ?? null;
  } catch {
    return null;
  }
}
function snapshotRun(run) {
  const characters = Object.values(run.characters).map((c) => ({
    id: c.id,
    name: c.name,
    isPrimary: c.isPrimary,
    present: c.present,
    approval: c.approval ?? 0,
    approvalLabel: describeApproval(c.approval ?? 0).label,
    offscreenSummary: c.offscreenSummary ?? "",
    knowledge: c.knowledge ?? [],
    emotions: EMOTIONS.map((def) => {
      const e = c.emotions[def.key] ?? { value: 0, baseline: 0 };
      return {
        key: def.key,
        label: def.label,
        kind: def.kind,
        value: e.value,
        baseline: e.baseline,
        descriptor: describeValue(def, e.value).label
      };
    })
  }));
  return { chatId: run.chatId, characters };
}
function findChar(run, id) {
  return run.characters[id] ?? Object.values(run.characters).find((c) => c.id === id) ?? null;
}
function clampForKind2(key, value) {
  const def = EMOTION_BY_KEY[key];
  if (!def)
    return value;
  return def.kind === "bipolar" ? Math.max(-1, Math.min(1, value)) : Math.max(0, Math.min(1, value));
}
async function sendState(chatId, userId, note) {
  if (!chatId) {
    spindle.sendToFrontend({ type: "state", snapshot: null, note }, userId);
    return;
  }
  await refreshInjection(chatId, userId);
  const run = await loadRun(chatId);
  const char = await characterForChat(chatId, userId);
  spindle.sendToFrontend({ type: "state", characterName: char?.name ?? null, snapshot: snapshotRun(run), note }, userId);
}
spindle.onFrontendMessage(async (payload, userId) => {
  try {
    switch (payload?.type) {
      case "get_config":
        spindle.sendToFrontend({ type: "config", config }, userId);
        break;
      case "set_config":
        config = {
          enabled: Boolean(payload.config?.enabled ?? config.enabled),
          maxRounds: clampInt(payload.config?.maxRounds ?? config.maxRounds, 1, 20),
          decayRate: clampFloat(payload.config?.decayRate ?? config.decayRate, 0, 1),
          directive: String(payload.config?.directive ?? config.directive),
          agentTimeoutMs: clampInt(payload.config?.agentTimeoutMs ?? config.agentTimeoutMs, 1e4, 300000),
          agentConnectionId: payload.config?.agentConnectionId === undefined ? config.agentConnectionId : String(payload.config.agentConnectionId ?? ""),
          humanTexture: Boolean(payload.config?.humanTexture ?? config.humanTexture),
          offscreenEnabled: Boolean(payload.config?.offscreenEnabled ?? config.offscreenEnabled),
          offscreenEventBudget: clampInt(payload.config?.offscreenEventBudget ?? config.offscreenEventBudget, 1, 8)
        };
        await saveConfig();
        spindle.sendToFrontend({ type: "config", config }, userId);
        break;
      case "get_connections": {
        let connections = [];
        let error;
        try {
          if (!spindle.connections?.list)
            throw new Error("host does not expose the connections API");
          const list = await spindle.connections.list(userId);
          connections = list.map((c) => ({ id: c.id, name: c.name, provider: c.provider, model: c.model }));
        } catch (err) {
          error = String(err instanceof Error ? err.message : err);
          spindle.log.warn(`[psyche] could not list connections: ${error}`);
        }
        spindle.sendToFrontend({ type: "connections", connections, error }, userId);
        break;
      }
      case "get_state": {
        const chatId = await activeChatId(payload.chatId, userId);
        await sendState(chatId, userId);
        break;
      }
      case "get_debug": {
        const chatId = await activeChatId(payload.chatId, userId);
        const debug = chatId ? await loadDebug(chatId) : {};
        spindle.sendToFrontend({ type: "debug", debug }, userId);
        break;
      }
      case "get_engine": {
        const chatId = await activeChatId(payload.chatId, userId);
        spindle.sendToFrontend({ type: "engine", chatId, state: chatId && running.has(chatId) ? "running" : "idle" }, userId);
        break;
      }
      case "reset_run": {
        const chatId = await activeChatId(payload.chatId, userId);
        if (!chatId)
          break;
        await saveRun(emptyRun(chatId));
        await sendState(chatId, userId, "Run state cleared.");
        break;
      }
      case "set_present": {
        const chatId = await activeChatId(payload.chatId, userId);
        if (!chatId)
          break;
        const run = await loadRun(chatId);
        const c = findChar(run, payload.characterId);
        if (c) {
          c.present = Boolean(payload.present);
          await saveRun(run);
        }
        await sendState(chatId, userId);
        break;
      }
      case "set_emotion": {
        const chatId = await activeChatId(payload.chatId, userId);
        if (!chatId)
          break;
        const run = await loadRun(chatId);
        const c = findChar(run, payload.characterId);
        const key = String(payload.emotion ?? "");
        if (c && EMOTION_BY_KEY[key] && typeof payload.value === "number") {
          backfillEmotions(c);
          c.emotions[key].value = clampForKind2(key, payload.value);
          await saveRun(run);
        }
        await sendState(chatId, userId);
        break;
      }
      case "set_approval": {
        const chatId = await activeChatId(payload.chatId, userId);
        if (!chatId)
          break;
        const run = await loadRun(chatId);
        const c = findChar(run, payload.characterId);
        if (c && typeof payload.value === "number" && Number.isFinite(payload.value)) {
          c.approval = Math.max(APPROVAL_MIN, Math.min(APPROVAL_MAX, Math.round(payload.value)));
          await saveRun(run);
        }
        await sendState(chatId, userId);
        break;
      }
    }
  } catch (err) {
    spindle.log.error(`[psyche] frontend handler error: ${String(err)}`);
    spindle.sendToFrontend({ type: "state", snapshot: null, note: `Action failed \u2014 check Psyche's permissions are granted. (${String(err)})` }, userId);
  }
});
function clampInt(v2, min, max) {
  const n = Math.round(Number(v2));
  if (!Number.isFinite(n))
    return min;
  return Math.max(min, Math.min(max, n));
}
function clampFloat(v2, min, max) {
  const n = Number(v2);
  if (!Number.isFinite(n))
    return min;
  return Math.max(min, Math.min(max, n));
}
registerInjectionInterceptor();
(async () => {
  await loadConfig();
  spindle.log.info("[psyche] loaded");
})();
