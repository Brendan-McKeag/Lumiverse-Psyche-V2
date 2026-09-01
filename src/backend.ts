declare const spindle: import('lumiverse-spindle-types').SpindleAPI
type LlmMessage = import('lumiverse-spindle-types').LlmMessageDTO

import {
  RunState,
  CharacterState,
  emptyRun,
  runPath,
  ensurePrimary,
  backfillEmotions,
  buildDirective,
  ensureInjectionEntry,
  isInjectionEntry,
  describeApproval,
  APPROVAL_MIN,
  APPROVAL_MAX,
} from './run'
import { runPsycheAgent, runOffscreenStage, runDirectorStage, AGENT_SENTINEL, StageTrace } from './agent'
import { EMOTIONS, EMOTION_BY_KEY, describeValue, relaxToward } from '@psyche/core/affect'
import { OFFSCREEN_EVENT_BUDGET } from '@psyche/core/offscreen'

/* ------------------------------------------------------------------ *
 * Psyche (core fork) — backend
 *
 * Per chat: after every reply, update each present character's affect
 * vector and approval of the player. The live state is injected into the
 * next reply through a force-injected, content-overridden world-info entry,
 * so the visible character behaves the way they actually feel. Disabled-at-
 * rest: turn the extension off and nothing is injected.
 * ------------------------------------------------------------------ */

interface Config {
  enabled: boolean
  maxRounds: number
  /** fraction of the pressure gap a present feeling relaxes toward baseline each turn */
  decayRate: number
  directive: string
  agentTimeoutMs: number
  /** connection id the out-of-band engine calls use; '' = same as the prose model */
  agentConnectionId: string
  /** gate for the energy-matched delivery lines + ENERGY preamble (human texture) */
  humanTexture: boolean
  /** run the off-stage character simulation stage each turn */
  offscreenEnabled: boolean
  /** max off-stage events simulated per group per turn (narrative pacing knob) */
  offscreenEventBudget: number
  /**
   * Runs the Director from a pre-generation prompt interceptor — sees the
   * player's actual incoming message and injects fresh reasoning directly
   * into that generation's prompt. Experimental: uses a host hook whose
   * timeout behavior is undocumented, so it fails open (falls back to the
   * unmodified prompt) on any error or timeout, and defaults OFF.
   */
  directorEnabled: boolean
  /** reasoning effort for the Director's call — "ruminate as long as needed" */
  directorReasoningEffort: string
  directorTimeoutMs: number
}

const DEFAULT_CONFIG: Config = {
  enabled: true,
  maxRounds: 8,
  decayRate: 0.12,
  directive: '',
  agentTimeoutMs: 90000,
  agentConnectionId: '',
  humanTexture: true,
  offscreenEnabled: true,
  offscreenEventBudget: OFFSCREEN_EVENT_BUDGET,
  directorEnabled: false,
  directorReasoningEffort: 'max',
  directorTimeoutMs: 240000,
}
const CONFIG_PATH = 'config.json'

let config: Config = { ...DEFAULT_CONFIG }

const chatChar = new Map<string, string>()
const running = new Set<string>()
const observers = new Map<string, ReturnType<typeof spindle.generate.observe>>()

/* ----------------------------- storage ----------------------------- */

async function loadConfig() {
  const stored = await spindle.storage.getJson<Partial<Config>>(CONFIG_PATH, { fallback: {} })
  config = { ...DEFAULT_CONFIG, ...stored }
}
async function saveConfig() {
  await spindle.storage.setJson(CONFIG_PATH, config, { indent: 2 })
}
async function loadRun(chatId: string): Promise<RunState> {
  const run = await spindle.storage.getJson<RunState>(runPath(chatId), { fallback: emptyRun(chatId) })
  run.turnSeq ??= 0
  for (const c of Object.values(run.characters)) backfillEmotions(c)
  return run
}
async function saveRun(run: RunState) {
  run.updatedAt = Date.now()
  await spindle.storage.setJson(runPath(run.chatId), run, { indent: 2 })
}

