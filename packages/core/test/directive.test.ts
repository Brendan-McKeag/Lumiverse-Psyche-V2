import { describe, expect, test } from 'bun:test'
import { buildDirective, groundedReadout, overrideDirective } from '../src/directive'
import { emptyRun, newCharacter, RunState, CharacterState } from '../src/state'

function fixtureRun(): { run: RunState; c: CharacterState } {
  const run = emptyRun('test-chat')
  const c = newCharacter('mara', 'Mara', true)
  c.present = true
  run.characters['mara'] = c
  return { run, c }
}

describe('buildDirective', () => {
  test('returns null when nobody is present', () => {
    const run = emptyRun('empty')
    expect(buildDirective(run)).toBeNull()
    const { run: r2, c } = fixtureRun()
    c.present = false
    expect(buildDirective(r2)).toBeNull()
  })

  test('includes the character block with approval', () => {
    const { run } = fixtureRun()
    const d = buildDirective(run)!
    expect(d).toContain('[Psyche — emotional state]')
    expect(d).toContain('## Mara')
    expect(d).toContain('approval of the player: neutral')
  })

  test('humanTexture toggle gates its preamble block', () => {
    const { run } = fixtureRun()
    const on = buildDirective(run, { humanTexture: true })!
    const off = buildDirective(run, { humanTexture: false })!
    expect(on).toContain('MATCH THEIR ENERGY')
    expect(off).not.toContain('MATCH THEIR ENERGY')
  })
})

describe('override tiers', () => {
  test('quiet mind emits no override block', () => {
    const { c } = fixtureRun()
    expect(overrideDirective(c)).toBe('')
  })

  test('an extreme feeling produces the overriding-state block, placed first', () => {
    const { run, c } = fixtureRun()
    c.emotions['anger'].value = 0.99
    const block = overrideDirective(c)
    expect(block).toContain('OVERRIDING STATE')
    expect(block).toContain('ALL-CONSUMING')
    const d = buildDirective(run)!
    expect(d.indexOf('OVERRIDING STATE')).toBeLessThan(d.indexOf('Underneath'))
  })
})

describe('rubric-anchored readout', () => {
  test('the strongest feeling in a group carries its behavioral anchor', () => {
    const { run, c } = fixtureRun()
    c.emotions['anger'].value = 0.8
    c.emotions['irritation'].value = 0.3
    const d = buildDirective(run)!
    expect(d).toContain('interrupts, closes distance') // anger's 0.75 anchor
  })

  test('only the leader carries an anchor, so the block stays a signal not a paragraph', () => {
    const { c } = fixtureRun()
    c.emotions['anger'].value = 0.8
    c.emotions['irritation'].value = 0.78
    const readout = groundedReadout(c)
    const anchored = readout.split('\n').filter((l) => l.includes(' — '))
    // energy, agreeableness and the one group leader at most
    expect(anchored.length).toBeLessThanOrEqual(3)
  })

  test('a quiet mind gets no anchors at all', () => {
    const { c } = fixtureRun()
    expect(groundedReadout(c)).not.toContain(' — ')
  })
})

describe('groundedReadout', () => {
  test('quiet mind reads as even-keeled', () => {
    const { c } = fixtureRun()
    expect(groundedReadout(c)).toContain('emotionally quiet')
  })

  test('salient feelings appear grouped by behavioral pull', () => {
    const { c } = fixtureRun()
    c.emotions['affection'].value = 0.5
    c.emotions['anxiety'].value = 0.4
    const r = groundedReadout(c)
    expect(r).toContain('pulling them toward you: affection')
    expect(r).toContain('holding back / wary: anxiety')
    expect(r).not.toContain('emotionally quiet')
  })

  test('tension pairs surface as visible inner conflict', () => {
    const { c } = fixtureRun()
    c.emotions['desire'].value = 0.5
    c.emotions['shame'].value = 0.45
    expect(groundedReadout(c)).toContain('desire fighting shame')
  })
})
