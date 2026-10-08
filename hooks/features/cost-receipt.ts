// ─────────────────────────────────────────────────────────────────────────────
// Feature 6: Cost-per-task receipt
//
// When Claude finishes answering a prompt, a dim line sums up what that
// prompt used: every request the main conversation made AND every request
// its subagents made, split into the four kinds of token the API bills
// separately, each priced from the table in ../pricing.ts:
//
//   receipt (estimate) · Opus 5.5 + Sonnet 5.5 · in 2.1K $0.008 · out 1.4K $0.028 · cache read 48K $0.010 · cache write 6.2K $0.031 · total ≈ $0.077
//
// Events used:
//   turn.step      fires for each request (main and subagents); its result carries `usage`
//   turn.complete  fires when a turn ends; without `agentId` it's the main conversation's
//
// A subagent left running in the background after Claude answers is
// counted in the next receipt instead.
// ─────────────────────────────────────────────────────────────────────────────
import type { On } from 'claude-code'

import { CONFIG } from '../config.ts'
import { formatTokens, formatUsd, shortModelName } from '../lib/format.ts'
import { priceFor, type Usage } from '../pricing.ts'

type Kind = 'input' | 'output' | 'cacheRead' | 'cacheWrite'
const KINDS: Kind[] = ['input', 'output', 'cacheRead', 'cacheWrite']
const LABELS: Record<Kind, string> = { input: 'in', output: 'out', cacheRead: 'cache read', cacheWrite: 'cache write' }

// Adds up requests until the receipt is printed. Kept free of `$` so the
// tests can drive it directly.
export class Tally {
  tokens: Record<Kind, number> = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  usd: Record<Kind, number> = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  models: string[] = [] // in the order first seen
  unpriced: string[] = [] // models with no row in the price table
  requests = 0

  add(model: string, usage: Usage) {
    this.requests += 1
    if (!this.models.includes(model)) this.models.push(model)
    const counts: Record<Kind, number> = {
      input: usage.input_tokens,
      output: usage.output_tokens,
      cacheRead: usage.cache_read_input_tokens,
      cacheWrite: usage.cache_creation_input_tokens,
    }
    const price = priceFor(model, usage)
    if (!price && !this.unpriced.includes(model)) this.unpriced.push(model)
    const perMillion: Record<Kind, number> = price
      ? {
          input: price.input,
          output: price.output,
          cacheRead: price.cacheRead,
          cacheWrite: CONFIG.cost.cacheWriteTtl === '1h' ? price.cacheWrite1h : price.cacheWrite5m,
        }
      : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
    for (const kind of KINDS) {
      this.tokens[kind] += counts[kind]
      this.usd[kind] += (counts[kind] * perMillion[kind]) / 1_000_000
    }
  }

  totalUsd(): number {
    return KINDS.reduce((sum, kind) => sum + this.usd[kind], 0)
  }

  // The one-line receipt.
  line(): string {
    const models = this.models.map(shortModelName).join(' + ')
    const parts = KINDS.map(kind => `${LABELS[kind]} ${formatTokens(this.tokens[kind])} ${formatUsd(this.usd[kind])}`)
    const unknown = this.unpriced.length > 0 ? ` (no price for ${this.unpriced.join(', ')}; add it to pricing.ts)` : ''
    return `receipt (estimate) · ${models} · ${parts.join(' · ')} · total ≈ ${formatUsd(this.totalUsd())}${unknown}`
  }
}

// The tally for the prompt being answered now. A hot reload starts it over.
let tally = new Tally()

export function registerCostReceipt(on: On) {
  if (!CONFIG.features.costReceipt) return

  // Every request, main conversation and subagents alike.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (result.usage) tally.add(result.usage.model, result.usage)
    return result
  })

  // The end of a turn. Only the main conversation's (no agentId) prints.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || tally.requests === 0) return result
    const done = tally
    tally = new Tally()
    if (done.totalUsd() >= CONFIG.cost.hideBelowUsd) $.ui.log(done.line())
    return result
  })
}