/* ----------------------------- debug ------------------------------- */
interface DebugBundle {
  stages?: Record<string, StageTrace>
  injection?: { at: number; directive: string }
}
const debugPath = (chatId: string) => `debug/${chatId}.json`
const DBG_REQ_CAP = 24000
const DBG_RES_CAP = 10000

function capText(s: string, n: number): string {
  if (s.length <= n) return s
  const head = Math.floor(n * 0.7)
  return `${s.slice(0, head)}\n\n…[${s.length - n} chars elided]…\n\n${s.slice(-(n - head))}`
}
function capTrace(t: StageTrace): StageTrace {
  return { ...t, request: capText(t.request, DBG_REQ_CAP), response: capText(t.response, DBG_RES_CAP) }
}
async function loadDebug(chatId: string): Promise<DebugBundle> {
  return spindle.storage.getJson<DebugBundle>(debugPath(chatId), { fallback: {} })
}

async function characterForChat(chatId: string, userId?: string): Promise<{ id: string; name: string } | null> {
  const cached = chatChar.get(chatId)
  if (cached) {
    const c = await spindle.characters.get(cached, userId)
    return c ? { id: c.id, name: c.name } : null
  }
  try {
    const chat = await spindle.chats.get(chatId, userId)
    const cid = (chat as { character_id?: string } | null)?.character_id
    if (!cid) return null
    chatChar.set(chatId, cid)
    const c = await spindle.characters.get(cid, userId)
    return c ? { id: c.id, name: c.name } : { id: cid, name: 'the character' }
  } catch {
    return null
  }
}

/* ------------------ connection for out-of-band calls ---------------- *
 * A quiet generation with no connection_id makes the host fall back to the
 * user's DEFAULT-flagged profile (is_default) — NOT the model the chat is
 * using. So when a dropdown is on "Auto" we resolve an explicit id ourselves:
 * last-loaded profile -> default-flagged -> the first profile.
 */

const lastLoadedConn = new Map<string, string>() // user scope -> connection id

spindle.on('CONNECTION_PROFILE_LOADED', (payload, userId) => {
  const id = (payload as { id?: string })?.id
  if (typeof id === 'string' && id) lastLoadedConn.set(userId ?? '', id)
})

async function resolveQuietConnection(configured: string, userId?: string): Promise<string | undefined> {
  if (configured) return configured
  try {
    const list = await spindle.connections.list(userId)
    if (!list.length) return undefined
    const last = lastLoadedConn.get(userId ?? '')
    if (last && list.some((c) => c.id === last)) return last
    const def = list.find((c) => (c as { is_default?: boolean }).is_default)
    return (def ?? list[0]).id
  } catch (err) {
    spindle.log.warn(`[psyche] could not resolve a connection (falling back to host default): ${String(err)}`)
    return undefined
  }
}

/* ------------------------ transcript + card ------------------------ */

const MAX_TRANSCRIPT_CHARS = 120_000

async function buildTranscript(chatId: string, reply: string): Promise<string> {
  const lines: string[] = []
  try {
    const msgs = await spindle.chat.getMessages(chatId)
    for (const m of msgs) {
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      if (!text.trim()) continue
      lines.push(`${m.role === 'user' ? 'PLAYER' : 'CHARACTER'}:\n${text.trim()}`)
    }
  } catch {
    /* ignore */
  }
  const r = reply.trim()
  if (r && !(lines.length && lines[lines.length - 1].includes(r))) lines.push(`CHARACTER:\n${r}`)
  return clampTranscript(lines.join('\n\n').trim())
}

function clampTranscript(t: string): string {
  if (t.length <= MAX_TRANSCRIPT_CHARS) return t
  const head = Math.floor(MAX_TRANSCRIPT_CHARS * 0.4)
  const tail = MAX_TRANSCRIPT_CHARS - head
  return `${t.slice(0, head)}\n\n[… middle of the story elided for length; opening and recent turns shown in full …]\n\n${t.slice(-tail)}`
}

