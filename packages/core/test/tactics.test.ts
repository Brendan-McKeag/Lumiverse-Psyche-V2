import { describe, expect, test } from 'bun:test'
import {
  parseGeneratedTactics,
  clipOption,
  TACTIC_TEXT_CAP,
  similar,
  intensityCap,
  physicalAllowed,
  buildTacticMenu,
  tacticQuestion,
  resolveTactic,
  tacticClause,
  tacticWeights,
  tacticGenUserContent,
  TACTIC_ANCHORS,
  MAX_GENERATED,
  Q_TACTIC,
  OTHER_OPTION,
} from '../src/tactics'
import { STANCES } from '../src/decisions'
import { newCharacter, type CharacterState } from '../src/state'

function noz(): CharacterState {
  const c = newCharacter('noz', 'Noz', true)
  c.present = true
  return c
}

describe('parseGeneratedTactics', () => {
  test('validates tags, clamps intensity, defaults unknown kinds to verbal', () => {
    const out = parseGeneratedTactics({
      options: [
        { text: 'brings up the debt the player still owes', kind: 'leverage', intensity: 3 },
        { text: 'shoves the table between them', kind: 'physical', intensity: 9 },
        { text: 'mocks the request', kind: 'sarcasm', intensity: 0 },
        { text: '   ', kind: 'verbal', intensity: 1 },
      ],
    })
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual({ text: 'brings up the debt the player still owes', kind: 'leverage', intensity: 3 })
    expect(out[1].intensity).toBe(3)
    expect(out[2]).toEqual({ text: 'mocks the request', kind: 'verbal', intensity: 1 })
  })
  test('drops rewordings, caps the count, tolerates a bare array of strings', () => {
    const dupes = parseGeneratedTactics({
      options: [
        { text: 'calls out the player for lying', kind: 'verbal', intensity: 2 },
        { text: 'calls out the player for lying again', kind: 'verbal', intensity: 2 },
      ],
    })
    expect(dupes).toHaveLength(1)
    const many = parseGeneratedTactics({ options: Array.from({ length: 12 }, (_, i) => ({ text: `distinct move number ${i} alpha${i}`, kind: 'verbal', intensity: 1 })) })
    expect(many).toHaveLength(MAX_GENERATED)
    expect(parseGeneratedTactics(['walks out', 'slams the door'])).toHaveLength(2)
    expect(parseGeneratedTactics(null)).toEqual([])
  })
  test('keeps a long, vivid option whole instead of chopping it mid-sentence', () => {
    const vivid =
      'Whispers, "I\'m out of my mind," more to herself than to you, but stays exactly where you can see her, ' +
      'her throat bobbing with a hard swallow as she waits to see what you do with it'
    expect(vivid.length).toBeLessThan(TACTIC_TEXT_CAP)
    expect(parseGeneratedTactics({ options: [{ text: vivid, kind: 'verbal', intensity: 1 }] })[0].text).toBe(vivid)
  })
  test('text over the ceiling is trimmed at a clause boundary with an ellipsis, never mid-word', () => {
    const long = Array.from({ length: 30 }, (_, i) => `clause number ${i}`).join(', ')
    const clipped = clipOption(long, 120)
    expect(clipped.length).toBeLessThanOrEqual(121)
    expect(clipped.endsWith('…')).toBe(true)
    expect(clipped).toMatch(/clause number \d+…$/)
    expect(clipOption('short and sweet')).toBe('short and sweet')
    const oneWord = 'x'.repeat(200)
    expect(clipOption(oneWord, 50)).toHaveLength(51)
  })
  test('similar() catches rewordings but not different ideas', () => {
    expect(similar('calls it out directly', 'calls it out directly now')).toBe(true)
    expect(similar('calls it out directly', 'issues an ultimatum')).toBe(false)
  })
})

describe('policy', () => {
  test('intensity cap tracks emotional heat, override lifts it', () => {
    const c = noz()
    expect(intensityCap(c)).toBe(1)
    c.emotions.anger.value = 0.45
    expect(intensityCap(c)).toBe(2)
    c.emotions.anger.value = 0.75
    expect(intensityCap(c)).toBe(3)
    const d = noz()
    d.emotions.grief.value = 0.99
    expect(intensityCap(d)).toBe(3)
  })
  test('physical moves need something physical in play', () => {
    const c = noz()
    expect(physicalAllowed(c)).toBe(false)
    c.emotions.fear.value = 0.6
    expect(physicalAllowed(c)).toBe(true)
  })
  test('approval shapes the kind of move', () => {
    expect(tacticWeights(5000, 'leverage')).toBeLessThan(1)
    expect(tacticWeights(-3000, 'leverage')).toBeGreaterThan(1)
    expect(tacticWeights(0, 'verbal')).toBe(1)
  })
})

