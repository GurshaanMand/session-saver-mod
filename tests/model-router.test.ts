// Feature 1: /cheap, /smart, and the short-message tip.
import { expect, test } from 'claude-code/testing'

import { captureLogs, fakeModel, fakeSession, typeCommand } from './stubs.ts'

const COMPOSER = { kind: 'composer' } as const

// Sends one request through `turn.step` and reads the stream to its end.
async function step($: any, model: string, agentId?: string) {
  const stream = $.turn.step({ turnId: 't1', index: 0, model, messageCount: 1, agentId })
  for await (const _ of stream) {
    // nothing streams from the fake model
  }
  return stream.result
}

test('/cheap sends main-conversation requests to Haiku, /smart switches back', async ($, on) => {
  fakeSession(on, { model: 'claude-opus-5-5', contextTokens: 1000 })
  const sent = fakeModel(on)

  const cheap = await typeCommand($, 'cheap', '')
  expect(cheap.text).toContain('Haiku 5.5')
  expect(cheap.text).toContain('was Opus 5.5')

  await step($, 'claude-opus-5-5')
  expect(sent).toEqual(['claude-haiku-5-5'])

  const smart = await typeCommand($, 'smart', '')
  expect(smart.text).toBe('Back on Opus 5.5.')

  await step($, 'claude-opus-5-5')
  expect(sent).toEqual(['claude-haiku-5-5', 'claude-opus-5-5'])
})

test('/cheap sonnet picks Sonnet; a subagent request is left alone', async ($, on) => {
  fakeSession(on)
  const sent = fakeModel(on)

  await typeCommand($, 'cheap', 'sonnet')
  await step($, 'claude-opus-5-5', 'agent-1')
  await step($, 'claude-opus-5-5')
  expect(sent).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5'])
})

test('/cheap with an unknown model says how to use it', async ($, on) => {
  fakeSession(on)
  const answer = await typeCommand($, 'cheap', 'gpt')
  expect(answer.text).toContain('/cheap haiku or /cheap sonnet')
})

test('/cheap warns that a big context is re-sent once without cache', async ($, on) => {
  fakeSession(on, { contextTokens: 150_000 })
  const answer = await typeCommand($, 'cheap', 'haiku')
  expect(answer.text).toContain('150K-token context')
})

test('/smart with /cheap off says so', async ($, on) => {
  fakeSession(on)
  const answer = await typeCommand($, 'smart', '')
  expect(answer.text).toContain('/cheap is not on')
})

test('a short plain message on Opus gets the tip', async ($, on) => {
  fakeSession(on, { model: 'claude-opus-5-5' })
  const logs = captureLogs(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))

  await $.prompt.submit({ text: 'what does this do?', origin: COMPOSER, wait: false })
  expect(logs).toEqual(['Short message on Opus. /cheap to switch.'])
})

test('no tip for long messages, code, files, slash commands, or non-Opus models', async ($, on) => {
  fakeSession(on, { model: 'claude-opus-5-5' })
  const logs = captureLogs(on)
  on('prompt.submit', ($, e) => ({ text: e.text }))

  const long = 'please look through the whole project and tell me where the configuration for the logger is loaded'
  await $.prompt.submit({ text: long, origin: COMPOSER, wait: false })
  await $.prompt.submit({ text: 'fix `foo()` please', origin: COMPOSER, wait: false })
  await $.prompt.submit({ text: 'explain @src/app.ts', origin: COMPOSER, wait: false })
  await $.prompt.submit({ text: '/help', origin: COMPOSER, wait: false })
  expect(logs).toEqual([])

  await typeCommand($, 'cheap', '')
  await $.prompt.submit({ text: 'thanks!', origin: COMPOSER, wait: false })
  expect(logs).toEqual([])
})
