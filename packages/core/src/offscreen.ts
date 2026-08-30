import { EMOTION_BY_KEY, EMOTIONS, applyStimulus, describeValue } from './affect'
import type { CharacterState, RunState } from './state'
import { pushKnowledge } from './state'
import { approvalLine, APPROVAL_MIN, APPROVAL_MAX } from './approval'
import { AGENT_SENTINEL } from './prompts'

/* ------------------------------------------------------------------ *
 * Psyche (core) — off-stage character simulation
 *
 * Every named tracked character who is NOT currently on-stage with the
 * player still lives their own life each turn: a solitary action, or a
 * scene shared with another off-stage character. This is a two-phase
 * process, both stages pure functions here — the host-API transport lives
 * in the plugin's src/agent.ts:
 *
 *   1. CASTING — one cheap call that only decides who acts alone and who
 *      shares a scene with whom this turn (no scene content).
 *   2. PER-UNIT SIMULATION — one call per group (solo or shared), each
 *      getting the full, undiluted context for just its own members, that
 *      actually writes what happened and what it did to them.
 *
 * Knowledge scoping is structural, not prompted: a character's context here
 * is built ONLY from their own `knowledge[]` log + `offscreenSummary` +
 * current affect/approval — never a shared "world" bag, never the on-stage
 * transcript. On-stage characters appear only as bare names in an exclusion
 * line. There is nothing here for information to leak through.
 * ------------------------------------------------------------------ */

/* ------------------------------- types ------------------------------ */

export interface OffscreenEvent {
  /** one plain past-tense sentence describing what happened */
  description: string
  /** character ids involved — 1 = solitary action, 2+ = a shared scene */
  participants: string[]
  /** each participant's own first-person-relevant knowledge line from this
   *  event. Keys ARE the witness list: an id absent here gets no knowledge
   *  from this event, structurally — "no witness, no memory" enforced by
   *  data shape, not by trusting the model's discipline. */
  knowledgeFor: Record<string, string>
}

export interface OffscreenFeeling {
  characterId: string
  emotion: string
  intensity: number
  reason: string
}

export interface OffscreenApprovalDelta {
  characterId: string
  delta: number
  reason: string
}

export interface OffscreenResult {
  events: OffscreenEvent[]
  feelings: OffscreenFeeling[]
  approvals: OffscreenApprovalDelta[]
  /** characterId -> new offscreenSummary */
  summaries: Record<string, string>
}

export const OFFSCREEN_EVENT_BUDGET = 1
export const OFFSCREEN_FEELING_CLAMP = 5
export const OFFSCREEN_APPROVAL_CLAMP = 5
const KNOWLEDGE_CONTEXT_LINES = 8
const SALIENT_THRESHOLD = 0.35
// Generous safety ceilings, not targets — these are full scenes now, not log
// lines. `summaries` deliberately stays much shorter: it's injected inline
// into the on-stage directive the moment a character returns, so it has to
// stay a continuity line, not a recap of the whole off-stage scene.
const DESCRIPTION_CAP = 4000
const KNOWLEDGE_LINE_CAP = 2500
const SUMMARY_CAP = 250

/** Top few salient feelings for a character, strongest first — used for the
 *  compact "how are they doing" line in both casting and per-unit prompts. */
export function salientFeelings(c: CharacterState): string {
  const rows = EMOTIONS.filter((def) => def.kind === 'unipolar')
    .map((def) => ({ def, value: c.emotions[def.key]?.value ?? 0 }))
    .filter((r) => r.value >= SALIENT_THRESHOLD)
    .sort((a, b) => b.value - a.value)
    .slice(0, 4)
  if (!rows.length) return 'quiet, even-keeled'
  return rows.map((r) => `${r.def.label.toLowerCase().split(' (')[0]} (${describeValue(r.def, r.value).label})`).join(', ')
}

/* ----------------------------- casting ------------------------------- */

export interface CastingGroup {
  characterIds: string[]
  /** one-line flavor of the interaction, only meaningful when characterIds.length > 1 */
  steer?: string
}
export interface CastingResult {
  groups: CastingGroup[]
}

