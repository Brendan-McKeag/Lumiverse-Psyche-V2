declare const spindle: import('lumiverse-spindle-types').SpindleAPI
type LlmMessage = import('lumiverse-spindle-types').LlmMessageDTO

import {
  type Judge,
  type Question,
  type Decision,
  llmJudgeSystemPrompt,
  llmJudgeUserContent,
  parseLlmJudgeOutput,
  jevRequestBody,
  parseJevResponse,
  jevErrorMessage,
} from '@psyche/core/decisions'
import { extractJson } from '@psyche/core/prompts'

/* ------------------------------------------------------------------ *
 * Psyche (core fork) — judge transports
 *
 * Two ways to get typed decisions, behind one interface:
 *
 *   • LlmJudge — the user's own connection profile via spindle.generate.quiet,
 *     reasoning forced off, asked for probabilities as JSON. No new
 *     dependency, works everywhere Psyche already works. Its probabilities
 *     are self-reported, so treat them as ordinal, not calibrated.
 *
 *   • JevJudge — the Jev decision-model API over HTTP, through whichever
 *     front door the operator keys: OpenRouter, NanoGPT, or TypeSafe
 *     directly. Real probabilities and sub-second latency, at the cost of
 *     sending scene text to that provider. Opt-in.
 *
 * Both record every call for the debug tab. Neither throws past
 * classify(): a failure returns an empty answer set and the stage treats
 * that as "no decision this turn", exactly like today.
 * ------------------------------------------------------------------ */

export interface JudgeCallLog {
  label: string
  request: string
  response: string
}

export type JudgeBackend = 'llm' | 'jev'

export interface JudgeOpts {
  backend: JudgeBackend
  /** resolved decisions endpoint (see resolveDecisionProvider) */
  jevEndpoint: string
  jevModel: string
  jevApiKey: string
  userId?: string
  connectionId?: string
  onCall?: (log: JudgeCallLog) => void
}

export function makeJudge(opts: JudgeOpts): Judge {
  if (opts.backend === 'jev' && opts.jevApiKey.trim() && opts.jevEndpoint.trim()) return jevJudge(opts)
  return llmJudge(opts)
}

/* ------------------------------ LLM ---------------------------------- */

export function llmJudge(opts: JudgeOpts): Judge {
  return {
    async classify(state: string, questions: Record<string, Question>, signal?: AbortSignal) {
      const messages: LlmMessage[] = [
        { role: 'system', content: llmJudgeSystemPrompt() },
        { role: 'user', content: llmJudgeUserContent(state, questions) },
      ]
      const req = messages.map((m) => `[${m.role}]\n${m.content as string}`).join('\n\n')
      try {
        const res = (await spindle.generate.quiet({
          type: 'quiet',
          messages,
          parameters: { temperature: 0 },
          reasoning: { source: 'off' },
          signal,
          userId: opts.userId,
          ...(opts.connectionId ? { connection_id: opts.connectionId } : {}),
        })) as { content?: string }
        const content = res.content ?? ''
        opts.onCall?.({ label: 'llm', request: req, response: content })
        return parseLlmJudgeOutput(extractJson(content), questions)
      } catch (err) {
        opts.onCall?.({ label: 'llm', request: req, response: `Error: ${String(err)}` })
        return {}
      }
    },
  }
}

/* ------------------------------ Jev ---------------------------------- */

export function jevJudge(opts: JudgeOpts): Judge {
  return {
    async classify(state: string, questions: Record<string, Question>, signal?: AbortSignal) {
      const body = jevRequestBody(state, questions, opts.jevModel)
      const req = `POST ${opts.jevEndpoint}\n${JSON.stringify(body, null, 2)}`
      try {
        const res = await fetch(opts.jevEndpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${opts.jevApiKey.trim()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        })
        const text = await res.text()
        let json: unknown = null
        try {
          json = JSON.parse(text)
        } catch {
          /* non-JSON body; surfaced below */
        }
        const err = !res.ok ? jevErrorMessage(json) ?? `HTTP ${res.status}` : null
        opts.onCall?.({ label: `jev ${res.status}`, request: req, response: err ? `Error: ${err}\n\n${text}` : text })
        if (err || json === null) return {}
        return parseJevResponse(json, questions)
      } catch (err) {
        opts.onCall?.({ label: 'jev', request: req, response: `Error: ${String(err)}` })
        return {}
      }
    },
  }
}

export type { Decision }
