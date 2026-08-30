import type { CharacterState } from './state'

/* ---------------------------- approval ------------------------------ */
/*
 * The approval LEDGER (BG3-style). Bands are spaced EVENLY across the space
 * (every 1000 points) so growth reads as steady progress rather than a curve
 * that front-loads all the meaning near zero — except the very first band,
 * which sits at 10 so a handful of turns is enough to register *some* opinion
 * at all. The top label is reserved for the pegged extreme: "unshakeable" /
 * "implacable" only apply at exactly ±10000, never before.
 */

export const APPROVAL_MIN = -10000
export const APPROVAL_MAX = 10000

interface ApprovalBand {
  at: number // band applies when |approval| >= at (bands checked high to low)
  pos: { label: string; meaning: string }
  neg: { label: string; meaning: string }
}

const APPROVAL_BANDS: ApprovalBand[] = [
  {
    at: 10000,
    pos: { label: 'unshakeable bond', meaning: 'absolute; nothing the player could do would break it — their lives are entwined' },
    neg: { label: 'implacable enemy', meaning: 'absolute; nothing could mend it — destroying the player is a purpose in itself' },
  },
  {
    at: 9000,
    pos: { label: 'transcendent', meaning: "beyond ordinary loyalty; the player's wellbeing IS their own — hard to imagine a line that would break this" },
    neg: { label: 'irredeemable', meaning: 'beyond ordinary enmity; harming the player has become how they measure a good day' },
  },
  {
    at: 8000,
    pos: { label: 'inseparable', meaning: 'near-absolute; only a fundamental betrayal could shake it, and they would not believe it at first' },
    neg: { label: 'irreconcilable', meaning: 'near-absolute enmity; only an extraordinary act could crack it, and they would distrust it as a trick' },
  },
  {
    at: 7000,
    pos: { label: 'lifelong', meaning: 'identity-level attachment; they would uproot their life for the player without being asked' },
    neg: { label: 'sworn against', meaning: 'a dedicated enemy; opposes the player at real personal cost, and plans ahead to do it' },
  },
  {
    at: 6000,
    pos: { label: 'bound', meaning: 'the player is family, inner circle; loyalty survives serious tests and public cost' },
    neg: { label: 'embittered', meaning: 'hatred woven into who they are; sabotages on sight, poisons others against the player' },
  },
  {
    at: 5000,
    pos: { label: 'profoundly loyal', meaning: 'stakes their own safety and standing on the player as a matter of course' },
    neg: { label: 'vengeful', meaning: 'actively seeks to harm or thwart the player, not just refuse them' },
  },
  {
    at: 4000,
    pos: { label: 'devoted', meaning: 'their default is yes, even at real cost to themselves — a betrayal here would be shattering' },
    neg: { label: 'hostile', meaning: 'their default is no; only self-interest or coercion moves them to cooperate' },
  },
  {
    at: 3000,
    pos: { label: 'deeply trusted', meaning: 'extends serious latitude — takes risks on the player\'s word alone' },
    neg: { label: 'resented', meaning: 'actively resists, tests, or undermines; any cooperation is strictly transactional' },
  },
  {
    at: 2000,
    pos: { label: 'trusted', meaning: 'will go along with requests that cut against their own preferences, within reason' },
    neg: { label: 'disliked', meaning: 'needs convincing even for reasonable asks; pushes back readily' },
  },
  {
    at: 1000,
    pos: { label: 'warm', meaning: 'openly at ease; shares more, volunteers help, extends real trust' },
    neg: { label: 'distrustful', meaning: 'guarded; verifies claims, keeps things back' },
  },
  {
    at: 10,
    pos: { label: 'mildly favorable', meaning: 'a small benefit of the doubt, granted' },
    neg: { label: 'mildly wary', meaning: 'a small benefit of the doubt, withheld' },
  },
]

export function describeApproval(a: number): { label: string; meaning: string } {
  const v = Math.max(APPROVAL_MIN, Math.min(APPROVAL_MAX, a))
  for (const band of APPROVAL_BANDS) {
    if (Math.abs(v) >= band.at) return v > 0 ? band.pos : band.neg
  }
  return { label: 'neutral', meaning: 'no formed opinion; trust and patience are at their defaults' }
}

/** The injected approval line — label carries the behavior, value gives continuity. */
export function approvalLine(c: CharacterState): string {
  const a = c.approval ?? 0
  const d = describeApproval(a)
  return `approval of the player: ${d.label} (${Math.round(a)}) — ${d.meaning}`
}
