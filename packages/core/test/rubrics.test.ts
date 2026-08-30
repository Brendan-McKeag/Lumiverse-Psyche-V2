import { describe, expect, test } from 'bun:test'
import { EMOTION_BY_KEY, EMOTIONS } from '../src/affect'
import { RUBRICS, rubricCoverage, rubricFor, rubricForKey, rubricTableText } from '../src/rubrics'

describe('rubric coverage', () => {
  test('every emotion has anchors', () => {
    const { missing } = rubricCoverage()
    expect(missing).toEqual([])
  })

  test('anchors are ascending and non-empty for each emotion', () => {
    for (const def of EMOTIONS) {
      const anchors = RUBRICS[def.key]
      expect(anchors.length).toBeGreaterThan(0)
      for (let i = 1; i < anchors.length; i++) {
        expect(anchors[i].at).toBeGreaterThan(anchors[i - 1].at)
      }
      for (const a of anchors) expect(a.behavior.trim().length).toBeGreaterThan(10)
    }
  })

  test('bipolar axes carry both poles, unipolar carry none negative', () => {
    for (const def of EMOTIONS) {
      const anchors = RUBRICS[def.key]
      if (def.kind === 'bipolar') {
        expect(anchors.some((a) => a.at < 0)).toBe(true)
        expect(anchors.some((a) => a.at > 0)).toBe(true)
      } else {
        expect(anchors.every((a) => a.at > 0)).toBe(true)
      }
    }
  })
})

describe('rubricFor lookup', () => {
  const anger = EMOTION_BY_KEY['anger']
  const valence = EMOTION_BY_KEY['mood']

  test('floor semantics: the highest anchor at or below the value wins', () => {
    expect(rubricFor(anger, 0.6)).toBe(RUBRICS.anger.find((a) => a.at === 0.5)!.behavior)
    expect(rubricFor(anger, 0.75)).toBe(RUBRICS.anger.find((a) => a.at === 0.75)!.behavior)
    expect(rubricFor(anger, 0.99)).toBe(RUBRICS.anger.find((a) => a.at === 0.9)!.behavior)
  })

  test('a feeling below the lowest anchor gets nothing to say', () => {
    expect(rubricFor(anger, 0.1)).toBeNull()
    expect(rubricFor(anger, 0)).toBeNull()
  })

  test('bipolar picks the pole matching the sign', () => {
    const pos = rubricFor(valence, 0.8)
    const neg = rubricFor(valence, -0.8)
    expect(pos).toBe(RUBRICS.mood.find((a) => a.at === 0.7)!.behavior)
    expect(neg).toBe(RUBRICS.mood.find((a) => a.at === -0.7)!.behavior)
    expect(pos).not.toBe(neg)
  })

  test('bipolar near zero is not worth describing', () => {
    expect(rubricFor(valence, 0.1)).toBeNull()
    expect(rubricFor(valence, -0.1)).toBeNull()
    expect(rubricFor(valence, 0)).toBeNull()
  })

  test('a mild negative picks the mild negative anchor, not the extreme one', () => {
    expect(rubricFor(valence, -0.4)).toBe(RUBRICS.mood.find((a) => a.at === -0.35)!.behavior)
  })

  test('rubricForKey tolerates an unknown key', () => {
    expect(rubricForKey('anger', 0.8)).toBeTruthy()
    expect(rubricForKey('not_a_feeling', 0.8)).toBeNull()
  })
})

describe('rubric table for prompts', () => {
  test('renders every emotion on its own line with its anchors', () => {
    const text = rubricTableText()
    for (const def of EMOTIONS) expect(text).toContain(`${def.key}:`)
    expect(text.split('\n')).toHaveLength(EMOTIONS.length)
    expect(text).toContain('interrupts, closes distance') // an actual anchor
  })
})
