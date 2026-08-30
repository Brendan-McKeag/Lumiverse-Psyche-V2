declare const spindle: import('lumiverse-spindle-types').SpindleAPI
type LlmMessage = import('lumiverse-spindle-types').LlmMessageDTO

import { TOOL_SCHEMAS, executeTool } from '@psyche/core/tools'
import { RunState } from '@psyche/core/state'
import { updateSystemPrompt, updateUserContent, AGENT_SENTINEL } from '@psyche/core/prompts'

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

export { AGENT_SENTINEL }
