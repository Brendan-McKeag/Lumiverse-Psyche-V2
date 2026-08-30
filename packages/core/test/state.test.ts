import { describe, expect, test } from 'bun:test'
import { emptyRun, newCharacter, backfillEmotions, pushKnowledge, KNOWLEDGE_CAP } from '../src/state'

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
