import { AGENT_SENTINEL } from './prompts'

/* ------------------------------------------------------------------ *
 * Psyche (core) — grounding: a per-character reference library
 *
 * A small prose model writes beautifully but knows less of the world than a
 * frontier model. Grounding closes that gap with retrieval instead of
 * parameters: the operator pastes reference text (an encyclopedia article, a
 * setting bible, notes) into a character's library; right before each reply
 * the engine model names what this turn actually needs checked, BM25 pulls
 * the matching passages, and they are injected as ground truth. The prose
 * model only has to USE facts it is handed — something even small models do
 * well — rather than remember them.
 *
 * Pure logic only: chunking, a BM25 index, the planner prompt, and the
 * reference block renderer. No host API, filesystem, or network.
 * ------------------------------------------------------------------ */

export interface ReferenceDoc {
  id: string
  title: string
  text: string
  addedAt: number
}

export interface Chunk {
  docId: string
  /** "Doc title › Section › Subsection" */
  label: string
  text: string
  /** position within its doc, for stable ordering of injected passages */
  order: number
}

export const CHUNK_TARGET_CHARS = 800
export const GROUNDING_MAX_QUERIES = 3
export const GROUNDING_PER_QUERY = 4
export const TOC_CAP = 4000

/* ----------------------------- chunking ----------------------------- */

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/

/** Split one block of text that's too long on sentence boundaries, falling back to hard cuts. */
function splitLong(text: string, target: number): string[] {
  if (text.length <= target) return [text]
  const sentences = text.match(/[^.!?\n]+(?:[.!?]+["')\]]*|\n|$)\s*/g) ?? [text]
  const out: string[] = []
  let cur = ''
  for (const s of sentences) {
    if (cur && cur.length + s.length > target) {
      out.push(cur.trim())
      cur = ''
    }
    if (s.length > target) {
      for (let i = 0; i < s.length; i += target) out.push(s.slice(i, i + target).trim())
      continue
    }
    cur += s
  }
  if (cur.trim()) out.push(cur.trim())
  return out.filter(Boolean)
}

/**
 * Split a document on markdown headings, then pack paragraphs into chunks of
 * roughly `target` chars. Every chunk carries its heading path so an injected
 * passage still says where it came from.
 */
export function chunkDocument(doc: ReferenceDoc, target = CHUNK_TARGET_CHARS): Chunk[] {
  const title = doc.title.trim() || 'Untitled'
  const path: string[] = []
  const sections: { label: string; paras: string[] }[] = [{ label: title, paras: [] }]
  let para: string[] = []

  const flushPara = () => {
    const p = para.join('\n').trim()
    if (p) sections[sections.length - 1].paras.push(p)
    para = []
  }

  for (const line of doc.text.replace(/\r\n?/g, '\n').split('\n')) {
    const h = line.match(HEADING)
    if (h) {
      flushPara()
      const depth = h[1].length
      path.length = Math.min(path.length, depth - 1)
      path[depth - 1] = h[2].trim()
      sections.push({ label: [title, ...path.filter(Boolean)].join(' › '), paras: [] })
    } else if (!line.trim()) {
      flushPara()
    } else {
      para.push(line)
    }
  }
  flushPara()

  const chunks: Chunk[] = []
  for (const sec of sections) {
    let cur = ''
    const push = () => {
      if (cur.trim()) chunks.push({ docId: doc.id, label: sec.label, text: cur.trim(), order: chunks.length })
      cur = ''
    }
    for (const p of sec.paras.flatMap((p) => splitLong(p, target))) {
      if (cur && cur.length + p.length + 2 > target) push()
      cur = cur ? `${cur}\n\n${p}` : p
    }
    push()
  }
  return chunks
}

/* ------------------------------- BM25 ------------------------------- */

const STOPWORDS = new Set(
  (
    'a an and are as at be but by for from has have he her his i if in into is it its me my no not of on or our ' +
    'she so than that the their them then there these they this to was we were what when where which who why ' +
    'will with you your do does did can could would should about after before over under up down out just'
  ).split(' '),
)

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

export interface Bm25Index {
  chunks: Chunk[]
  tf: Map<string, number>[]
  lengths: number[]
  avgLength: number
  df: Map<string, number>
}

export function buildIndex(chunks: Chunk[]): Bm25Index {
  const tf: Map<string, number>[] = []
  const lengths: number[] = []
  const df = new Map<string, number>()
  for (const c of chunks) {
    const toks = tokenize(`${c.label} ${c.text}`)
    const m = new Map<string, number>()
    for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1)
    for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1)
    tf.push(m)
    lengths.push(toks.length)
  }
  const avgLength = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0
  return { chunks, tf, lengths, avgLength, df }
}

export function search(index: Bm25Index, query: string, k = GROUNDING_PER_QUERY): { chunk: Chunk; score: number }[] {
  const K1 = 1.2
  const B = 0.75
  const N = index.chunks.length
  const terms = [...new Set(tokenize(query))]
  if (!N || !terms.length) return []
  const scored: { chunk: Chunk; score: number }[] = []
  for (let i = 0; i < N; i++) {
    let score = 0
    for (const t of terms) {
      const f = index.tf[i].get(t)
      if (!f) continue
      const n = index.df.get(t) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      score += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * index.lengths[i]) / (index.avgLength || 1)))
    }
    if (score > 0) scored.push({ chunk: index.chunks[i], score })
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, k)
}