function buildCardContext(char: unknown): string {
  const c = (char ?? {}) as Record<string, unknown>
  const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)
  const fields: [string, unknown, number][] = [
    ['Name', c.name, 200],
    ['Description', c.description, 2000],
    ['Personality', c.personality, 1000],
    ['Scenario', c.scenario, 1000],
    ['Opening', c.first_mes, 1500],
  ]
  return fields
    .filter(([, v]) => typeof v === 'string' && (v as string).trim())
    .map(([k, v, n]) => `${k}: ${cap((v as string).trim(), n)}`)
    .join('\n\n')
}

/* ----------------------- per-turn processing ----------------------- */

async function runAgentForChat(chatId: string, reply: string, userId?: string) {
  if (!config.enabled || !reply.trim()) return
  const char = await characterForChat(chatId, userId)
  if (!char) return

  const dbg: DebugBundle = { stages: {} }
  const stageErrors: { stage: string; error: string }[] = []
  try {
    const run = await loadRun(chatId)
    ensurePrimary(run, char.id, char.name)
    run.turnSeq = (run.turnSeq ?? 0) + 1
    relaxPresent(run, config.decayRate)

    const fullChar = await spindle.characters.get(char.id, userId).catch(() => null)
    const cardContext = buildCardContext(fullChar)
    const agentConn = await resolveQuietConnection(config.agentConnectionId, userId)
    const transcript = await buildTranscript(chatId, reply)

    // ── stage 1: mind update (on-stage characters) ─────────────────────
    let result = { rounds: 0, toolCalls: [] as { tool: string; result: string }[], finalNote: '' }
    try {
      result = await runPsycheAgent(run, transcript, cardContext, {
        maxRounds: config.maxRounds,
        directive: config.directive,
        signal: AbortSignal.timeout(config.agentTimeoutMs),
        userId,
        connectionId: agentConn,
        onTrace: (t) => (dbg.stages!.update = capTrace(t)),
      })
    } catch (err) {
      const m = err instanceof Error && err.name === 'AbortError' ? 'timed out' : String(err)
      result.finalNote = `update failed (${m})`
      stageErrors.push({ stage: 'update', error: m })
      spindle.log.error(`[psyche] update pass failed — ${m}`)
    }

    // ── stage 2: off-stage character simulation ─────────────────────────
    // Reads run.characters AFTER stage 1, since stage 1 may have created,
    // deleted, or moved characters' present/off-scene status.
    let offscreenNote = ''
    if (config.offscreenEnabled) {
      try {
        const off = await runOffscreenStage(run, {
          eventBudget: config.offscreenEventBudget,
          directive: config.directive,
          signal: AbortSignal.timeout(config.agentTimeoutMs),
          userId,
          connectionId: agentConn,
          onTrace: (t) => (dbg.stages!.offscreen = capTrace(t)),
        })
        offscreenNote = off ? `${off.groups} group(s), ${off.events} event(s), ${off.touched} touched` : 'no one off-stage'
      } catch (err) {
        const m = err instanceof Error && err.name === 'AbortError' ? 'timed out' : String(err)
        offscreenNote = `offscreen failed (${m})`
        stageErrors.push({ stage: 'offscreen', error: m })
        spindle.log.error(`[psyche] offscreen pass failed — ${m}`)
      }
    }

    await saveRun(run)
    await refreshInjection(chatId, userId)

    dbg.injection = {
      at: Date.now(),
      directive: capText(
        buildDirective(run, { humanTexture: config.humanTexture }) ?? '(nothing injected — no one present)',
        DBG_REQ_CAP,
      ),
    }
    try {
      const prev = await loadDebug(chatId)
      await spindle.storage.setJson(debugPath(chatId), {
        ...prev,
        ...dbg,
        stages: { ...prev.stages, ...dbg.stages },
      })
    } catch (err) {
      spindle.log.warn(`[psyche] could not save debug traces: ${String(err)}`)
    }

    spindle.sendToFrontend({
      type: 'state_changed',
      chatId,
      characterCount: Object.keys(run.characters).length,
      rounds: result.rounds,
      edits: result.toolCalls.length,
      note: result.finalNote,
      offscreenNote,
      stageErrors,
    })

    spindle.log.info(
      `[psyche] ${char.name}: ${result.toolCalls.length} edits / ${result.rounds} rounds` +
        (offscreenNote ? ` · offstage: ${offscreenNote}` : ''),
    )
  } catch (err) {
    const msg = err instanceof Error && err.name === 'AbortError' ? 'engine timed out' : String(err)
    spindle.log.error(`[psyche] engine failed: ${msg}`)
  }
}

