// Feature 6: the per-prompt receipt, and the price math behind it.
import { expect, test } from 'claude-code/testing'

import { Tally } from '../hooks/features/cost-receipt.ts'
import { costOf, findPriceRow } from '../hooks/pricing.ts'
import { captureLogs, fakeModel, fakeSession } from './stubs.ts'

// One model request, read to its end.
async function step($: any, model: string, agentId?: string) {
  const stream = $.turn.step({ turnId: 't1', index: 0, model, messageCount: 1, agentId })
  for await (const _ of stream) {
    // nothing streams from the fake model
  }
}

test('each kind of token is priced separately (Opus 5.5)', () => {
  const usd = costOf(
    'claude-opus-5-5',
    { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 },
    '5m',
  )
  // $4 input + $20 output + $0.20 cache read + $5 cache write
  expect(usd).toBe(29.2)
})

test('dated and display model names find their row; unknown ones find none', () => {
  expect(findPriceRow('claude-opus-5-5-20260901')?.label).toBe('Opus 5.5')
  expect(findPriceRow('claude-sonnet-4-6')?.label).toBe('Sonnet 4.x')
  expect(findPriceRow('claude-fable-5-1')?.label).toBe('Fable 5.1')
  expect(findPriceRow('gpt-9')).toBeUndefined()
})

test('Haiku 5.5 charges its higher price for prompts over 100K tokens', () => {
  const small = costOf('claude-haiku-5-5', { input_tokens: 100_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, '5m')
  const big = costOf('claude-haiku-5-5', { input_tokens: 200_000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, '5m')
  expect(small).toBe(0.01) // 100K × $0.10/M
  expect(big).toBe(0.1) // 200K × $0.50/M
})

test('the receipt line names models, splits tokens, and says it is an estimate', () => {
  const tally = new Tally()
  tally.add('claude-opus-5-5', { input_tokens: 2000, output_tokens: 1000, cache_read_input_tokens: 50_000, cache_creation_input_tokens: 4000 })
  tally.add('claude-sonnet-5-5', { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })
  expect(tally.line()).toBe(
    'receipt (estimate) · Opus 5.5 + Sonnet 5.5 · in 3K $0.010 · out 1.5K $0.025 · cache read 50K $0.010 · cache write 4K $0.020 · total ≈ $0.065',
  )
})

test('a model missing from the table is named in the receipt', () => {
  const tally = new Tally()
  tally.add('mystery-model', { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })
  expect(tally.line()).toContain('no price for mystery-model')
})

test('after a turn, one receipt counts the main requests and the subagent requests', async ($, on) => {
  fakeSession(on)
  const logs = captureLogs(on)
  fakeModel(on, { input: 1000, output: 500, cacheRead: 10_000, cacheWrite: 2000 })
  on('turn.complete', ($, e) => ({ text: e.answer }))

  await step($, 'claude-opus-5-5')
  await step($, 'claude-sonnet-5-5', 'agent-1') // a subagent's request
  await step($, 'claude-opus-5-5')
  await $.turn.complete({ turnId: 'a1', agentId: 'agent-1', answer: '', durationMs: 1, isAborted: false, reason: 'answer' })
  expect(logs).toEqual([]) // a subagent finishing prints nothing

  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 1, isAborted: false, reason: 'answer' })
  expect(logs).toHaveLength(1)
  expect(logs[0]).toStartWith('receipt (estimate) · Opus 5.5 + Sonnet 5.5 · in 3K')

  // The next prompt starts a fresh tally.
  await step($, 'claude-opus-5-5')
  await $.turn.complete({ turnId: 't2', answer: 'done', durationMs: 1, isAborted: false, reason: 'answer' })
  expect(logs[1]).toContain('in 1K')
})
