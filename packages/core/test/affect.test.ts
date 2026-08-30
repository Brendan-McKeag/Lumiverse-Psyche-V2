import { describe, expect, test } from 'bun:test'
import {
  EMOTIONS,
  EMOTION_BY_KEY,
  applyStimulus,
  clampSeed,
  describeValue,
  fromPressure,
  neutralVector,
  relaxToward,
  toPressure,
  SEED_BASELINE_CEIL,
  SEED_OPENING_CEIL,
} from '../src/affect'

const uni = EMOTION_BY_KEY['joy']
const bi = EMOTION_BY_KEY['valence']

describe('pressure <-> value transfer', () => {
  test('round-trips across the working range', () => {
    for (const v of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99]) {
      expect(fromPressure(uni, toPressure(uni, v))).toBeCloseTo(v, 6)
    }
    for (const v of [-0.99, -0.5, 0, 0.5, 0.99]) {
      expect(fromPressure(bi, toPressure(bi, v))).toBeCloseTo(v, 6)
    }
  })

  test('values are clamped so pressure stays finite', () => {
    expect(Number.isFinite(toPressure(uni, 1))).toBe(true)
    expect(Number.isFinite(toPressure(bi, -1))).toBe(true)
    expect(fromPressure(uni, Infinity)).toBeLessThan(1)
    expect(fromPressure(bi, -Infinity)).toBeGreaterThan(-1)
  })
})

describe('applyStimulus saturation', () => {
  test('documented calibration anchors hold from rest', () => {
    // The prompts promise: +1 -> ~0.22, +3 -> ~0.53, +5 -> ~0.71, +9 crosses 0.9.
    expect(applyStimulus(uni, 0, 1)).toBeCloseTo(0.221, 2)
    expect(applyStimulus(uni, 0, 3)).toBeCloseTo(0.528, 2)
    expect(applyStimulus(uni, 0, 5)).toBeCloseTo(0.713, 2)
    expect(applyStimulus(uni, 0, 9)).toBeGreaterThan(0.89)
  })

  test('monotonic, and the same push buys less near the extreme', () => {
    const low = applyStimulus(uni, 0.1, 1) - 0.1
    const high = applyStimulus(uni, 0.9, 1) - 0.9
    expect(low).toBeGreaterThan(0)
    expect(high).toBeGreaterThan(0)
    expect(high).toBeLessThan(low)
  })

  test('negative intensity relieves and never crosses the floor', () => {
    expect(applyStimulus(uni, 0.5, -2)).toBeLessThan(0.5)
    expect(applyStimulus(uni, 0.05, -50)).toBeGreaterThanOrEqual(0)
  })

  test('bipolar axes saturate symmetrically', () => {
    const up = applyStimulus(bi, 0, 2)
    const down = applyStimulus(bi, 0, -2)
    expect(up).toBeCloseTo(-down, 6)
    expect(Math.abs(applyStimulus(bi, 0.99, 10))).toBeLessThan(1)
  })
})

describe('relaxToward homeostasis', () => {
  test('baseline is a fixpoint', () => {
    expect(relaxToward(uni, 0.3, 0.3, 0.5)).toBeCloseTo(0.3, 6)
  })

  test('moves toward the baseline from both sides', () => {
    expect(relaxToward(uni, 0.8, 0.2, 0.12)).toBeLessThan(0.8)
    expect(relaxToward(uni, 0.8, 0.2, 0.12)).toBeGreaterThan(0.2)
    expect(relaxToward(uni, 0.05, 0.3, 0.12)).toBeGreaterThan(0.05)
  })

  test('rate 1 lands on the baseline, rate 0 does not move', () => {
    expect(relaxToward(uni, 0.8, 0.2, 1)).toBeCloseTo(0.2, 6)
    expect(relaxToward(uni, 0.8, 0.2, 0)).toBeCloseTo(0.8, 6)
  })

  test('out-of-range rates are clamped', () => {
    expect(relaxToward(uni, 0.8, 0.2, 5)).toBeCloseTo(0.2, 6)
    expect(relaxToward(uni, 0.8, 0.2, -1)).toBeCloseTo(0.8, 6)
  })
})

describe('clampSeed ceilings', () => {
  test('baselines and openings cannot start pegged', () => {
    expect(clampSeed(uni, 0.95, 'baseline')).toBe(SEED_BASELINE_CEIL)
    expect(clampSeed(uni, 0.95, 'opening')).toBe(SEED_OPENING_CEIL)
    expect(clampSeed(uni, 0.2, 'baseline')).toBe(0.2)
    expect(clampSeed(uni, -0.3, 'baseline')).toBe(0)
  })

  test('bipolar clamp preserves sign', () => {
    expect(clampSeed(bi, -0.9, 'baseline')).toBe(-SEED_BASELINE_CEIL)
    expect(clampSeed(bi, 0.9, 'opening')).toBe(SEED_OPENING_CEIL)
    expect(clampSeed(bi, -0.2, 'baseline')).toBe(-0.2)
  })
})

describe('schema invariants', () => {
  test('40 emotions: 2 bipolar + 38 unipolar, unique keys', () => {
    expect(EMOTIONS.length).toBe(40)
    expect(EMOTIONS.filter((e) => e.kind === 'bipolar').map((e) => e.key).sort()).toEqual(['mood', 'valence'])
    expect(new Set(EMOTIONS.map((e) => e.key)).size).toBe(40)
  })

  test('neutralVector covers every emotion', () => {
    const nv = neutralVector()
    for (const e of EMOTIONS) expect(nv[e.key]).toBeDefined()
  })

  test('describeValue snaps to the nearest level', () => {
    expect(describeValue(uni, 0).label).toBe('absent')
    expect(describeValue(uni, 0.13).label).toBe('faint') // nearest-neighbor, not threshold
    expect(describeValue(uni, 1).label).toBe('all-consuming')
    expect(describeValue(bi, 0).label).toBe('neutral')
    expect(describeValue(bi, -0.9).label).toContain('−')
  })
})