/** Relax every present character's feelings toward baseline before the mind update reasons. */
function relaxPresent(run: RunState, rate: number) {
  for (const c of Object.values(run.characters)) {
    if (!c.present) continue
    for (const def of EMOTIONS) {
      const e = c.emotions[def.key]
      if (!e) continue
      e.value = relaxToward(def, e.value, e.baseline, rate)
    }
  }
}

/* ----------------------- run scheduler ----------------------------- *
 * The engine pass takes longer than a single reply, so turns can pile up.
 * Never drop them: while a chat's pass is running, remember only the LATEST
 * turn; when the pass finishes, run once more on it.
 * ------------------------------------------------------------------ */
const pending = new Map<string, { reply: string; userId?: string }>()

function emitEngine(chatId: string, state: 'running' | 'idle', stage?: string, userId?: string) {
  spindle.sendToFrontend({ type: 'engine', chatId, state, stage, queued: pending.has(chatId) }, userId)
}

function scheduleAgent(chatId: string, reply: string, userId?: string) {
  if (!config.enabled || !reply.trim()) return
  if (running.has(chatId)) {
    pending.set(chatId, { reply, userId })
    spindle.log.info(`[psyche] engine busy for chat ${chatId}; queued latest turn`)
    emitEngine(chatId, 'running', 'queued another turn', userId)
    return
  }
  void runAgentLoop(chatId, reply, userId)
}

async function runAgentLoop(chatId: string, reply: string, userId?: string) {
  running.add(chatId)
  emitEngine(chatId, 'running', 'starting', userId)
  try {
    await runAgentForChat(chatId, reply, userId)
    while (pending.has(chatId)) {
      const next = pending.get(chatId)!
      pending.delete(chatId)
      await runAgentForChat(chatId, next.reply, next.userId)
    }
  } finally {
    running.delete(chatId)
    emitEngine(chatId, 'idle', undefined, userId)
  }
}

/* --------------------------- generation hooks ---------------------- */

function ensureObserver(chatId: string) {
  if (!observers.has(chatId)) observers.set(chatId, spindle.generate.observe(chatId))
  return observers.get(chatId)!
}
function dropObserver(chatId: string) {
  const o = observers.get(chatId)
  if (o) {
    o.dispose()
    observers.delete(chatId)
  }
}

const genType = new Map<string, string>()

/** Best-effort fallback for directorInterceptor if its `context` param turns
 * out not to carry chatId/userId the way the sibling world-info interceptor's
 * does — GENERATION_STARTED reliably carries both and fires right around the
 * same generation, so a very-recent one is a reasonable stand-in. */
let lastGenerationStart: { chatId: string; userId?: string; at: number } | null = null

spindle.on('GENERATION_STARTED', (payload, userId) => {
  if (!config.enabled || !payload.chatId) return
  genType.set(payload.chatId, payload.generationType ?? 'normal')
  if ((payload.generationType ?? 'normal') === 'normal') {
    lastGenerationStart = { chatId: payload.chatId, userId, at: Date.now() }
  }
  if (payload.generationType === 'quiet' || payload.generationType === 'impersonate') return
  ensureObserver(payload.chatId)
})

spindle.on('GENERATION_ENDED', async (payload, userId) => {
  if (!config.enabled || !payload.chatId) return
  const chatId = payload.chatId
  genType.delete(chatId)
  if (payload.error) return dropObserver(chatId)
  const gt = payload.generationType ?? 'normal'
  const obs = observers.get(chatId)
  const reply = (payload.content ?? obs?.content ?? '').trim()
  dropObserver(chatId)

  // Only advance the mind on a genuinely NEW assistant turn. Swipes, regens,
  // continues and impersonations re-roll an existing turn.
  if (gt === 'normal') scheduleAgent(chatId, reply, userId)
})

