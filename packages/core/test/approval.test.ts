import { describe, expect, test } from 'bun:test'
import { describeApproval, APPROVAL_MIN, APPROVAL_MAX } from '../src/approval'

describe('approval bands', () => {
  test('neutral below the first band', () => {
    expect(describeApproval(0).label).toBe('neutral')
    expect(describeApproval(9).label).toBe('neutral')
    expect(describeApproval(-9).label).toBe('neutral')
  })

  test('first opinion registers at ±10', () => {
    expect(describeApproval(10).label).toBe('mildly favorable')
    expect(describeApproval(-10).label).toBe('mildly wary')
  })

  test('the top labels are reserved for the pegged extremes', () => {
    expect(describeApproval(9999).label).toBe('transcendent')
    expect(describeApproval(10000).label).toBe('unshakeable bond')
    expect(describeApproval(-9999).label).toBe('irredeemable')
    expect(describeApproval(-10000).label).toBe('implacable enemy')
  })

  test('out-of-range values clamp instead of leaking past the extreme', () => {
    expect(describeApproval(50000).label).toBe(describeApproval(APPROVAL_MAX).label)
    expect(describeApproval(-50000).label).toBe(describeApproval(APPROVAL_MIN).label)
  })

  test('band progression is monotone in tone (spot checks)', () => {
    expect(describeApproval(1000).label).toBe('warm')
    expect(describeApproval(4000).label).toBe('devoted')
    expect(describeApproval(-4000).label).toBe('hostile')
    expect(describeApproval(-2000).label).toBe('disliked')
  })
})
