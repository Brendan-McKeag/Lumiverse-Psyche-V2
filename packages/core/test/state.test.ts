import { describe, expect, test } from 'bun:test'
import { emptyRun, newCharacter, backfillEmotions, pushKnowledge, KNOWLEDGE_CAP, canonForInjection } from '../src/state'

describe('pushKnowledge', () => {
  test('appends entries and caps at KNOWLEDGE_CAP, dropping the oldest first', () => {
    const c = newCharacter('mara', 'Mara', false)
    for (let i = 0; i < KNOWLEDGE_CAP + 5; i++) pushKnowledge(c, `entry ${i}`)
    expect(c.knowledge).toHaveLength(KNOWLEDGE_CAP)
    expect(c.knowledge?.[0]).toBe(`entry 5`)
    expect(c.knowledge?.at(-1)).toBe(`entry ${KNOWLEDGE_CAP + 4}`)
  })

  test('ignores empty/whitespace-only entries', () => {
    const c = newCharacter('mara', 'Mara', false)
    pushKnowledge(c, '   ')
    pushKnowledge(c, '')
    expect(c.knowledge).toEqual([])
  })
})

describe('backfillEmotions', () => {
  test('gives an older character record a knowledge array', () => {
    const c = newCharacter('mara', 'Mara', false)
    delete (c as { knowledge?: string[] }).knowledge
    backfillEmotions(c)
    expect(c.knowledge).toEqual([])
  })
})

describe('emptyRun', () => {
  test('starts turnSeq at 0', () => {
    expect(emptyRun('chat-1').turnSeq).toBe(0)
  })
})

describe('canonForInjection', () => {
  test('returns the full string when under the cap', () => {
    expect(canonForInjection('She grew up in Rook Harbor.', 100)).toBe('She grew up in Rook Harbor.')
  })

  test('empty/whitespace-only input yields empty output', () => {
    expect(canonForInjection('', 100)).toBe('')
    expect(canonForInjection('   ', 100)).toBe('')
  })

  test('truncates over the cap with a visible marker, not silently', () => {
    const full = 'fact. '.repeat(100) // 600 chars
    const capped = canonForInjection(full, 100)
    expect(capped.length).toBeGreaterThan(100) // marker text pushes it back over
    expect(capped).toContain('…[canon truncated —')
    expect(capped.startsWith(full.slice(0, 100))).toBe(true)
  })
})