export function castingSystemPrompt(): string {
  return [
    AGENT_SENTINEL,
    'You are casting this turn\'s off-stage activity. The player is on stage with',
    'someone else; these characters are elsewhere. You do not write what happens —',
    'you only decide the SHAPE of it: who is alone, and who plausibly crosses paths',
    'with whom.',
    '',
    'Assign every character listed below to exactly one group. A group of one is a',
    'solitary character. A group of two or more means they are together this turn —',
    'only group characters who could plausibly be in the same place, given who they',
    'are and how they currently feel; do not force an encounter that makes no sense.',
    'Most turns, most characters are alone — that is normal and correct.',
    '',
    'For any group of 2+, add a one-line "steer": the FLAVOR of the interaction (e.g.',
    '"catching up over a drink", "an old disagreement resurfaces", "working together',
    'on something practical") — never its content, dialogue, or outcome. That gets',
    'written later, by someone else, with more room to think it through.',
    '',
    'Return ONLY JSON: { "groups": [ { "characterIds": ["<id>", ...], "steer": "<optional, only for 2+>" } ] }',
  ].join('\n')
}

export function castingUserContent(roster: { id: string; name: string; oneLineState: string }[]): string {
  return [
    'OFF-STAGE RIGHT NOW:',
    ...roster.map((r) => `  ${r.id} — ${r.name}: ${r.oneLineState}`),
    '',
    'Cast this turn. Return only the JSON.',
  ].join('\n')
}

export function parseCasting(raw: unknown, offStageIds: string[]): CastingResult {
  const known = new Set(offStageIds)
  const assigned = new Set<string>()
  const groups: CastingGroup[] = []

  const o = raw as { groups?: unknown } | null
  const rawGroups = Array.isArray(o?.groups) ? (o!.groups as unknown[]) : []
  for (const g of rawGroups) {
    const go = g as { characterIds?: unknown; steer?: unknown }
    const ids = Array.isArray(go.characterIds)
      ? (go.characterIds as unknown[])
          .filter((x): x is string => typeof x === 'string' && known.has(x) && !assigned.has(x))
      : []
    if (!ids.length) continue
    for (const id of ids) assigned.add(id)
    const steer = typeof go.steer === 'string' && go.steer.trim() ? go.steer.trim().slice(0, 200) : undefined
    groups.push(ids.length > 1 ? { characterIds: ids, steer } : { characterIds: ids })
  }

  // Safety fallback: anyone the model's grouping missed still gets something.
  for (const id of offStageIds) {
    if (!assigned.has(id)) groups.push({ characterIds: [id] })
  }

  return { groups }
}

/* -------------------------- per-unit simulation ----------------------- */

export function unitSystemPrompt(eventBudget: number): string {
  return [
    AGENT_SENTINEL,
    'You are the prose writer for this scene — exactly as much as you would be if the',
    'player were sitting right here watching it. The character(s) below are off-stage',
    'right now, living their own lives, and this is THEIR turn. Write it at full',
    'strength: real setting, real sensory detail, real action, real dialogue if more',
    'than one of them is present — the same craft and length you would bring to an',
    'on-stage reply. A single flat summary sentence is a failure here, not economy.',
    '',
    'Most turns still call for something modest — not everyone lives an adventure every',
    'moment — but "modest" means the STAKES are small, not that the WRITING is thin. A',
    'quiet character doing a small, ordinary thing still gets a fully written scene of',
    'it: how the room feels, what they notice, what they do, what runs through their',
    'head. An empty events list is still the right answer when truly nothing is',
    'happening (they are asleep, in transit, waiting) — but when you do write something,',
    'commit to it as a real scene, a full paragraph or more.',
    `Write ${eventBudget === 1 ? 'one such scene' : `up to ${eventBudget} such scenes`} this turn — one` +
      ' well-developed scene is normal; only write more than one if this character',
    'genuinely does several distinct, separated things.',
    '',
    'If there is more than one character below, they are TOGETHER right now — write ONE',
    'shared scene with all of them as participants (dialogue between them is exactly',
    'right here), then give each of them their OWN knowledgeFor entry: THEIR side of it,',
    'in their own voice, as a real first-person paragraph — what they noticed, said, felt,',
    'concluded. Two participants in the same scene should NOT produce identical',
    'knowledgeFor text; write each one\'s account the way that person would actually tell',
    'it, which is rarely identical to the other\'s. Someone not listed below was not',
    'there and knows nothing of it.',
    '',
    'NONE OF THIS REACHES THE PLAYER DIRECTLY. It becomes private knowledge. The player',
    'finds out only if a character later chooses to tell them, or a future turn notices',
    'they would plausibly know. So: do not resolve the story\'s plot, do not have anyone',
    'discover what the player is doing on stage, and do not write anything happening in',
    'the on-stage location — treat the "ON-STAGE RIGHT NOW" names below as off-limits,',
    'not participants.',
    '',
    'APPROVAL. Only include an approval delta for a character whose action or reflection',
    'here is EXPLICITLY about the player — something they already know involving the',
    'player (check their "knows" list below first). Never invent an opinion of the',
    'player out of an unrelated solitary scene. Most characters get no approval delta',
    'most turns. Keep deltas small — this is private reflection, not a scene with the',
    'player.',
    '',
    'Return ONLY JSON:',
    '{',
    '  "events": [',
    '    { "description": "the full scene, written in real prose — a paragraph or more,',
    '                       not a summary sentence",',
    '      "participants": ["<id>", ...],',
    '      "knowledgeFor": { "<id>": "that character\'s own first-person paragraph — their',
    '                                 side of it, in their voice" } }',
    '  ],',
    '  "feelings": [ { "characterId": "<id>", "emotion": "<emotion key>", "intensity": 0.0, "reason": "why" } ],',
    '  "approvals": [ { "characterId": "<id>", "delta": 0, "reason": "why, tied to something they know about the player" } ],',
    '  "summaries": { "<id>": "one line: what they\'ve been up to (this one stays SHORT —',
    '                          it\'s injected inline once they\'re back on stage)" }',
    '}',
    '',
    'Feelings move gently — intensity roughly ±0.5 to ±2 unless something real and',
    'specific happened to them. Only use the character ids you were given.',
  ].join('\n')
}

