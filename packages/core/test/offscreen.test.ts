import { describe, expect, test } from 'bun:test'
import {
  castingUserContent,
  parseCasting,
  unitUserContent,
  parseUnitResult,
  mergeOffscreenResults,
  applyOffscreenResult,
  OFFSCREEN_FEELING_CLAMP,
  OFFSCREEN_APPROVAL_CLAMP,
  type OffscreenResult,
} from '../src/offscreen'
import { emptyRun, newCharacter, type RunState, type CharacterState } from '../src/state'

function fixtureRun(): { run: RunState; a: CharacterState; b: CharacterState; onstage: CharacterState } {
  const run = emptyRun('test-chat')
  const a = newCharacter('mara', 'Mara', false)
  a.present = false
  const b = newCharacter('tov', 'Tov', false)
  b.present = false
  const onstage = newCharacter('lena', 'Lena', true)
  onstage.present = true
  run.characters = { mara: a, tov: b, lena: onstage }
  return { run, a, b, onstage }
}

describe('parseCasting', () => {
  test('every input character ends up in exactly one group', () => {
    const parsed = parseCasting({ groups: [{ characterIds: ['mara', 'tov'], steer: 'catching up' }] }, ['mara', 'tov'])
    const all = parsed.groups.flatMap((g) => g.characterIds)
    expect(all.sort()).toEqual(['mara', 'tov'])
  })

  test('a character the model omits gets an auto-assigned solo group', () => {
    const parsed = parseCasting({ groups: [{ characterIds: ['mara'] }] }, ['mara', 'tov'])
    const solo = parsed.groups.find((g) => g.characterIds.includes('tov'))
    expect(solo?.characterIds).toEqual(['tov'])
  })

  test('unknown/on-stage ids are dropped from a group', () => {
    const parsed = parseCasting({ groups: [{ characterIds: ['mara', 'lena', 'ghost'] }] }, ['mara', 'tov'])
    const all = parsed.groups.flatMap((g) => g.characterIds)
    expect(all).not.toContain('lena')
    expect(all).not.toContain('ghost')
    expect(all).toContain('mara')
    expect(all).toContain('tov') // auto-fallback since it was never assigned
  })

  test('completely empty/malformed response still assigns everyone solo', () => {
    const parsed = parseCasting(null, ['mara', 'tov'])
    expect(parsed.groups.flatMap((g) => g.characterIds).sort()).toEqual(['mara', 'tov'])
  })
})

describe('unitUserContent', () => {
  test('on-stage characters appear only as a bare name, never with their own detail block', () => {
    const { run, a, b } = fixtureRun()
    run.characters.lena.knowledge = ['a secret only Lena should have']
    const content = unitUserContent([{ c: a, feelings: 'quiet' }, { c: b, feelings: 'quiet' }], undefined, ['Lena'])
    expect(content).toContain('Lena')
    expect(content).toContain('ON-STAGE RIGHT NOW')
    // Lena gets a bare name in the exclusion line only — never her own "### lena" block
    expect(content).not.toContain('### lena')
    expect(content).not.toContain('a secret only Lena should have')
  })

  test('members get their own detail blocks', () => {
    const { a } = fixtureRun()
    a.offscreenSummary = 'brooding in the garden'
    const content = unitUserContent([{ c: a, feelings: 'anxious' }], undefined, [])
    expect(content).toContain('mara')
    expect(content).toContain('brooding in the garden')
    expect(content).toContain('(nobody)')
  })
})

describe('parseUnitResult', () => {
  const memberIds = ['mara', 'tov']

  test('drops any id not in memberIds', () => {
    const parsed = parseUnitResult(
      {
        events: [{ description: 'x', participants: ['mara', 'ghost'], knowledgeFor: { mara: 'a thing happened', ghost: 'nope' } }],
        feelings: [{ characterId: 'ghost', emotion: 'joy', intensity: 2 }],
        approvals: [],
        summaries: { ghost: 'nope' },
      },
      memberIds,
      3,
    )
    expect(parsed.events[0].participants).toEqual(['mara'])
    expect(Object.keys(parsed.events[0].knowledgeFor)).toEqual(['mara'])
    expect(parsed.feelings).toHaveLength(0)
    expect(parsed.summaries.ghost).toBeUndefined()
  })

  test('caps events per character to eventBudget', () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      description: `event ${i}`,
      participants: ['mara'],
      knowledgeFor: { mara: `line ${i}` },
    }))
    const parsed = parseUnitResult({ events, feelings: [], approvals: [], summaries: {} }, memberIds, 2)
    const maraEvents = parsed.events.filter((e) => e.knowledgeFor.mara)
    expect(maraEvents).toHaveLength(2)
  })

  test('clamps feeling intensity and drops unknown emotion keys', () => {
    const parsed = parseUnitResult(
      {
        events: [],
        feelings: [
          { characterId: 'mara', emotion: 'joy', intensity: 99 },
          { characterId: 'mara', emotion: 'not_a_real_emotion', intensity: 2 },
          { characterId: 'mara', emotion: 'sadness', intensity: 0 },
        ],
        approvals: [],
        summaries: {},
      },
      memberIds,
      3,
    )
    expect(parsed.feelings).toHaveLength(1)
    expect(parsed.feelings[0].intensity).toBe(OFFSCREEN_FEELING_CLAMP)
  })

  test('clamps approval delta and drops it when the character has no event this call', () => {
    const withEvent = parseUnitResult(
      {
        events: [{ description: 'x', participants: ['mara'], knowledgeFor: { mara: 'about the player' } }],
        feelings: [],
        approvals: [{ characterId: 'mara', delta: 99, reason: 'x' }],
        summaries: {},
      },
      memberIds,
      3,
    )
    expect(withEvent.approvals).toHaveLength(1)
    expect(withEvent.approvals[0].delta).toBe(OFFSCREEN_APPROVAL_CLAMP)

    const withoutEvent = parseUnitResult(
      { events: [], feelings: [], approvals: [{ characterId: 'mara', delta: 3, reason: 'x' }], summaries: {} },
      memberIds,
      3,
    )
    expect(withoutEvent.approvals).toHaveLength(0)
  })
})

