import type { CharacterState } from './state'
import { canonForInjection } from './state'
import { approvalLine } from './approval'
import { groundedReadout } from './directive'
import { AGENT_SENTINEL } from './prompts'

/* ------------------------------------------------------------------ *
 * Psyche (core) — ephemeral per-turn resistance
 *
 * Not a persona/goals system. This stage looks only at the current scene,
 * fresh each turn, and asks: does the player's current steering conflict
 * with who this character has shown themselves to be so far (the card, the
 * story) — and if so, what are they not giving away right now? The result
 * is injected for exactly one turn and then discarded; there is no stored
 * checklist for a character to keep defending. That's the whole point.
 * ------------------------------------------------------------------ */

export const RESISTANCE_NOTE_CAP = 400 // a boundary sentence or two, not a scene

export function resistanceSystemPrompt(directive = ''): string {
  return [
    AGENT_SENTINEL,
    'You are Psyche\'s conflict check, run fresh every turn. For each character below,',
    'read the recent scene and decide: is the player\'s CURRENT message asking for or',
    'steering toward something that cuts against who this character has shown',
    'themselves to be so far — their manner, their values, what they clearly want —',
    'given the card and the story up to now?',
    '',
    'You have NO goals list, NO persona sheet, and NO stored profile for these',
    'characters. That is deliberate. Read who they are the same way you would if you',
    'were about to write their next line yourself: from the card, and from how they',
    'have actually behaved in the scene so far. Do not invent a fixed trait to defend —',
    'judge only what THIS moment, in THIS scene, would plausibly cost them.',
    '',
    'SCALE YOUR DEFAULT BY APPROVAL (given per character below):',
    '  • At neutral-to-low approval, bias toward finding real friction. Do not let a',
    '    character hand over agreement, warmth, or ground in the scene just because it',
    '    is convenient or keeps things moving — check whether it actually serves them.',
    '  • At high approval (devoted or above), the bias FLIPS: compliance on ordinary',
    '    asks is already earned. Do not manufacture reluctance a trusted character has',
    '    no real reason to feel — that is an equal and opposite failure.',
    '  • Most turns, for most characters, the honest answer is nothing conflicts.',
    '    Omitting a character (or returning an empty note) is the expected, common',
    '    result — do not invent friction out of habit.',
    '',
    'WHAT YOU WRITE IS A BOUNDARY, NOT A SCRIPT. Say what the character is not giving',
    'away — warmth, agreement, trust, ground in the scene — and a brief why. NEVER write',
    'the specific line, action, or plot beat they use to hold it; that is the prose',
    'writer\'s job, working from your note, not yours. One to two sentences.',
    '',
    'Return ONLY JSON: { "<character_id>": "<note>", ... } — omit any character with',
    'nothing to report.',
    directive.trim() ? `\nOPERATOR DIRECTIVE:\n${directive.trim()}` : '',
  ].join('\n')
}

export function resistanceUserContent(present: CharacterState[], recentScene: string, cardContext: string): string {
  return [
    cardContext
      ? ['PRIMARY CHARACTER CARD (source of truth for who they are):', '"""', cardContext, '"""', ''].join('\n')
      : '',
    'THE RECENT SCENE (most recent last — the player\'s latest message is what you are',
    'checking against):',
    '"""',
    recentScene.trim() || '(the scene has just begun)',
    '"""',
    '',
    'CHARACTERS PRESENT:',
    ...present.map((c) => {
      const canon = canonForInjection(c.canon ?? '')
      return [
        `### ${c.id} — ${c.name}`,
        `  ${approvalLine(c)}`,
        groundedReadout(c),
        canon ? `  established canon:\n    ${canon.split('\n').join('\n    ')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    }),
    '',
    'Run the check now. Return only the JSON.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function parseResistance(raw: unknown, presentIds: string[]): Record<string, string> {
  const known = new Set(presentIds)
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [id, text] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(id) || typeof text !== 'string' || !text.trim()) continue
    out[id] = text.trim().slice(0, RESISTANCE_NOTE_CAP)
  }
  return out
}

/**
 * Apply a turn's resistance notes to every PRESENT character — including
 * clearing anyone with no note this turn, even if they had one last turn.
 * That clear is the entire anti-staleness mechanism: nothing here persists
 * past the turn that produced it.
 */
export function applyResistanceResult(present: CharacterState[], notes: Record<string, string>): void {
  for (const c of present) {
    c.resistance = notes[c.id]?.trim() || undefined
  }
}