export function unitUserContent(
  members: { c: CharacterState; feelings: string }[],
  steer: string | undefined,
  onStageNames: string[],
): string {
  return [
    `ON-STAGE RIGHT NOW (off-limits — do not write anything happening there, they cannot`,
    `know what's said or done there unless told afterward): ${onStageNames.length ? onStageNames.join(', ') : '(nobody)'}`,
    '',
    steer ? `TOGETHER THIS TURN — ${steer}` : '',
    '',
    ...members.map(({ c, feelings }) => {
      const knowledge = (c.knowledge ?? []).slice(-KNOWLEDGE_CONTEXT_LINES)
      return [
        `### ${c.id} — ${c.name}`,
        `  ${approvalLine(c)}`,
        `  feeling: ${feelings}`,
        `  recently up to: ${c.offscreenSummary?.trim() || '(nothing notable yet)'}`,
        '  knows (most recent last):',
        knowledge.length ? knowledge.map((k) => `    - ${k}`).join('\n') : '    (nothing notable)',
      ].join('\n')
    }),
    '',
    'What happened? Return only the JSON.',
  ]
    .filter((l) => l !== '')
    .join('\n')
}

export function parseUnitResult(raw: unknown, memberIds: string[], eventBudget: number): OffscreenResult {
  const known = new Set(memberIds)
  const o = raw as {
    events?: unknown
    feelings?: unknown
    approvals?: unknown
    summaries?: unknown
  } | null

  const events: OffscreenEvent[] = []
  const rawEvents = Array.isArray(o?.events) ? (o!.events as unknown[]) : []
  const eventCountFor = new Map<string, number>()
  for (const e of rawEvents) {
    const eo = e as { description?: unknown; participants?: unknown; knowledgeFor?: unknown }
    const description = typeof eo.description === 'string' ? eo.description.trim().slice(0, DESCRIPTION_CAP) : ''
    const participants = Array.isArray(eo.participants)
      ? (eo.participants as unknown[]).filter((x): x is string => typeof x === 'string' && known.has(x))
      : []
    const knowledgeForRaw = eo.knowledgeFor && typeof eo.knowledgeFor === 'object' ? (eo.knowledgeFor as Record<string, unknown>) : {}
    const knowledgeFor: Record<string, string> = {}
    for (const [id, text] of Object.entries(knowledgeForRaw)) {
      if (!known.has(id) || typeof text !== 'string' || !text.trim()) continue
      const used = eventCountFor.get(id) ?? 0
      if (used >= eventBudget) continue
      knowledgeFor[id] = text.trim().slice(0, KNOWLEDGE_LINE_CAP)
      eventCountFor.set(id, used + 1)
    }
    if (!description || !participants.length || !Object.keys(knowledgeFor).length) continue
    events.push({ description, participants, knowledgeFor })
  }

  const feelings: OffscreenFeeling[] = []
  const rawFeelings = Array.isArray(o?.feelings) ? (o!.feelings as unknown[]) : []
  for (const f of rawFeelings) {
    const fo = f as { characterId?: unknown; emotion?: unknown; intensity?: unknown; reason?: unknown }
    const characterId = typeof fo.characterId === 'string' ? fo.characterId : ''
    const emotion = typeof fo.emotion === 'string' ? fo.emotion : ''
    const intensity = typeof fo.intensity === 'number' && Number.isFinite(fo.intensity) ? fo.intensity : 0
    if (!known.has(characterId) || !EMOTION_BY_KEY[emotion] || intensity === 0) continue
    const clamped = Math.max(-OFFSCREEN_FEELING_CLAMP, Math.min(OFFSCREEN_FEELING_CLAMP, intensity))
    feelings.push({ characterId, emotion, intensity: clamped, reason: typeof fo.reason === 'string' ? fo.reason.slice(0, 200) : '' })
  }

  const approvals: OffscreenApprovalDelta[] = []
  const rawApprovals = Array.isArray(o?.approvals) ? (o!.approvals as unknown[]) : []
  const eventParticipants = new Set(events.flatMap((e) => e.participants))
  for (const a of rawApprovals) {
    const ao = a as { characterId?: unknown; delta?: unknown; reason?: unknown }
    const characterId = typeof ao.characterId === 'string' ? ao.characterId : ''
    const delta = typeof ao.delta === 'number' && Number.isFinite(ao.delta) ? Math.round(ao.delta) : 0
    // Structural gate: an approval shift off-stage must be tied to an actual
    // event this character participated in — never invented from nothing.
    if (!known.has(characterId) || delta === 0 || !eventParticipants.has(characterId)) continue
    const clamped = Math.max(-OFFSCREEN_APPROVAL_CLAMP, Math.min(OFFSCREEN_APPROVAL_CLAMP, delta))
    approvals.push({ characterId, delta: clamped, reason: typeof ao.reason === 'string' ? ao.reason.slice(0, 200) : '' })
  }

  const summaries: Record<string, string> = {}
  const rawSummaries = o?.summaries && typeof o.summaries === 'object' ? (o.summaries as Record<string, unknown>) : {}
  for (const [id, text] of Object.entries(rawSummaries)) {
    if (!known.has(id) || typeof text !== 'string' || !text.trim()) continue
    summaries[id] = text.trim().slice(0, SUMMARY_CAP)
  }

  return { events, feelings, approvals, summaries }
}