spindle.on('GENERATION_STOPPED', async (payload, userId) => {
  if (!config.enabled || !payload.chatId) return
  const obs = observers.get(payload.chatId)
  const reply = (payload.content ?? obs?.content ?? '').trim()
  dropObserver(payload.chatId)
  const gt = genType.get(payload.chatId) ?? 'normal'
  genType.delete(payload.chatId)
  if (gt === 'normal') scheduleAgent(payload.chatId, reply, userId)
})

/* ----------------------- live state injection ---------------------- */

let loggedInject = false

async function refreshInjection(chatId: string, userId?: string) {
  try {
    const char = await characterForChat(chatId, userId)
    if (!char) return
    const entryId = await ensureInjectionEntry(char.id, char.name, userId)
    if (!entryId) return
    const run = await loadRun(chatId).catch(() => null)
    const directive = (run && buildDirective(run, { humanTexture: config.humanTexture })) || '(no active emotional state)'
    await spindle.world_books.entries.update(entryId, { content: directive }, userId)
    if (!loggedInject) {
      loggedInject = true
      spindle.log.info(`[psyche] wrote emotional state (${directive.length} chars) to injection entry for chat ${chatId}`)
    }
  } catch (err) {
    spindle.log.error(`[psyche] refreshInjection failed: ${String(err)}`)
  }
}

async function injectionInterceptor(ctx: import('lumiverse-spindle-types').WorldInfoInterceptorCtxDTO) {
  if (config.enabled) return
  const ids = ctx.entries.filter((e) => isInjectionEntry(e.extensions)).map((e) => e.id)
  return ids.length ? { disabled: ids } : undefined
}

function registerInjectionInterceptor() {
  try {
    spindle.registerWorldInfoInterceptor(injectionInterceptor, 50)
    spindle.log.info('[psyche] injection interceptor registered')
  } catch (err) {
    spindle.log.warn(`[psyche] interceptor registration failed: ${String(err)}`)
  }
}

/* ----------------------------- the Director ------------------------- *
 * The one Psyche stage that runs BEFORE a reply is written, via a
 * pre-generation prompt interceptor: it sees the fully-assembled messages
 * about to go to the LLM — including the player's actual incoming message —
 * and can splice its own fresh reasoning directly into that prompt.
 *
 * This hook is genuinely new territory: unlike registerWorldInfoInterceptor
 * (used above, with a documented 10s budget), registerInterceptor's timeout
 * behavior is undocumented. Every path here fails OPEN — any guard miss,
 * error, or timeout returns the messages unmodified, so a broken or slow
 * Director can never cost the player a reply. Off by default; the operator
 * turns it on deliberately.
 * ------------------------------------------------------------------ */

