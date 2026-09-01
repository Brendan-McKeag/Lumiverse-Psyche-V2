import { neutralVector } from './affect'

/** Max entries kept in a character's `knowledge` log; oldest dropped first. */
export const KNOWLEDGE_CAP = 20

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
  /**
   * What this character personally knows — things they witnessed, were told,
   * or noted themselves. Capped short-term log, oldest dropped. This is the
   * ONLY source the off-stage simulation stage may read for a character's
   * context — never the on-stage transcript — so "only knows what they
   * witnessed" is true by construction.
   */
  knowledge?: string[]
  /** One-line continuity: what they've been up to since last seen on-stage. */
  offscreenSummary?: string
  /**
   * RunState.turnSeq value at which this character was last run through the
   * off-stage simulation stage — the pacing signal for "how much has
   * accumulated since we last checked on them," used instead of a fictional
   * clock.
   */
  offscreenAtTurn?: number
  /**
   * Wall-clock ms of the last off-stage simulation touch — secondary/debug
   * signal only, and a floor-guard against re-firing within the same burst
   * of regenerates/swipes. Must NEVER be surfaced to the model as an
   * in-fiction time claim.
   */
  lastOffscreenAt?: number
  /**
   * EPHEMERAL — the Director's most recent read of how this character is
   * receiving the moment: inclinations, hard lines, negotiable ground.
   * Computed fresh right before each reply (from a pre-generation prompt
   * interceptor, not the post-hoc pipeline) and kept here only for panel/
   * debug visibility — it is never re-injected from stored state, since it
   * already reached the prompt directly for the exact generation it was
   * computed for. Cleared (not left stale) on any turn with nothing to note.
   */
  directorNote?: string
  /**
   * PERMANENT — established facts about who this character is: history,
   * tastes, skills, relationships, quirks, speech habits. Invented to fill
   * what the card leaves blank, grown as the story reveals or suggests more.
   * Unlike `directorNote`, this is never cleared — once written, a fact is
   * fixed truth and only ever extended, never contradicted. Unlike a
   * `goals` field, nothing here is a directive about what the character
   * should do — it's backward-looking, not an agenda.
   */
  canon?: string
  updatedAt: number
}

export interface RunState {
  chatId: string
  /** the card's character id (the primary character) */
  characterId: string | null
  /** characters in this run, keyed by slug */
  characters: Record<string, CharacterState>
  /** Advances once per completed turn (not per stage) — the shared "how long
   * has it been" counter the offscreen stage's pacing uses instead of a
   * fictional in-fiction clock. */
  turnSeq: number
  createdAt: number
  updatedAt: number
}

export function emptyRun(chatId: string): RunState {
  const now = Date.now()
  return {
    chatId,
    characterId: null,
    characters: {},
    turnSeq: 0,
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
    knowledge: [],
    updatedAt: Date.now(),
  }
}

/** Ensure every defined emotion exists on a character (schema migrations). */
export function backfillEmotions(c: CharacterState) {
  const nv = neutralVector()
  for (const k of Object.keys(nv)) if (!c.emotions[k]) c.emotions[k] = nv[k]
  c.approval ??= 0 // de-facto per-character migration hook; older runs predate approval
  c.knowledge ??= []
}

/** Append a knowledge entry, capped to KNOWLEDGE_CAP, oldest dropped first.
 *  The single mutation point both the note_knowledge tool and the offscreen
 *  stage's apply function use, so cap logic lives in exactly one place. */
export function pushKnowledge(c: CharacterState, entry: string) {
  const e = entry.trim()
  if (!e) return
  c.knowledge = [...(c.knowledge ?? []), e].slice(-KNOWLEDGE_CAP)
}

/** Per-turn injection cap for canon; the stored value can grow past this. */
export const CANON_INJECT_CAP = 3000

/** Cap canon for injection, marking the cut visibly rather than silently truncating. */
export function canonForInjection(canon: string, cap = CANON_INJECT_CAP): string {
  const full = (canon ?? '').trim()
  if (!full || full.length <= cap) return full
  return `${full.slice(0, cap)}\n…[canon truncated — ${full.length - cap} more chars not shown]`
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