/* ----------------------------- selection ---------------------------- */

export function libraryChars(docs: ReferenceDoc[]): number {
  return docs.reduce((n, d) => n + d.text.length, 0)
}

/**
 * Round-robin across queries (each query's best hit first, then each one's
 * second-best, …) so one broad query can't crowd out a specific one, then
 * de-duplicate and fill up to `budget` characters.
 */
export function selectPassages(index: Bm25Index, queries: string[], budget: number): Chunk[] {
  const lists = queries.map((q) => search(index, q, GROUNDING_PER_QUERY).map((r) => r.chunk))
  const picked: Chunk[] = []
  const seen = new Set<Chunk>()
  let used = 0
  for (let rank = 0; rank < GROUNDING_PER_QUERY; rank++) {
    for (const list of lists) {
      const c = list[rank]
      if (!c || seen.has(c)) continue
      seen.add(c)
      const cost = c.label.length + c.text.length + 8
      if (used + cost > budget) continue
      picked.push(c)
      used += cost
    }
  }
  return picked
}

/* ------------------------------ planner ----------------------------- */

/** Compact outline (titles + headings) so the planner knows what the library covers. */
export function tableOfContents(docs: ReferenceDoc[], cap = TOC_CAP): string {
  const lines: string[] = []
  for (const d of docs) {
    lines.push(`- ${d.title.trim() || 'Untitled'}`)
    for (const line of d.text.split('\n')) {
      const h = line.match(HEADING)
      if (h) lines.push(`${'  '.repeat(h[1].length)}- ${h[2].trim()}`)
    }
  }
  const out = lines.join('\n')
  return out.length > cap ? `${out.slice(0, cap)}\n…` : out
}

export function groundingSystemPrompt(directive = ''): string {
  return [
    AGENT_SENTINEL,
    'You are the research assistant for a roleplay. The operator has supplied a',
    'reference library of authoritative facts (outline below). Before the next reply',
    'is written, decide what — if anything — in that library should be looked up so',
    'the writer gets the facts right.',
    '',
    'Look things up when the moment touches on concrete facts the library could',
    'cover: people, places, events, dates, objects, customs, technical details,',
    'lore. Skip it (return no queries) for pure small talk, emotion, or anything the',
    'library plainly does not cover.',
    '',
    `Return ONLY JSON: { "queries": ["...", ...] } with 0–${GROUNDING_MAX_QUERIES} short keyword-style`,
    'search queries (names and distinctive terms, not full sentences). Order them',
    'most important first.',
    directive.trim() ? `\nOPERATOR DIRECTIVE:\n${directive.trim()}` : '',
  ].join('\n')
}

export function groundingUserContent(toc: string, playerMessage: string, recentScene: string): string {
  return [
    'REFERENCE LIBRARY OUTLINE:',
    '"""',
    toc.trim() || '(empty)',
    '"""',
    '',
    'THE STORY SO FAR (most recent last):',
    '"""',
    recentScene.trim().slice(-3000) || '(the scene has just begun)',
    '"""',
    '',
    'THE PLAYER JUST SAID/DID:',
    '"""',
    playerMessage.trim() || '(nothing yet — this is the opening of the scene)',
    '"""',
    '',
    'Return the JSON now.',
  ].join('\n')
}

export function parseGroundingQueries(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return []
  const q = (raw as { queries?: unknown }).queries
  if (!Array.isArray(q)) return []
  const out: string[] = []
  for (const s of q) {
    if (typeof s !== 'string') continue
    const t = s.trim().slice(0, 200)
    if (t && !out.includes(t)) out.push(t)
    if (out.length >= GROUNDING_MAX_QUERIES) break
  }
  return out
}

/* ------------------------------ render ------------------------------ */

/** The whole library as passages, used when it fits the budget outright (no planner call). */
export function wholeLibrary(docs: ReferenceDoc[]): Chunk[] {
  return docs
    .filter((d) => d.text.trim())
    .map((d, i) => ({ docId: d.id, label: d.title.trim() || 'Untitled', text: d.text.trim(), order: i }))
}

export function formatReferenceBlock(passages: Chunk[]): string | null {
  if (!passages.length) return null
  const header = [
    '[Psyche Reference — authoritative facts for this scene, supplied by the operator.',
    'Treat them as true and never contradict them. Weave them in naturally where the',
    'scene calls for it; never recite them verbatim or mention this note.]',
  ].join('\n')
  return [header, ...passages.map((p) => `### ${p.label}\n${p.text}`)].join('\n\n')
}
