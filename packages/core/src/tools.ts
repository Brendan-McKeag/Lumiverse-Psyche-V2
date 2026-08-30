import { EMOTION_BY_KEY, EMOTION_KEYS, EMOTIONS, applyStimulus, describeValue } from './affect'
import { CharacterState, RunState, newCharacter, slugify, backfillEmotions, pushKnowledge } from './state'
import { describeApproval, APPROVAL_MIN, APPROVAL_MAX } from './approval'

/* ------------------------------------------------------------------ *
 * Psyche (core) — agent tools
 *
 * The post-turn engine drives a character's mind through these tools: it
 * reads the current affect + approval, then applies stimulus to emotions,
 * adjusts approval, and tracks who is present. All executors mutate the
 * in-memory RunState; the backend persists it afterward.
 * ------------------------------------------------------------------ */

export interface ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
}

type Args = Record<string, unknown>
const str = (a: Args, k: string, d = '') => (typeof a[k] === 'string' ? (a[k] as string) : d)
const num = (a: Args, k: string): number | null => {
  const v = a[k]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
const bool = (a: Args, k: string) => Boolean(a[k])

const EMOTION_LIST = EMOTION_KEYS.join(', ')

/* ----------------------------- schemas ----------------------------- */

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'list_characters',
    description:
      'List every character tracked in this run — id, name, whether primary (the card character) or a supporting NPC, and whether present in the scene. Call first to orient yourself.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'read_character',
    description:
      "Read one character's current affect vector (each feeling's value + resting baseline) and approval of the player. Read before you revise so you know their exact starting point.",
    parameters: {
      type: 'object',
      properties: { character_id: { type: 'string' } },
      required: ['character_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_character',
    description:
      'Introduce a new supporting character (NPC) that has entered the run. Do NOT create the player. Only create characters the story actually introduces.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        present: { type: 'boolean', description: 'Are they in the scene with the player right now?' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_present',
    description:
      'Mark whether a character is currently in the scene with the player. Only present characters have their emotional state injected into the reply. Off-scene characters keep their state frozen until they return.',
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        present: { type: 'boolean' },
      },
      required: ['character_id', 'present'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_character',
    description:
      'Remove a character from the run entirely (e.g. they were merged, never mattered, or are permanently gone). Irreversible.',
    parameters: {
      type: 'object',
      properties: { character_id: { type: 'string' } },
      required: ['character_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'apply_stimulus',
    description:
      `Nudge ONE feeling up or down in response to what just happened — the primary way you move a mind. \`intensity\` is the signed strength of the event: a passing pleasantry +0.5, a normal meaningful moment +1 to +2, a strong emotional beat +3 to +5, a genuine shock +6 to +8; negative values relieve the feeling. Feelings saturate HARD, so from rest +1 only reaches ~0.22, +3 ~0.53, +5 ~0.71, and crossing 0.9 needs ~+9 of pressure accumulated over many turns — high values must be earned, never granted by one nice exchange. Valid emotions: ${EMOTION_LIST}.`,
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        emotion: { type: 'string', description: 'One emotion key from the valid list.' },
        intensity: { type: 'number', description: 'Signed event strength, typically -8..+8 (most turns ±0.5..2).' },
        reason: { type: 'string', description: 'Brief why, for the log/panel.' },
      },
      required: ['character_id', 'emotion', 'intensity'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_emotion',
    description:
      'Hard-set ONE feeling to an exact value, bypassing the saturation curve. Use sparingly — for a narrative reset (e.g. a shock that instantly maxes fear). Unipolar feelings take 0..1; valence and mood take -1..1.',
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        emotion: { type: 'string' },
        value: { type: 'number' },
        reason: { type: 'string' },
      },
      required: ['character_id', 'emotion', 'value'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_baseline',
    description:
      "Set a feeling's resting baseline — the temperament it relaxes toward over time when nothing feeds it. Use to shape lasting personality shifts (e.g. growing trust makes wariness rest lower). Same ranges as set_emotion.",
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        emotion: { type: 'string' },
        value: { type: 'number' },
      },
      required: ['character_id', 'emotion', 'value'],
      additionalProperties: false,
    },
  },
  {
    name: 'adjust_approval',
    description:
      "Adjust the character's APPROVAL of the PLAYER — their accumulated, durable opinion, RPG-style (-10000..+10000, never decays). Move it when the player's words or actions align with, or cut against, the character's GENUINE wishes. Signed integer delta, hard-capped at ±10 per call: ±1-3 a minor beat, ±4-7 a significant one, ±8-10 a major betrayal or sacrifice. Most turns warrant 0 or ±1-3 for at most one or two characters; do not adjust by reflex every turn. This is a ledger built over many turns, not a mood.",
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        delta: { type: 'number', description: 'Signed integer, clamped to -10..+10.' },
        reason: { type: 'string', description: 'Brief why, for the log/panel.' },
      },
      required: ['character_id', 'delta'],
      additionalProperties: false,
    },
  },
  {
    name: 'note_knowledge',
    description:
      "Log one short fact THIS character now personally knows — something they witnessed, were directly told, or noticed themselves this turn. This feeds what they can reason from later when they act off-stage; do not log anything they did not actually perceive. Keep it to one plain sentence, their own frame of reference (e.g. \"the player promised to meet me at the docks tonight\", not a scene summary).",
    parameters: {
      type: 'object',
      properties: {
        character_id: { type: 'string' },
        text: { type: 'string', description: 'One short first-person-relevant fact, plain sentence.' },
      },
      required: ['character_id', 'text'],
      additionalProperties: false,
    },
  },
]

