import type { CharacterState } from './state'
import { canonForInjection } from './state'
import { approvalLine } from './approval'
import { groundedReadout, overrideDirective } from './directive'
import { AGENT_SENTINEL } from './prompts'

/* ------------------------------------------------------------------ *
 * Psyche (core) — the Director
 *
 * The deepest reasoning pass in the engine, and the only one that runs
 * BEFORE a reply is written rather than after: fired from a pre-generation
 * prompt interceptor (see src/backend.ts), it sees the player's actual
 * incoming message — not a guess at what might come next — and thinks
 * through how each present character genuinely receives this specific
 * moment: their inclinations, their hard lines, where there's real room to
 * negotiate, and whatever about them still hasn't been established and is
 * fertile ground to invent.
 *
 * It supersedes the old ephemeral `resistance` stage (same anti-yes-man
 * job, but done with the real incoming message in hand instead of an
 * extrapolation from the last exchange) and, like the mind-update stage,
 * may call update_canon/note_knowledge when something surfaces worth
 * permanently recording.
 * ------------------------------------------------------------------ */

export const DIRECTOR_NOTE_CAP = 1600 // richer than the old resistance note — a paragraph, not a sentence

export function directorSystemPrompt(directive = ''): string {
  return [
    AGENT_SENTINEL,
    'You are the Director — the deepest, most deliberate reasoning pass in this',
    'engine, run immediately before the next reply is written. Take as long as you',
    'genuinely need. Think like a human game master privately working out how each',
    'character actually receives this exact moment — not like a checklist being',
    'filled in. Resist the pull toward the safest, most predictable read: a',
    'compelling character sometimes hesitates, surprises, or reacts in a way the',
    'player didn\'t expect, as long as it is true to who they are.',
    '',
    'For each character listed below, work out:',
    '  • THEIR GENUINE INCLINATIONS AND THOUGHT PROCESS right now — what this',
    '    specific moment stirs up for them, reasoned from their canon, their',
    '    current feelings, and how they have actually behaved so far, not from a',
    '    generic personality summary.',
    '  • HARD LINES — anything they would flatly not do, allow, or accept, given',
    '    who they are. Name it plainly when the player\'s message brushes against',
    '    one.',
    '  • NEGOTIABLE GROUND — where there is real room to move, and roughly what it',
    '    would take to move them. This is the common case, not the exception: most',
    '    of who someone is isn\'t a hard line.',
    '  • UNDISCOVERED TERRITORY — anything about them that hasn\'t been established',
    '    yet and that this moment makes fertile ground to explore. Invent it, and',
    '    call update_canon to record it when it is concrete enough to be worth',
    '    keeping — not a quota, only when the scene genuinely opens the door. Use',
    '    note_knowledge for anything a present character would specifically',
    '    remember going forward.',
    '',
    'HONEST, NOT COMPLIANT. What the player says, wants, or implies is a data point,',
    'never automatic truth. Weigh it against the card and everything that has',
    'actually happened; when the honest read diverges from what was suggested, say',
    'so — including the opposite of what was implied, when that is the truer read.',
    '',
    'WHAT YOU WRITE IS A BOUNDARY AND A COMPASS, NOT A SCRIPT. Describe pulls,',
    'limits, and openings — never the specific line, action, or plot beat used to',
    'act on them. That is the prose writer\'s job, working from your read of the',
    'moment, not yours to decide for them.',
    '',
    'You may call update_canon and note_knowledge as many times as genuinely',
    'warranted while you think this through, then finish with your notes. In your',
    'FINAL response — after any tool calls, with no further tool calls in it — return',
    'ONLY JSON: { "<character_id>": "<your note for them>", ... }. Write a note for',
    'every character listed, even a brief one when the moment is genuinely simple —',
    'depth should match what the moment calls for, not be padded to a fixed length.',
    directive.trim() ? `\nOPERATOR DIRECTIVE:\n${directive.trim()}` : '',
  ].join('\n')
}

export function directorUserContent(
  present: CharacterState[],
  playerMessage: string,
  recentScene: string,
  cardContext: string,
): string {
  return [
    cardContext
      ? ['PRIMARY CHARACTER CARD (source of truth for who they are):', '"""', cardContext, '"""', ''].join('\n')
      : '',
    'THE STORY SO FAR (most recent last):',
    '"""',
    recentScene.trim() || '(the scene has just begun)',
    '"""',
    '',
    'THE PLAYER JUST SAID/DID — this is the specific moment you are thinking',
    'through:',
    '"""',
    playerMessage.trim() || '(nothing yet — this is the opening of the scene)',
    '"""',
    '',
    'CHARACTERS PRESENT:',
    ...present.map((c) => {
      const canon = canonForInjection(c.canon ?? '')
      const override = overrideDirective(c)
      return [
        `### ${c.id} — ${c.name}`,
        `  ${approvalLine(c)}`,
        groundedReadout(c),
        override
          ? `  ${override.split('\n').join('\n  ')}\n  (an overriding state like this runs them — your note should say how they\n  are being carried by it, not offer nuanced negotiation they don't have room for)`
          : '',
        canon ? `  established canon:\n    ${canon.split('\n').join('\n    ')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    }),
    '',
    'Think it through now, then return the JSON.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function parseDirectorResult(raw: unknown, presentIds: string[]): Record<string, string> {
  const known = new Set(presentIds)
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [id, text] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(id) || typeof text !== 'string' || !text.trim()) continue
    out[id] = text.trim().slice(0, DIRECTOR_NOTE_CAP)
  }
  return out
}

/**
 * Apply a turn's director notes to every PRESENT character — including
 * clearing anyone with no note this turn. These are kept on CharacterState
 * only for panel/debug visibility; unlike canon, they are never re-injected
 * from stored state — the note already reached the prompt directly, for
 * exactly the generation it was computed for.
 */
export function applyDirectorNotes(present: CharacterState[], notes: Record<string, string>): void {
  for (const c of present) {
    c.directorNote = notes[c.id]?.trim() || undefined
  }
}

/** Render every present character's note into one block for prompt injection. */
export function formatDirectorBlock(present: CharacterState[], notes: Record<string, string>): string | null {
  const withNotes = present.filter((c) => notes[c.id]?.trim())
  if (!withNotes.length) return null
  return [
    '[Psyche Director — how each character is genuinely receiving this moment; a',
    'boundary and a compass, not a script. Never recite or name this note directly.]',
    '',
    ...withNotes.map((c) => `## ${c.name}\n${notes[c.id].trim()}`),
  ].join('\n\n')
}
