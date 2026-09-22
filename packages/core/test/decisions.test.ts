import { describe, expect, test } from 'bun:test'
import {
  STANCES,
  turnQuestions,
  decisionState,
  stanceDistribution,
  resolveStance,
  applyDecisions,
  stanceLine,
  formatDecisionBlock,
  parseLlmJudgeOutput,
  parseJevResponse,
  jevRequestBody,
  llmJudgeUserContent,
  approvalWeights,
  HARD_LINE_THRESHOLD,
  TORN_MARGIN,
  Q_STANCE,
  Q_HARD_LINE,
  Q_CHANGED_TERMS,
  Q_LEAVES,
  type Decision,
} from '../src/decisions'
import { newCharacter, type CharacterState } from '../src/state'

function mara(): CharacterState {
  const c = newCharacter('mara', 'Mara', true)
  c.present = true
  return c
}

const even = (): Record<string, number> => Object.fromEntries(STANCES.map((s) => [s, 1 / STANCES.length]))
const peaked = (on: string, p = 0.7): Record<string, number> => {
  const rest = (1 - p) / (STANCES.length - 1)
  return Object.fromEntries(STANCES.map((s) => [s, s === on ? p : rest]))
}
const answers = (stance: Record<string, number>, extra: Partial<Record<string, number>> = {}): Record<string, Decision> => ({
  [Q_STANCE]: { value: 'x', p: 0, dist: stance },
  [Q_HARD_LINE]: { value: 'no', p: extra.hard ?? 0 },
  [Q_CHANGED_TERMS]: { value: 'no', p: extra.changed ?? 0 },
  [Q_LEAVES]: { value: 'no', p: extra.leaves ?? 0 },
})

describe('question set + state', () => {
  test('asks the four turn questions, naming the character', () => {
    const q = turnQuestions(mara())
    expect(Object.keys(q).sort()).toEqual([Q_CHANGED_TERMS, Q_HARD_LINE, Q_LEAVES, Q_STANCE].sort())
    expect(q[Q_STANCE].kind).toBe('choice')
    expect(q[Q_STANCE].instructions).toContain('Mara')
    if (q[Q_STANCE].kind === 'choice') expect(Object.keys(q[Q_STANCE].options)).toEqual([...STANCES])
  })

  test('state carries card, canon, approval, readout, scene, and the move', () => {
    const c = mara()
    c.canon = 'Hates being lied to.'
    c.approval = 2500
    c.lastDecision = { stance: 'stall', margin: 0.1, torn: true, hardLine: 0, leaves: 0, turnSeq: 3, at: 0 }
    const s = decisionState(c, 'Trust me.', 'PLAYER: hi\nCHARACTER: hello', 'Name: Mara')
    expect(s).toContain('Name: Mara')
    expect(s).toContain('Hates being lied to.')
    expect(s).toContain('trusted')
    expect(s).toContain('Trust me.')
    expect(s).toContain('last turn they chose to: stall (and were torn about it)')
  })

  test('the LLM judge user content lists every option with its meaning', () => {
    const u = llmJudgeUserContent('STATE', turnQuestions(mara()))
    for (const s of STANCES) expect(u).toContain(`${s}:`)
    expect(u).toContain('yes/no')
  })
})

describe('stanceDistribution', () => {
  test('normalizes a partial distribution and ignores unknown keys', () => {
    const d = stanceDistribution({ value: 'refuse', p: 0.5, dist: { refuse: 3, comply: 1, bogus: 9 } })
    expect(d.refuse).toBeCloseTo(0.75)
    expect(d.comply).toBeCloseTo(0.25)
    expect(d.stall).toBe(0)
  })
  test('a point answer becomes a peaked distribution; garbage becomes uniform', () => {
    const p = stanceDistribution({ value: 'stall', p: 0.8 })
    expect(p.stall).toBeCloseTo(0.8)
    const u = stanceDistribution(undefined)
    expect(u.comply).toBeCloseTo(1 / STANCES.length)
  })
})

describe('resolveStance — policy in code', () => {
  test('temperature 0 is argmax; sampling never leaves the stance set', () => {
    const r = resolveStance(answers(peaked('negotiate')), mara(), { temperature: 0 })
    expect(r.stance).toBe('negotiate')
    for (let i = 0; i < 50; i++) {
      const s = resolveStance(answers(even()), mara(), { temperature: 1, rng: Math.random })
      expect(STANCES).toContain(s.stance)
    }
  })

  test('approval tilts an open question: devoted complies, hostile refuses', () => {
    const c = mara()
    c.approval = 5000
    const warm = resolveStance(answers(even()), c, { temperature: 0 })
    expect(warm.stance).toBe('comply')
    c.approval = -5000
    const cold = resolveStance(answers(even()), c, { temperature: 0 })
    expect(cold.stance).toBe('refuse')
  })

  test('approval weights are neutral in the middle band', () => {
    expect(approvalWeights(0)).toEqual({})
    expect(approvalWeights(500)).toEqual({})
  })

  test('a flagged hard line suppresses compliance even at devoted approval', () => {
    const c = mara()
    c.approval = 6000
    const r = resolveStance(answers(peaked('comply', 0.6), { hard: HARD_LINE_THRESHOLD }), c, { temperature: 0 })
    expect(r.stance).not.toBe('comply')
    expect(r.hardLine).toBe(HARD_LINE_THRESHOLD)
  })

  test('last stance is sticky unless the player changed the terms', () => {
    const c = mara()
    c.lastDecision = { stance: 'refuse', margin: 0.2, torn: false, hardLine: 0, leaves: 0, turnSeq: 1, at: 0 }
    const dist = { ...even(), comply: 0.2, refuse: 0.16 }
    const same = resolveStance(answers(dist), c, { temperature: 0 })
    expect(same.stance).toBe('refuse')
    const changed = resolveStance(answers(dist, { changed: 0.9 }), c, { temperature: 0 })
    expect(changed.stance).toBe('comply')
  })

  test('a narrow margin reads as torn, a wide one does not', () => {
    const close = resolveStance(answers({ ...even(), stall: 0.3, negotiate: 0.3 - TORN_MARGIN / 2 }), mara(), { temperature: 0 })
    expect(close.torn).toBe(true)
    expect(close.runnerUp).not.toBe(close.stance)
    const clear = resolveStance(answers(peaked('refuse', 0.9)), mara(), { temperature: 0 })
    expect(clear.torn).toBe(false)
  })

  test('the sampled stance is drawn from the adjusted distribution', () => {
    // rng returning 0 always picks the first stance with any mass, in STANCES order
    const r = resolveStance(answers(peaked('withdraw', 0.99)), mara(), { temperature: 0.5, rng: () => 0.999 })
    expect(r.stance).toBe('withdraw')
  })
})