function textOfMessage(m: LlmMessage): string {
  if (typeof m.content === 'string') return m.content
  if (Array.isArray(m.content)) {
    return (m.content as unknown[])
      .map((p) => {
        if (typeof p === 'string') return p
        const o = p as { text?: string }
        return typeof o?.text === 'string' ? o.text : ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

/** The player's just-submitted message, plus everything before it as a transcript tail. */
function extractPlayerTurn(messages: LlmMessage[]): { playerMessage: string; recentScene: string } {
  let lastUserIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIndex = i
      break
    }
  }
  const playerMessage = lastUserIndex >= 0 ? textOfMessage(messages[lastUserIndex]) : ''
  const historyEnd = lastUserIndex < 0 ? messages.length : lastUserIndex
  const scene = messages
    .slice(0, historyEnd)
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role === 'user' ? 'PLAYER' : 'CHARACTER'}:\n${textOfMessage(m).trim()}`)
    .filter((l) => l.trim() !== 'PLAYER:' && l.trim() !== 'CHARACTER:')
    .join('\n\n')
  return { playerMessage, recentScene: scene.slice(-6000) }
}

function safeStringify(v: unknown, max = 500): string {
  try {
    const s = JSON.stringify(v)
    return s === undefined ? String(v) : s.length > max ? `${s.slice(0, max)}…` : s
  } catch {
    return String(v)
  }
}

async function directorInterceptor(messages: LlmMessage[], context: unknown): Promise<LlmMessage[]> {
  // Never intercept Psyche's own internal quiet calls (mind-update, off-stage,
  // even the Director's own call) — every prompt Psyche builds itself opens
  // with this sentinel. This guard holds regardless of whether the host
  // actually routes spindle.generate.quiet() through this hook at all. Kept
  // silent (no log) since it fires on every one of Psyche's own calls.
  const first = messages[0]
  if (first?.role === 'system' && typeof first.content === 'string' && first.content.includes(AGENT_SENTINEL)) {
    return messages
  }

  // Everything past this point is diagnostic-logged on purpose: this hook is
  // new territory (registerInterceptor, never used by Psyche before), so
  // every bail-out reason needs to be visible in the extension log rather
  // than silently doing nothing, or "it's not working" is undebuggable.
  spindle.log.info(
    `[psyche] director interceptor fired — ${messages.length} message(s), enabled=${config.enabled}, ` +
      `directorEnabled=${config.directorEnabled}, context=${safeStringify(context)}`,
  )
  if (!config.enabled || !config.directorEnabled) return messages

  // `context`'s real shape isn't in the type declarations; the sibling
  // world-info interceptor's context carries chatId/characterId/userId, so
  // assume the same shape defensively and no-op if it doesn't hold.
  const ctx = (context ?? {}) as { chatId?: string; characterId?: string; userId?: string; generationType?: string }
  let chatId = typeof ctx.chatId === 'string' ? ctx.chatId : undefined
  let userId = ctx.userId
  if (!chatId) {
    // context didn't carry it as expected — fall back to the most recent
    // GENERATION_STARTED, if it's fresh enough to plausibly be this same call.
    const fallback = lastGenerationStart && Date.now() - lastGenerationStart.at < 15000 ? lastGenerationStart : null
    if (fallback) {
      chatId = fallback.chatId
      userId = fallback.userId
      spindle.log.info(`[psyche] director: context had no chatId, used GENERATION_STARTED fallback (chat ${chatId})`)
    } else {
      spindle.log.warn(`[psyche] director: no usable chatId in interceptor context and no recent GENERATION_STARTED to fall back on — skipping. context=${safeStringify(context)}`)
      return messages
    }
  }
  if (ctx.generationType && ctx.generationType !== 'normal') {
    spindle.log.info(`[psyche] director: skipping non-normal generation (${ctx.generationType})`)
    return messages
  }
  try {
    const run = await loadRun(chatId)
    if (!Object.values(run.characters).some((c) => c.present)) {
      spindle.log.info(`[psyche] director: no present characters for chat ${chatId} — skipping`)
      return messages
    }

    const char = await characterForChat(chatId, userId)
    const fullChar = char ? await spindle.characters.get(char.id, userId).catch(() => null) : null
    const cardContext = buildCardContext(fullChar)
    const { playerMessage, recentScene } = extractPlayerTurn(messages)
    const connectionId = await resolveQuietConnection(config.agentConnectionId, userId)

    let trace: StageTrace | undefined
    const result = await runDirectorStage(run, {
      playerMessage,
      recentScene,
      cardContext,
      reasoningEffort: config.directorReasoningEffort,
      directive: config.directive,
      signal: AbortSignal.timeout(config.directorTimeoutMs),
      userId,
      connectionId,
      onTrace: (t) => (trace = capTrace(t)),
    })

    await saveRun(run) // persist even if no block resulted — update_canon/note_knowledge may still have fired
    if (trace) {
      try {
        const prev = await loadDebug(chatId)
        await spindle.storage.setJson(debugPath(chatId), { ...prev, stages: { ...(prev.stages ?? {}), director: trace } })
      } catch {
        /* debug trace is best-effort */
      }
    }
    void sendState(chatId, userId, 'Director ruminated.') // fire-and-forget; must not delay this generation

    if (!result?.block) {
      spindle.log.info(`[psyche] director: ran but produced no note this turn (chat ${chatId})`)
      return messages
    }
    const insertAt = (() => {
      for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return i
      return messages.length
    })()
    const spliced = messages.slice()
    spliced.splice(insertAt, 0, { role: 'system', content: result.block })
    spindle.log.info(`[psyche] director: injected a note for ${Object.keys(result.notes).length} character(s) (chat ${chatId})`)
    return spliced
  } catch (err) {
    const m = err instanceof Error && err.name === 'AbortError' ? 'timed out' : String(err)
    spindle.log.error(`[psyche] director interceptor failed — ${m}`)
    return messages
  }
}

function registerDirectorInterceptor() {
  try {
    spindle.registerInterceptor(directorInterceptor, 50)
    spindle.log.info('[psyche] director interceptor registered')
  } catch (err) {
    spindle.log.warn(`[psyche] director interceptor registration failed: ${String(err)}`)
  }
}

/* --------------------------- frontend bridge ----------------------- */

async function activeChatId(payloadChatId?: string, userId?: string): Promise<string | null> {
  if (payloadChatId) return payloadChatId
  try {
    const active = await spindle.chats.getActive(userId)
    return active?.id ?? null
  } catch {
    return null
  }
}

function snapshotRun(run: RunState) {
  const characters = Object.values(run.characters).map((c) => ({
    id: c.id,
    name: c.name,
    isPrimary: c.isPrimary,
    present: c.present,
    approval: c.approval ?? 0,
    approvalLabel: describeApproval(c.approval ?? 0).label,
    offscreenSummary: c.offscreenSummary ?? '',
    knowledge: c.knowledge ?? [],
    directorNote: c.directorNote ?? '',
    canon: c.canon ?? '',
    emotions: EMOTIONS.map((def) => {
      const e = c.emotions[def.key] ?? { value: 0, baseline: 0 }
      return {
        key: def.key,
        label: def.label,
        kind: def.kind,
        value: e.value,
        baseline: e.baseline,
        descriptor: describeValue(def, e.value).label,
      }
    }),
  }))
  return { chatId: run.chatId, characters }
}

function findChar(run: RunState, id: string): CharacterState | null {
  return run.characters[id] ?? Object.values(run.characters).find((c) => c.id === id) ?? null
}

function clampForKind(key: string, value: number): number {
  const def = EMOTION_BY_KEY[key]
  if (!def) return value
  return def.kind === 'bipolar' ? Math.max(-1, Math.min(1, value)) : Math.max(0, Math.min(1, value))
}

async function sendState(chatId: string | null, userId?: string, note?: string) {
  if (!chatId) {
    spindle.sendToFrontend({ type: 'state', snapshot: null, note }, userId)
    return
  }
  await refreshInjection(chatId, userId)
  const run = await loadRun(chatId)
  const char = await characterForChat(chatId, userId)
  spindle.sendToFrontend({ type: 'state', characterName: char?.name ?? null, snapshot: snapshotRun(run), note }, userId)
}

spindle.onFrontendMessage(async (payload: any, userId) => {
 try {
  switch (payload?.type) {
    case 'get_config':
      spindle.sendToFrontend({ type: 'config', config }, userId)
      break

    case 'set_config':
      config = {
        enabled: Boolean(payload.config?.enabled ?? config.enabled),
        maxRounds: clampInt(payload.config?.maxRounds ?? config.maxRounds, 1, 20),
        decayRate: clampFloat(payload.config?.decayRate ?? config.decayRate, 0, 1),
        directive: String(payload.config?.directive ?? config.directive),
        agentTimeoutMs: clampInt(payload.config?.agentTimeoutMs ?? config.agentTimeoutMs, 10000, 300000),
        agentConnectionId:
          payload.config?.agentConnectionId === undefined
            ? config.agentConnectionId
            : String(payload.config.agentConnectionId ?? ''),
        humanTexture: Boolean(payload.config?.humanTexture ?? config.humanTexture),
        offscreenEnabled: Boolean(payload.config?.offscreenEnabled ?? config.offscreenEnabled),
        offscreenEventBudget: clampInt(payload.config?.offscreenEventBudget ?? config.offscreenEventBudget, 1, 8),
        directorEnabled: Boolean(payload.config?.directorEnabled ?? config.directorEnabled),
        directorReasoningEffort: String(payload.config?.directorReasoningEffort ?? config.directorReasoningEffort),
        directorTimeoutMs: clampInt(payload.config?.directorTimeoutMs ?? config.directorTimeoutMs, 30000, 600000),
      }
      await saveConfig()
      spindle.sendToFrontend({ type: 'config', config }, userId)
      break

    case 'get_connections': {
      let connections: { id: string; name: string; provider: string; model: string }[] = []
      let error: string | undefined
      try {
        if (!spindle.connections?.list) throw new Error('host does not expose the connections API')
        const list = await spindle.connections.list(userId)
        connections = list.map((c) => ({ id: c.id, name: c.name, provider: c.provider, model: c.model }))
      } catch (err) {
        error = String(err instanceof Error ? err.message : err)
        spindle.log.warn(`[psyche] could not list connections: ${error}`)
      }
      spindle.sendToFrontend({ type: 'connections', connections, error }, userId)
      break
    }

    case 'get_state': {
      const chatId = await activeChatId(payload.chatId, userId)
      await sendState(chatId, userId)
      break
    }

    case 'get_debug': {
      const chatId = await activeChatId(payload.chatId, userId)
      const debug = chatId ? await loadDebug(chatId) : {}
      spindle.sendToFrontend({ type: 'debug', debug }, userId)
      break
    }

    case 'get_engine': {
      const chatId = await activeChatId(payload.chatId, userId)
      spindle.sendToFrontend({ type: 'engine', chatId, state: chatId && running.has(chatId) ? 'running' : 'idle' }, userId)
      break
    }

    case 'reset_run': {
      const chatId = await activeChatId(payload.chatId, userId)
      if (!chatId) break
      await saveRun(emptyRun(chatId))
      await sendState(chatId, userId, 'Run state cleared.')
      break
    }

    case 'set_present': {
      const chatId = await activeChatId(payload.chatId, userId)
      if (!chatId) break
      const run = await loadRun(chatId)
      const c = findChar(run, payload.characterId)
      if (c) {
        c.present = Boolean(payload.present)
        await saveRun(run)
      }
      await sendState(chatId, userId)
      break
    }

    case 'set_emotion': {
      const chatId = await activeChatId(payload.chatId, userId)
      if (!chatId) break
      const run = await loadRun(chatId)
      const c = findChar(run, payload.characterId)
      const key = String(payload.emotion ?? '')
      if (c && EMOTION_BY_KEY[key] && typeof payload.value === 'number') {
        backfillEmotions(c)
        c.emotions[key].value = clampForKind(key, payload.value)
        await saveRun(run)
      }
      await sendState(chatId, userId)
      break
    }

    case 'set_approval': {
      const chatId = await activeChatId(payload.chatId, userId)
      if (!chatId) break
      const run = await loadRun(chatId)
      const c = findChar(run, payload.characterId)
      if (c && typeof payload.value === 'number' && Number.isFinite(payload.value)) {
        c.approval = Math.max(APPROVAL_MIN, Math.min(APPROVAL_MAX, Math.round(payload.value)))
        await saveRun(run)
      }
      await sendState(chatId, userId)
      break
    }

    case 'save_canon': {
      const chatId = await activeChatId(payload.chatId, userId)
      if (!chatId) break
      const run = await loadRun(chatId)
      const c = findChar(run, payload.characterId)
      if (c && typeof payload.canon === 'string') {
        c.canon = payload.canon
        await saveRun(run)
      }
      await sendState(chatId, userId)
      break
    }
  }
 } catch (err) {
  spindle.log.error(`[psyche] frontend handler error: ${String(err)}`)
  spindle.sendToFrontend(
    { type: 'state', snapshot: null, note: `Action failed — check Psyche's permissions are granted. (${String(err)})` },
    userId,
  )
 }
})

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}
function clampFloat(v: unknown, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

/* ------------------------------- boot ------------------------------ */
registerInjectionInterceptor()
registerDirectorInterceptor()

;(async () => {
  await loadConfig()
  spindle.log.info('[psyche] loaded')
})()
