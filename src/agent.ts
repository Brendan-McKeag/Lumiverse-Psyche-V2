declare const spindle: import('lumiverse-spindle-types').SpindleAPI
type LlmMessage = import('lumiverse-spindle-types').LlmMessageDTO

import { TOOL_SCHEMAS, executeTool } from '@psyche/core/tools'
import { RunState } from '@psyche/core/state'
import { updateSystemPrompt, updateUserContent, extractJson, AGENT_SENTINEL } from '@psyche/core/prompts'
import { describeApproval } from '@psyche/core/approval'
import {
  castingSystemPrompt,
  castingUserContent,
  parseCasting,
  salientFeelings,
  unitSystemPrompt,
  unitUserContent,
  parseUnitResult,
  mergeOffscreenResults,
  applyOffscreenResult,
  type OffscreenResult,
} from '@psyche/core/offscreen'
import { resistanceSystemPrompt, resistanceUserContent, parseResistance, applyResistanceResult } from '@psyche/core/resistance'

/* ------------------------------------------------------------------ *
 * Psyche (core fork) — the mind engine (plugin transport)
 *
 * The one stage this fork keeps: after every reply, update each present
 * character's affect vector and approval (via a tool-calling loop against
 * the whole story so far). Runs quietly out-of-band through the host's
 * spindle.generate.quiet on the user's own connection profiles.
 * ------------------------------------------------------------------ */

/** A captured record of one LLM step: the prompt sent and the raw response. */
export interface StageTrace {
  at: number
  request: string
  response: string
  meta?: string
}
export type TraceFn = (t: StageTrace) => void

function blockToText(b: unknown): string {
  if (typeof b === 'string') return b
  const o = b as { type?: string; name?: string; input?: unknown; content?: unknown }
  if (o?.type === 'tool_use') return `«tool_use ${o.name}»\n${JSON.stringify(o.input ?? {}, null, 2)}`
  if (o?.type === 'tool_result')
    return `«tool_result»\n${typeof o.content === 'string' ? o.content : JSON.stringify(o.content)}`
  return JSON.stringify(b)
}

function serializeMessages(messages: LlmMessage[]): string {
  return messages
    .map((m) => {
      const content = Array.isArray(m.content) ? m.content.map(blockToText).join('\n') : String(m.content ?? '')
      return `========== [${m.role}] ==========\n${content}`
    })
    .join('\n\n')
}

export interface AgentResult {
  rounds: number
  toolCalls: { tool: string; result: string }[]
  finalNote: string
}

export async function runPsycheAgent(
  run: RunState,
  transcript: string,
  cardContext: string,
  opts: {
    maxRounds: number
    directive: string
    signal?: AbortSignal
    userId?: string
    connectionId?: string
    onTrace?: TraceFn
  },
): Promise<AgentResult> {
  const messages: LlmMessage[] = [
    { role: 'system', content: updateSystemPrompt(opts.directive) },
    { role: 'user', content: updateUserContent(run, transcript, cardContext) },
  ]

  const toolCalls: { tool: string; result: string }[] = []
  let rounds = 0
  let finalNote = ''

  for (; rounds < opts.maxRounds; rounds++) {
    const res = (await spindle.generate.quiet({
      type: 'quiet',
      messages,
      tools: TOOL_SCHEMAS,
      parameters: { temperature: 0.6 },
      reasoning: { source: 'off' },
      signal: opts.signal,
      userId: opts.userId,
      ...(opts.connectionId ? { connection_id: opts.connectionId } : {}),
    })) as {
      content?: string
      tool_calls?: { name: string; args: Record<string, unknown>; call_id: string }[]
    }

    const calls = res.tool_calls ?? []
    if (calls.length === 0) {
      finalNote = (res.content ?? '').trim()
      break
    }

    messages.push({
      role: 'assistant',
      content: calls.map((c) => ({
        type: 'tool_use' as const,
        id: c.call_id,
        name: c.name,
        input: c.args,
      })),
    })

    const resultParts = []
    for (const c of calls) {
      let result: string
      try {
        result = await executeTool(run, c.name, c.args)
      } catch (err) {
        result = `Error in ${c.name}: ${String(err)}`
      }
      toolCalls.push({ tool: c.name, result })
      resultParts.push({ type: 'tool_result' as const, tool_use_id: c.call_id, content: result })
    }
    messages.push({ role: 'user', content: resultParts })
  }

  opts.onTrace?.({
    at: Date.now(),
    request: serializeMessages(messages),
    response:
      `final note: ${finalNote || '(none)'}\n\ntool calls (${toolCalls.length}):\n` +
      toolCalls.map((t, i) => `${i + 1}. ${t.tool} -> ${t.result}`).join('\n'),
    meta: `${rounds} rounds · connection: ${opts.connectionId || 'prose default'}`,
  })

  return { rounds, toolCalls, finalNote }
}

/* --------------------- off-stage character simulation ----------------- *
 * Two phases: a cheap "casting" call decides who acts solo vs. who shares a
 * scene with whom; then one call PER GROUP (run in parallel), each given the
 * full undiluted context for just its own members, actually writes what
 * happened. Every call's request/response is accumulated and serialized into
 * ONE combined trace, matching how the mind-update stage already serializes
 * a multi-round tool loop into a single capture.
 * ------------------------------------------------------------------ */

