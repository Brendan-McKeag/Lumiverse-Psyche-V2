import { neutralVector } from './affect'

/* ------------------------------------------------------------------ *
 * Psyche (core) — run state (per chat)
 *
 * Each chat tracks a set of characters. The card's own character is the
 * primary; the engine may introduce supporting characters as the story
 * brings them in. Every character carries a live 40-dimension affect
 * vector and a durable approval ledger (the player's accumulated standing
 * with them) — nothing else. The player character is NOT tracked here; we
 * only model the characters the player is interacting with.
 * ------------------------------------------------------------------ */

export interface CharacterState {
  /** stable slug within the run */
  id: string
  name: string
  /** the card's own character is the primary target; NPCs are secondary */
  isPrimary: boolean
  /** is this character currently in the scene with the player? */
  present: boolean
  /** the 40-dim affect vector: per-key current value + resting baseline */
  emotions: Record<string, { value: number; baseline: number }>
  /**
   * APPROVAL — the BG3-style ledger of this character's accumulated opinion of
   * the player, -10000..+10000, starting neutral at 0. Unlike the affect vector
   * it never decays and accumulates linearly, in small increments (±1..10 per
   * adjustment). It gates trust and willingness: high approval buys latitude —
   * going along even against their own preferences; low approval means
   * guardedness, pushback, refusal.
   */
  approval?: number
  updatedAt: number
}

export interface RunState {
  chatId: string
  /** the card's character id (the primary character) */
  characterId: string | null
  /** characters in this run, keyed by slug */
  characters: Record<string, CharacterState>
  createdAt: number
  updatedAt: number
}

export function emptyRun(chatId: string): RunState {
  const now = Date.now()
  return {
    chatId,
    characterId: null,
    characters: {},
    createdAt: now,
    updatedAt: now,
  }
}

export function newCharacter(id: string, name: string, isPrimary: boolean): CharacterState {
  return {
    id,
    name,
    isPrimary,
    present: isPrimary,
    emotions: neutralVector(),
    approval: 0,
    updatedAt: Date.now(),
  }
}

/** Ensure every defined emotion exists on a character (schema migrations). */
export function backfillEmotions(c: CharacterState) {
  const nv = neutralVector()
  for (const k of Object.keys(nv)) if (!c.emotions[k]) c.emotions[k] = nv[k]
  c.approval ??= 0 // de-facto per-character migration hook; older runs predate approval
}

/**
 * Ensure the card's own character exists in the run as the primary, current
 * name applied and marked present. Returns the primary.
 */
export function ensurePrimary(run: RunState, id: string, name: string): CharacterState {
  run.characterId = id
  let primary = Object.values(run.characters).find((c) => c.isPrimary)
  if (!primary) {
    const slug = slugify(name) || 'protagonist_char'
    primary = newCharacter(run.characters[slug] ? `${slug}_main` : slug, name, true)
    run.characters[primary.id] = primary
  }
  primary.name = name
  primary.present = true
  return primary
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return base || `npc_${Math.random().toString(36).slice(2, 7)}`
}