describe('buildTacticMenu', () => {
  test('drops over-cap and implausible physical options, keeps anchors and the escape hatch', () => {
    const c = noz() // calm: cap 1, nothing physical
    const menu = buildTacticMenu(c, 'escalate', [
      { text: 'threatens to tell the captain', kind: 'leverage', intensity: 3 },
      { text: 'grabs their collar', kind: 'physical', intensity: 1 },
      { text: 'goes very quiet and very cold', kind: 'verbal', intensity: 1 },
    ])
    expect(menu.cap).toBe(1)
    const texts = menu.options.map((o) => o.text)
    expect(texts).toContain('goes very quiet and very cold')
    expect(texts).not.toContain('threatens to tell the captain')
    expect(texts).not.toContain('grabs their collar')
    expect(menu.dropped.map((d) => d.why).join(' ')).toContain('cap')
    expect(menu.dropped.map((d) => d.why).join(' ')).toContain('physical')
    expect(menu.options[menu.options.length - 1]).toEqual(OTHER_OPTION)
  })
  test('every stance has anchors, and a calm character always gets a non-empty menu', () => {
    for (const s of STANCES) {
      expect(TACTIC_ANCHORS[s].length).toBeGreaterThan(0)
      const menu = buildTacticMenu(noz(), s, [])
      expect(menu.options.filter((o) => o.source === 'anchor').length).toBeGreaterThan(0)
    }
  })
  test('ids are stable and unique; the judge question lists every option', () => {
    const c = noz()
    c.emotions.anger.value = 0.8
    const menu = buildTacticMenu(c, 'escalate', [{ text: 'brings up the debt', kind: 'leverage', intensity: 3 }])
    const ids = menu.options.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toBe('g1')
    const q = tacticQuestion(c, 'escalate', menu)[Q_TACTIC]
    expect(q.kind).toBe('choice')
    if (q.kind === 'choice') expect(Object.keys(q.options)).toEqual(ids)
  })
})

describe('resolveTactic + render', () => {
  const hot = () => {
    const c = noz()
    c.emotions.anger.value = 0.8
    return c
  }
  test('picks from the distribution; temperature 0 is argmax', () => {
    const c = hot()
    const menu = buildTacticMenu(c, 'escalate', [{ text: 'brings up the debt', kind: 'leverage', intensity: 3 }])
    const t = resolveTactic({ value: 'g1', p: 0.7, dist: { g1: 0.7, a1: 0.2, other: 0.1 } }, c, menu, { temperature: 0 })!
    expect(t.option.text).toBe('brings up the debt')
    expect(t.torn).toBe(false)
  })
  test('high approval steers away from leverage even when the judge liked it', () => {
    const c = hot()
    c.approval = 5000
    const menu = buildTacticMenu(c, 'escalate', [{ text: 'brings up the debt', kind: 'leverage', intensity: 3 }])
    const t = resolveTactic({ value: 'g1', p: 0.5, dist: { g1: 0.5, a2: 0.4 } }, c, menu, { temperature: 0 })!
    expect(t.option.id).toBe('a2')
  })
  test('a point answer works; unknown answers and no answer yield null', () => {
    const c = hot()
    const menu = buildTacticMenu(c, 'stall', [])
    expect(resolveTactic({ value: 'a1', p: 1 }, c, menu, { temperature: 0 })?.option.id).toBe('a1')
    expect(resolveTactic({ value: 'zz', p: 1 }, c, menu)).toBeNull()
    expect(resolveTactic(undefined, c, menu)).toBeNull()
  })
  test('the clause names the move and intensity, notes a near-tie, and stays silent for "other"', () => {
    const c = hot()
    const menu = buildTacticMenu(c, 'escalate', [])
    const close = resolveTactic({ value: 'a2', p: 0.4, dist: { a2: 0.4, a3: 0.35, a1: 0.25 } }, c, menu, { temperature: 0 })!
    const clause = tacticClause(close)
    expect(clause).toContain('How: calls it out directly (firmly).')
    expect(clause).toContain('Half-tempted instead to issues an ultimatum')
    const other = resolveTactic({ value: 'other', p: 1 }, c, menu, { temperature: 0 })!
    expect(tacticClause(other)).toBe('')
  })
  test('generation prompt carries the state and the chosen stance', () => {
    const u = tacticGenUserContent('STATE-TEXT', noz(), 'negotiate')
    expect(u).toContain('STATE-TEXT')
    expect(u).toContain("NOZ'S STANCE THIS TURN: negotiate")
  })
})
