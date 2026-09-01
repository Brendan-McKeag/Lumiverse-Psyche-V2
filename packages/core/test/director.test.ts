import { describe, expect, test } from 'bun:test'
import {
  directorSystemPrompt,
  directorUserContent,
  parseDirectorResult,
  applyDirectorNotes,
  formatDirectorBlock,
  DIRECTOR_NOTE_CAP,
} from '../src/director'
import { newCharacter, type CharacterState } from '../src/state'

function fixturePresent(): CharacterState[] {
  const a = newCharacter('mara', 'Mara', true)
  a.present = true
  const b = newCharacter('tov', 'Tov', false)
  b.present = true
  return [a, b]
}

describe('operator directive', () => {
  test('reaches the director system prompt when provided, omitted otherwise', () => {
    expect(directorSystemPrompt('Furry internet roleplay.')).toContain('Furry internet roleplay.')
    expect(directorSystemPrompt()).not.toContain('OPERATOR DIRECTIVE')
  })
})

describe('directorUserContent', () => {
  test('includes each present character, the player message, the scene, and the card', () => {
    const content = directorUserContent(fixturePresent(), 'I want the ledger.', 'PLAYER: hello', 'Name: Mara')
    expect(content).toContain('mara')
    expect(content).toContain('tov')
    expect(content).toContain('I want the ledger.')
    expect(content).toContain('PLAYER: hello')
    expect(content).toContain('Name: Mara')
  })

  test('surfaces an overriding emotional state when present', () => {
    const present = fixturePresent()
    present[0].emotions['fear'].value = 0.99
    const content = directorUserContent(present, 'run!', '', '')
    expect(content).toContain('OVERRIDING STATE')
    expect(content).toContain("your note should say how they")
  })

  test('an empty player message/scene still produces valid content', () => {
    const content = directorUserContent(fixturePresent(), '', '', '')
    expect(content).toContain('opening of the scene')
    expect(content).toContain('scene has just begun')
  })
})

describe('parseDirectorResult', () => {
  test('drops ids not present, caps note length', () => {
    const long = 'x'.repeat(DIRECTOR_NOTE_CAP + 500)
    const parsed = parseDirectorResult({ mara: long, ghost: 'nope' }, ['mara', 'tov'])
    expect(parsed.mara).toHaveLength(DIRECTOR_NOTE_CAP)
    expect(parsed.ghost).toBeUndefined()
  })

  test('malformed input yields nothing', () => {
    expect(parseDirectorResult(null, ['mara'])).toEqual({})
    expect(parseDirectorResult('nope', ['mara'])).toEqual({})
  })
})

describe('applyDirectorNotes', () => {
  test('sets a note for a character present in the result and clears everyone else', () => {
    const present = fixturePresent()
    present[1].directorNote = 'stale note from a prior turn'
    applyDirectorNotes(present, { mara: 'holding firm on the ledger' })
    expect(present[0].directorNote).toBe('holding firm on the ledger')
    expect(present[1].directorNote).toBeUndefined()
  })
})

describe('formatDirectorBlock', () => {
  test('renders only characters with a note, null when nobody has one', () => {
    const present = fixturePresent()
    expect(formatDirectorBlock(present, {})).toBeNull()
    const block = formatDirectorBlock(present, { mara: 'wary but curious' })!
    expect(block).toContain('## Mara')
    expect(block).toContain('wary but curious')
    expect(block).not.toContain('## Tov')
  })
})