/* ---------------------------- executors ---------------------------- */

function find(run: RunState, id: string): CharacterState | null {
  if (run.characters[id]) return run.characters[id]
  // tolerate the model passing a name instead of a slug
  const slug = slugify(id)
  if (run.characters[slug]) return run.characters[slug]
  const byName = Object.values(run.characters).find((c) => c.name.toLowerCase() === id.toLowerCase())
  return byName ?? null
}

function clampForKind(key: string, value: number): number {
  const def = EMOTION_BY_KEY[key]
  if (!def) return value
  return def.kind === 'bipolar' ? Math.max(-1, Math.min(1, value)) : Math.max(0, Math.min(1, value))
}

export async function executeTool(run: RunState, name: string, args: Args): Promise<string> {
  switch (name) {
    case 'list_characters': {
      const rows = Object.values(run.characters)
      if (!rows.length) return 'No characters tracked yet.'
      return rows
        .map(
          (c) =>
            `- ${c.id} — ${c.name} [${c.isPrimary ? 'primary' : 'supporting'}, ${
              c.present ? 'present' : 'off-scene'
            }]`,
        )
        .join('\n')
    }

    case 'read_character': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      const feelings = EMOTIONS.map((def) => {
        const e = c.emotions[def.key] ?? { value: 0, baseline: 0 }
        const d = describeValue(def, e.value)
        return `  ${def.key}: ${e.value.toFixed(3)} (${d.label}) [baseline ${e.baseline.toFixed(2)}]`
      }).join('\n')
      return [
        `id: ${c.id}`,
        `name: ${c.name}`,
        `role: ${c.isPrimary ? 'primary (card character)' : 'supporting'}`,
        `present: ${c.present}`,
        `approval of the player: ${c.approval ?? 0} (${describeApproval(c.approval ?? 0).label})`,
        `affect:\n${feelings}`,
      ].join('\n')
    }

    case 'create_character': {
      const cname = str(args, 'name').trim()
      if (!cname) return 'create_character requires a name.'
      let id = slugify(cname)
      if (run.characters[id]) id = `${id}_${Math.random().toString(36).slice(2, 5)}`
      const c = newCharacter(id, cname, false)
      c.present = args.present === undefined ? true : bool(args, 'present')
      run.characters[id] = c
      return `Created supporting character ${id} (${cname}).`
    }

    case 'set_present': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      c.present = bool(args, 'present')
      c.updatedAt = Date.now()
      return `${c.id} is now ${c.present ? 'present' : 'off-scene'}.`
    }

    case 'delete_character': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      if (c.isPrimary) return 'Refusing to delete the primary card character.'
      delete run.characters[c.id]
      return `Deleted ${c.id}.`
    }

    case 'apply_stimulus': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      const key = str(args, 'emotion').trim()
      const def = EMOTION_BY_KEY[key]
      if (!def) return `Unknown emotion "${key}". Valid: ${EMOTION_LIST}.`
      const intensity = num(args, 'intensity')
      if (intensity === null) return 'apply_stimulus requires a numeric intensity.'
      backfillEmotions(c)
      const before = c.emotions[key].value
      const after = applyStimulus(def, before, intensity)
      c.emotions[key].value = after
      c.updatedAt = Date.now()
      const d = describeValue(def, after)
      return `${c.id} ${key}: ${before.toFixed(3)} -> ${after.toFixed(3)} (${d.label}).`
    }

    case 'set_emotion': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      const key = str(args, 'emotion').trim()
      const def = EMOTION_BY_KEY[key]
      if (!def) return `Unknown emotion "${key}". Valid: ${EMOTION_LIST}.`
      const value = num(args, 'value')
      if (value === null) return 'set_emotion requires a numeric value.'
      backfillEmotions(c)
      const v = clampForKind(key, value)
      c.emotions[key].value = v
      c.updatedAt = Date.now()
      return `${c.id} ${key} set to ${v.toFixed(3)} (${describeValue(def, v).label}).`
    }

    case 'set_baseline': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      const key = str(args, 'emotion').trim()
      if (!EMOTION_BY_KEY[key]) return `Unknown emotion "${key}". Valid: ${EMOTION_LIST}.`
      const value = num(args, 'value')
      if (value === null) return 'set_baseline requires a numeric value.'
      backfillEmotions(c)
      c.emotions[key].baseline = clampForKind(key, value)
      c.updatedAt = Date.now()
      return `${c.id} ${key} baseline set to ${c.emotions[key].baseline.toFixed(3)}.`
    }

    case 'adjust_approval': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      const delta = num(args, 'delta')
      if (delta === null) return 'adjust_approval requires a numeric delta.'
      backfillEmotions(c) // also backfills approval on pre-approval runs
      const d = Math.max(-10, Math.min(10, Math.round(delta)))
      const before = c.approval ?? 0
      const after = Math.max(APPROVAL_MIN, Math.min(APPROVAL_MAX, before + d))
      c.approval = after
      c.updatedAt = Date.now()
      return `${c.id} approval: ${before} -> ${after} (${describeApproval(after).label}).`
    }

    case 'note_knowledge': {
      const c = find(run, str(args, 'character_id'))
      if (!c) return `No character "${str(args, 'character_id')}".`
      const text = str(args, 'text').trim()
      if (!text) return 'note_knowledge requires text.'
      pushKnowledge(c, text)
      c.updatedAt = Date.now()
      return `${c.id} now knows: "${text}"`
    }

    default:
      return `Unknown tool ${name}.`
  }
}