/** Merge every phase-2 unit call's output into one result for a single apply pass. */
export function mergeOffscreenResults(results: OffscreenResult[]): OffscreenResult {
  const merged: OffscreenResult = { events: [], feelings: [], approvals: [], summaries: {} }
  for (const r of results) {
    merged.events.push(...r.events)
    merged.feelings.push(...r.feelings)
    merged.approvals.push(...r.approvals)
    Object.assign(merged.summaries, r.summaries)
  }
  return merged
}

/* ------------------------------- apply -------------------------------- */

export function applyOffscreenResult(
  run: RunState,
  result: OffscreenResult,
  turnSeq: number,
): { touched: Set<string>; events: number } {
  const touched = new Set<string>()

  for (const e of result.events) {
    for (const [id, line] of Object.entries(e.knowledgeFor)) {
      const c = run.characters[id]
      if (!c) continue
      pushKnowledge(c, line)
      touched.add(id)
    }
  }

  for (const f of result.feelings) {
    const c = run.characters[f.characterId]
    const def = EMOTION_BY_KEY[f.emotion]
    const e = c?.emotions[f.emotion]
    if (!c || !def || !e) continue
    e.value = applyStimulus(def, e.value, f.intensity)
    touched.add(f.characterId)
  }

  for (const a of result.approvals) {
    const c = run.characters[a.characterId]
    if (!c) continue
    const before = c.approval ?? 0
    c.approval = Math.max(APPROVAL_MIN, Math.min(APPROVAL_MAX, before + a.delta))
    touched.add(a.characterId)
  }

  for (const [id, summary] of Object.entries(result.summaries)) {
    const c = run.characters[id]
    if (!c) continue
    c.offscreenSummary = summary
    touched.add(id)
  }

  const now = Date.now()
  for (const id of touched) {
    const c = run.characters[id]
    if (!c) continue
    c.updatedAt = now
    c.offscreenAtTurn = turnSeq
    c.lastOffscreenAt = now
  }

  return { touched, events: result.events.length }
}