describe('mergeOffscreenResults', () => {
  test('concatenates events/feelings/approvals and merges summaries', () => {
    const a: OffscreenResult = {
      events: [{ description: 'a', participants: ['mara'], knowledgeFor: { mara: 'a' } }],
      feelings: [{ characterId: 'mara', emotion: 'joy', intensity: 1, reason: '' }],
      approvals: [],
      summaries: { mara: 'summary a' },
    }
    const b: OffscreenResult = {
      events: [{ description: 'b', participants: ['tov'], knowledgeFor: { tov: 'b' } }],
      feelings: [],
      approvals: [{ characterId: 'tov', delta: 2, reason: '' }],
      summaries: { tov: 'summary b' },
    }
    const merged = mergeOffscreenResults([a, b])
    expect(merged.events).toHaveLength(2)
    expect(merged.feelings).toHaveLength(1)
    expect(merged.approvals).toHaveLength(1)
    expect(merged.summaries).toEqual({ mara: 'summary a', tov: 'summary b' })
  })
})

describe('applyOffscreenResult', () => {
  test('moves emotions via the saturating curve and pushes knowledge', () => {
    const { run, a } = fixtureRun()
    const before = a.emotions['joy'].value
    const result: OffscreenResult = {
      events: [{ description: 'x', participants: ['mara'], knowledgeFor: { mara: 'something happened' } }],
      feelings: [{ characterId: 'mara', emotion: 'joy', intensity: 2, reason: '' }],
      approvals: [],
      summaries: {},
    }
    const { touched, events } = applyOffscreenResult(run, result, 5)
    expect(touched.has('mara')).toBe(true)
    expect(events).toBe(1)
    expect(a.emotions['joy'].value).toBeGreaterThan(before)
    expect(a.knowledge).toContain('something happened')
  })

  test('sets offscreenAtTurn/lastOffscreenAt only for touched characters', () => {
    const { run, a, b } = fixtureRun()
    const result: OffscreenResult = {
      events: [],
      feelings: [{ characterId: 'mara', emotion: 'joy', intensity: 1, reason: '' }],
      approvals: [],
      summaries: {},
    }
    applyOffscreenResult(run, result, 7)
    expect(a.offscreenAtTurn).toBe(7)
    expect(a.lastOffscreenAt).toBeGreaterThan(0)
    expect(b.offscreenAtTurn).toBeUndefined()
  })

  test('a multi-participant event applies independently-worded knowledge to each participant', () => {
    const { run, a, b } = fixtureRun()
    const result: OffscreenResult = {
      events: [{ description: 'they talked', participants: ['mara', 'tov'], knowledgeFor: { mara: "Tov seemed distracted", tov: "Mara wouldn't drop it" } }],
      feelings: [],
      approvals: [],
      summaries: {},
    }
    applyOffscreenResult(run, result, 1)
    expect(a.knowledge).toContain('Tov seemed distracted')
    expect(b.knowledge).toContain("Mara wouldn't drop it")
    expect(a.knowledge).not.toContain("Mara wouldn't drop it")
  })

  test('approval is clamped to APPROVAL_MIN/MAX and written', () => {
    const { run, a } = fixtureRun()
    a.approval = 9998
    const result: OffscreenResult = {
      events: [{ description: 'x', participants: ['mara'], knowledgeFor: { mara: 'about the player' } }],
      feelings: [],
      approvals: [{ characterId: 'mara', delta: 5, reason: '' }],
      summaries: {},
    }
    applyOffscreenResult(run, result, 1)
    expect(a.approval).toBe(10000)
  })
})