interface CallLog {
  label: string
  request: string
  response: string
}

async function quietJson(
  system: string,
  user: string,
  opts: { forceNoReasoning: boolean; signal?: AbortSignal; userId?: string; connectionId?: string },
): Promise<{ content: string; log: CallLog }> {
  const messages: LlmMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
  const res = (await spindle.generate.quiet({
    type: 'quiet',
    messages,
    parameters: { temperature: 0.8 },
    // Casting is mechanical allocation — force reasoning off for speed. The
    // per-unit calls are where the real judgment happens, so their reasoning
    // is left to the connection's own configured default, not forced off.
    ...(opts.forceNoReasoning ? { reasoning: { source: 'off' as const } } : {}),
    signal: opts.signal,
    userId: opts.userId,
    ...(opts.connectionId ? { connection_id: opts.connectionId } : {}),
  })) as { content?: string }
  const content = res.content ?? ''
  return { content, log: { label: '', request: serializeMessages(messages), response: content } }
}

export async function runOffscreenStage(
  run: RunState,
  opts: {
    eventBudget: number
    directive?: string
    signal?: AbortSignal
    userId?: string
    connectionId?: string
    onTrace?: TraceFn
  },
): Promise<{ events: number; touched: number; groups: number } | null> {
  const offStage = Object.values(run.characters).filter((c) => !c.present)
  if (!offStage.length) return null
  const onStageNames = Object.values(run.characters)
    .filter((c) => c.present)
    .map((c) => c.name)

  const logs: CallLog[] = []

  // ── phase 1: casting ──────────────────────────────────────────────
  const roster = offStage.map((c) => ({
    id: c.id,
    name: c.name,
    oneLineState: `${describeApproval(c.approval ?? 0).label} approval; feeling ${salientFeelings(c)}`,
  }))
  const castingCall = await quietJson(castingSystemPrompt(opts.directive), castingUserContent(roster), {
    forceNoReasoning: true,
    signal: opts.signal,
    userId: opts.userId,
    connectionId: opts.connectionId,
  })
  logs.push({ ...castingCall.log, label: 'casting' })
  const casting = parseCasting(extractJson(castingCall.content), offStage.map((c) => c.id))

  // ── phase 2: one call per group, in parallel ────────────────────────
  const unitResults = await Promise.all(
    casting.groups.map(async (g): Promise<OffscreenResult | null> => {
      const members = g.characterIds.map((id) => run.characters[id]).filter((c): c is NonNullable<typeof c> => Boolean(c))
      if (!members.length) return null
      try {
        const call = await quietJson(
          unitSystemPrompt(opts.eventBudget, opts.directive),
          unitUserContent(members.map((c) => ({ c, feelings: salientFeelings(c) })), g.steer, onStageNames),
          { forceNoReasoning: false, signal: opts.signal, userId: opts.userId, connectionId: opts.connectionId },
        )
        logs.push({ ...call.log, label: `unit:${g.characterIds.join('+')}` })
        return parseUnitResult(extractJson(call.content), g.characterIds, opts.eventBudget)
      } catch (err) {
        logs.push({ label: `unit:${g.characterIds.join('+')}`, request: '(failed before response)', response: `Error: ${String(err)}` })
        return null
      }
    }),
  )

  const merged = mergeOffscreenResults(unitResults.filter((r): r is OffscreenResult => r !== null))
  const { touched, events } = applyOffscreenResult(run, merged, run.turnSeq)

  opts.onTrace?.({
    at: Date.now(),
    request: logs.map((l) => `########## ${l.label} — REQUEST ##########\n${l.request}`).join('\n\n'),
    response: logs.map((l) => `########## ${l.label} — RESPONSE ##########\n${l.response}`).join('\n\n'),
    meta: `${casting.groups.length} group(s) · ${events} event(s) · ${touched.size} touched · connection: ${opts.connectionId || 'prose default'}`,
  })

  return { events, touched: touched.size, groups: casting.groups.length }
}

/* --------------------------- resistance stage -------------------------- *
 * Fresh every turn, on-stage characters only: does the player's current
 * steering conflict with who this character has shown themselves to be so
 * far? No stored goals/persona are read or written — see resistance.ts.
 * ------------------------------------------------------------------ */

export async function runResistanceStage(
  run: RunState,
  opts: {
    recentScene: string
    cardContext: string
    directive?: string
    signal?: AbortSignal
    userId?: string
    connectionId?: string
    onTrace?: TraceFn
  },
): Promise<{ touched: number } | null> {
  const present = Object.values(run.characters).filter((c) => c.present)
  if (!present.length) return null

  const call = await quietJson(
    resistanceSystemPrompt(opts.directive),
    resistanceUserContent(present, opts.recentScene, opts.cardContext),
    {
      forceNoReasoning: false,
      signal: opts.signal,
      userId: opts.userId,
      connectionId: opts.connectionId,
    },
  )
  const notes = parseResistance(extractJson(call.content), present.map((c) => c.id))
  applyResistanceResult(present, notes)

  opts.onTrace?.({
    at: Date.now(),
    request: call.log.request,
    response: call.log.response,
    meta: `${Object.keys(notes).length}/${present.length} holding a line · connection: ${opts.connectionId || 'prose default'}`,
  })

  return { touched: Object.keys(notes).length }
}

export { AGENT_SENTINEL }
