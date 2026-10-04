import { describe, expect, test } from 'bun:test'
import {
  chunkDocument,
  buildIndex,
  search,
  selectPassages,
  tableOfContents,
  groundingSystemPrompt,
  groundingUserContent,
  parseGroundingQueries,
  wholeLibrary,
  libraryChars,
  formatReferenceBlock,
  tokenize,
  GROUNDING_MAX_QUERIES,
  type ReferenceDoc,
} from '../src/grounding'
import { AGENT_SENTINEL, extractJson } from '../src/prompts'

function doc(id: string, title: string, text: string): ReferenceDoc {
  return { id, title, text, addedAt: 0 }
}

const HASTINGS = doc(
  'hastings',
  'Battle of Hastings',
  [
    'The Battle of Hastings was fought on 14 October 1066.',
    '',
    '## Background',
    'Edward the Confessor died childless in January 1066, leaving a disputed succession.',
    '',
    '## The battle',
    '### Forces',
    'Harold Godwinson commanded an English army of housecarls and fyrd on Senlac Hill.',
    '',
    '### Outcome',
    'Harold was killed late in the day, traditionally by an arrow to the eye.',
  ].join('\n'),
)

const BREAD = doc('bread', 'Medieval bread', 'Peasants ate maslin, a bread of mixed wheat and rye.')

describe('chunkDocument', () => {
  test('labels chunks with their heading path', () => {
    const chunks = chunkDocument(HASTINGS)
    expect(chunks.map((c) => c.label)).toEqual([
      'Battle of Hastings',
      'Battle of Hastings › Background',
      'Battle of Hastings › The battle › Forces',
      'Battle of Hastings › The battle › Outcome',
    ])
    expect(chunks[3].text).toContain('arrow to the eye')
  })

  test('packs paragraphs up to the target and splits oversize ones', () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} about the keep.`).join(' ')
    const chunks = chunkDocument(doc('d', 'T', `${long}\n\nshort tail`), 300)
    expect(chunks.length).toBeGreaterThan(3)
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(300)
    expect(chunks.map((c) => c.text).join(' ')).toContain('Sentence number 39')
  })

  test('empty text yields no chunks', () => {
    expect(chunkDocument(doc('e', 'Empty', '  \n\n '))).toEqual([])
  })
})

describe('BM25 search', () => {
  const index = buildIndex([...chunkDocument(HASTINGS), ...chunkDocument(BREAD)])

  test('ranks the passage that actually answers the query first', () => {
    expect(search(index, 'how did Harold die')[0].chunk.label).toBe('Battle of Hastings › The battle › Outcome')
    expect(search(index, 'what bread did peasants eat')[0].chunk.docId).toBe('bread')
  })

  test('no overlap or stopword-only query returns nothing', () => {
    expect(search(index, 'spaceship laser')).toEqual([])
    expect(search(index, 'the of and')).toEqual([])
  })

  test('tokenize folds case and diacritics', () => {
    expect(tokenize('Senlac HILL, Château!')).toEqual(['senlac', 'hill', 'chateau'])
  })
})

describe('selectPassages', () => {
  const index = buildIndex([...chunkDocument(HASTINGS), ...chunkDocument(BREAD)])

  test('de-duplicates across queries and gives every query its best hit', () => {
    const picked = selectPassages(index, ['Harold killed arrow', 'Harold arrow eye', 'maslin bread'], 10_000)
    expect(new Set(picked).size).toBe(picked.length)
    expect(picked[0].label).toContain('Outcome')
    expect(picked.some((c) => c.docId === 'bread')).toBe(true)
  })

  test('respects the character budget', () => {
    const picked = selectPassages(index, ['Hastings Harold Edward 1066'], 150)
    const used = picked.reduce((n, c) => n + c.label.length + c.text.length + 8, 0)
    expect(used).toBeLessThanOrEqual(150)
    expect(selectPassages(index, ['Harold'], 5)).toEqual([])
  })
})

describe('planner prompt', () => {
  test('system prompt carries the sentinel and the directive only when given', () => {
    expect(groundingSystemPrompt()).toStartWith(AGENT_SENTINEL)
    expect(groundingSystemPrompt('Norman-era court intrigue.')).toContain('Norman-era court intrigue.')
    expect(groundingSystemPrompt()).not.toContain('OPERATOR DIRECTIVE')
  })

  test('outline lists titles and nested headings', () => {
    const toc = tableOfContents([HASTINGS, BREAD])
    expect(toc).toContain('- Battle of Hastings')
    expect(toc).toContain('    - Background')
    expect(toc).toContain('      - Outcome')
    expect(toc).toContain('- Medieval bread')
    expect(tableOfContents([HASTINGS], 20).length).toBeLessThanOrEqual(22)
  })

  test('user content includes outline, scene and player message', () => {
    const c = groundingUserContent('- Battle of Hastings', 'Tell me of Senlac.', 'PLAYER: hi')
    expect(c).toContain('- Battle of Hastings')
    expect(c).toContain('Tell me of Senlac.')
    expect(c).toContain('PLAYER: hi')
  })
})

describe('parseGroundingQueries', () => {
  test('valid, fenced, capped and de-duplicated', () => {
    const raw = extractJson('```json\n{"queries": ["Harold death", " Harold death ", "Senlac", "fyrd", "maslin"]}\n```')
    const q = parseGroundingQueries(raw)
    expect(q).toEqual(['Harold death', 'Senlac', 'fyrd'])
    expect(q.length).toBe(GROUNDING_MAX_QUERIES)
  })

  test('empty or malformed → no queries', () => {
    expect(parseGroundingQueries({ queries: [] })).toEqual([])
    expect(parseGroundingQueries({ queries: 'Harold' })).toEqual([])
    expect(parseGroundingQueries({ queries: [3, null, ''] })).toEqual([])
    expect(parseGroundingQueries(null)).toEqual([])
    expect(parseGroundingQueries(extractJson('no json here'))).toEqual([])
  })
})

describe('whole-library shortcut and rendering', () => {
  test('wholeLibrary keeps every non-empty doc in order', () => {
    const all = wholeLibrary([HASTINGS, doc('x', 'Blank', '   '), BREAD])
    expect(all.map((c) => c.docId)).toEqual(['hastings', 'bread'])
    expect(libraryChars([HASTINGS, BREAD])).toBe(HASTINGS.text.length + BREAD.text.length)
  })

  test('reference block labels passages; empty → null', () => {
    const block = formatReferenceBlock(wholeLibrary([BREAD]))!
    expect(block).toContain('Psyche Reference')
    expect(block).toContain('### Medieval bread')
    expect(block).toContain('maslin')
    expect(formatReferenceBlock([])).toBeNull()
  })
})
