import { describe, expect, test } from 'bun:test'
import {
  resistanceSystemPrompt,
  parseResistance,
  applyResistanceResult,
  resistanceUserContent,
  RESISTANCE_NOTE_CAP,
} from '../src/resistance'
import { newCharacter, type CharacterState } from '../src/state'

function fixturePresent(): CharacterState[] {
  const a = newCharacter('mara', 'Mara', true)
  a.present = true
  const b = newCharacter('tov', 'Tov', false)
  b.present = true
  return [a, b]
}

describe('operator directive', () => {
  test('reaches the resistance system prompt when provided, omitted otherwise', () => {
    expect(resistanceSystemPrompt('Furry internet roleplay.')).toContain('Furry internet roleplay.')
    expect(resistanceSystemPrompt()).not.toContain('OPERATOR DIRECTIVE')
  })
})

describe('parseResistance', () => {
  test('drops ids not in presentIds', () => {
    const parsed = parseResistance({ mara: 'not backing down on this', ghost: 'nope' }, ['mara', 'tov'])
    expect(parsed).toEqual({ mara: 'not backing down on this' })
  })

  test('caps notes to RESISTANCE_NOTE_CAP', () => {
    const long = 'x'.repeat(RESISTANCE_NOTE_CAP + 200)
    const parsed = parseResistance({ mara: long }, ['mara'])
    expect(parsed.mara).toHaveLength(RESISTANCE_NOTE_CAP)
  })

  test('drops empty/whitespace-only entries', () => {
    const parsed = parseResistance({ mara: '   ', tov: '' }, ['mara', 'tov'])
    expect(parsed).toEqual({})
  })

  test('malformed/non-object input yields nothing', () => {
    expect(parseResistance(null, ['mara'])).toEqual({})
    expect(parseResistance('not an object', ['mara'])).toEqual({})
  })
})

describe('applyResistanceResult', () => {
  test('sets a note for a character present in the parsed result', () => {
    const present = fixturePresent()
    applyResistanceResult(present, { mara: 'wont give up the ledger' })
    expect(present[0].resistance).toBe('wont give up the ledger')
  })

  test('clears resistance for a present character with no note this turn, even if they had one last turn', () => {
    const present = fixturePresent()
    present[0].resistance = 'stale note from three turns ago'
    applyResistanceResult(present, {}) // nothing conflicts this turn
    expect(present[0].resistance).toBeUndefined()
  })

  test('a character not in the parsed result but present is still cleared, not skipped', () => {
    const present = fixturePresent()
    present[1].resistance = 'old boundary'
    applyResistanceResult(present, { mara: 'holding firm' })
    expect(present[0].resistance).toBe('holding firm')
    expect(present[1].resistance).toBeUndefined()
  })
})

describe('resistanceUserContent', () => {
  test('includes each present character, the recent scene, and the card context', () => {
    const present = fixturePresent()
    const content = resistanceUserContent(present, 'PLAYER: give me the ledger.', 'Name: Mara')
    expect(content).toContain('mara')
    expect(content).toContain('tov')
    expect(content).toContain('give me the ledger')
    expect(content).toContain('Name: Mara')
  })

  test('an empty scene still produces valid content', () => {
    const content = resistanceUserContent(fixturePresent(), '', '')
    expect(content).toContain('the scene has just begun')
  })
})