describe('apply + render', () => {
  test('applyDecisions stores for decided characters and clears the rest', () => {
    const a = mara()
    const b = newCharacter('tov', 'Tov', false)
    b.present = true
    b.lastDecision = { stance: 'comply', margin: 1, torn: false, hardLine: 0, leaves: 0, turnSeq: 0, at: 0 }
    const r = resolveStance(answers(peaked('stall')), a, { temperature: 0 })
    applyDecisions([a, b], { mara: r }, 7)
    expect(a.lastDecision?.stance).toBe('stall')
    expect(a.lastDecision?.turnSeq).toBe(7)
    expect(b.lastDecision).toBeUndefined()
  })

  test('stanceLine renders the cue, the torn note, the hard line, and leaving', () => {
    const c = mara()
    const r = resolveStance(answers({ ...even(), refuse: 0.3, withdraw: 0.29 }, { hard: 0.9, leaves: 0.8 }), c, { temperature: 0 })
    const line = stanceLine(c, r)
    expect(line).toContain('This turn, Mara says no')
    expect(line).toContain('visibly torn')
    expect(line).toContain('will not cross')
    expect(line).toContain('ready to end this or leave')
  })

  test('formatDecisionBlock renders only decided characters, null when none', () => {
    const a = mara()
    const b = newCharacter('tov', 'Tov', false)
    b.present = true
    expect(formatDecisionBlock([a, b], {})).toBeNull()
    const block = formatDecisionBlock([a, b], { mara: resolveStance(answers(peaked('negotiate')), a, { temperature: 0 }) })!
    expect(block).toContain('## Mara')
    expect(block).not.toContain('## Tov')
    expect(block).toContain('Never name or recite this')
  })
})

describe('parseLlmJudgeOutput', () => {
  const q = turnQuestions(mara())
  test('full distributions and bare probabilities', () => {
    const out = parseLlmJudgeOutput({ stance: { refuse: 0.6, stall: 0.4 }, hard_line: 0.9, leaves: '0.2', changed_terms: false }, q)
    expect(out.stance.value).toBe('refuse')
    expect(out.stance.dist?.refuse).toBeCloseTo(0.6)
    expect(out.hard_line.p).toBe(0.9)
    expect(out.leaves.p).toBeCloseTo(0.2)
    expect(out.changed_terms.p).toBe(0)
  })
  test('tolerates a bare option string, a {choice, confidence} object, and nested probabilities', () => {
    expect(parseLlmJudgeOutput({ stance: 'stall' }, q).stance.dist?.stall).toBe(1)
    const obj = parseLlmJudgeOutput({ stance: { choice: 'refuse', confidence: 0.7 } }, q).stance
    expect(obj.value).toBe('refuse')
    expect(obj.p).toBeCloseTo(0.7)
    const nested = parseLlmJudgeOutput({ stance: { probabilities: { comply: 1, refuse: 1 } } }, q).stance
    expect(nested.dist?.comply).toBeCloseTo(0.5)
  })
  test('unknown options and malformed input yield nothing for that question', () => {
    expect(parseLlmJudgeOutput({ stance: 'shrug', hard_line: 'maybe' }, q)).toEqual({})
    expect(parseLlmJudgeOutput(null, q)).toEqual({})
  })
})

describe('Jev transport (pure parts)', () => {
  const q = turnQuestions(mara())
  test('request body follows the documented shape', () => {
    const body = jevRequestBody('S', q) as { model: string; state: string; questions: Record<string, { type: string; criteria?: unknown }> }
    expect(body.model).toBe('jev-latest')
    expect(body.state).toBe('S')
    expect(body.questions.stance.type).toBe('choice')
    expect(Object.keys(body.questions.stance.criteria as object)).toEqual([...STANCES])
    expect(body.questions.hard_line.type).toBe('noul')
  })
  test('answers parse into decisions with distributions', () => {
    const out = parseJevResponse(
      {
        answers: {
          stance: { type: 'choice', choice: 'negotiate', probabilities: { negotiate: 0.5, stall: 0.3, comply: 0.2 }, confidence: 0.5 },
          hard_line: { type: 'noul', noul: 0.12 },
          leaves: { type: 'noul', noul: 0.9 },
        },
      },
      q,
    )
    expect(out.stance.value).toBe('negotiate')
    expect(out.stance.dist?.stall).toBeCloseTo(0.3)
    expect(out.hard_line.p).toBeCloseTo(0.12)
    expect(out.leaves.value).toBe('yes')
    expect(out.changed_terms).toBeUndefined()
  })
  test('a response with no answers yields nothing', () => {
    expect(parseJevResponse({ error: 'nope' }, q)).toEqual({})
  })
})
