// Feature 3: subagents with no model of their own run on Sonnet.
import { expect, test } from 'claude-code/testing'

import { captureLogs, fakeSession, typeCommand } from './stubs.ts'

// What an Agent tool call looks like when it reaches agent.spawn.
function spawnInput(over: Record<string, unknown> = {}) {
  return {
    tool_use_id: 'tu1',
    prompt: 'Find where the logger is configured',
    description: 'Find logger config',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
    ...over,
  } as any
}

// Claude Code's own agent.spawn answer: the model the subagent will run on.
function engineAnswers(on: any) {
  on('agent.spawn', ($: any, e: any) => ({ model: e.model ?? 'inherit' }))
}

test('no model given on Opus → Sonnet, with a dim line', async ($, on) => {
  fakeSession(on)
  engineAnswers(on)
  const logs = captureLogs(on)

  const result = await $.agent.spawn(spawnInput())
  expect(result.model).toBe('sonnet')
  expect(logs).toEqual(["Subagent 'Find logger config' running on Sonnet (session default is Opus 5.5)."])
})

test('an explicit model is respected', async ($, on) => {
  fakeSession(on)
  engineAnswers(on)
  const logs = captureLogs(on)
  const result = await $.agent.spawn(spawnInput({ model: 'opus' }))
  expect(result.model).toBe('opus')
  expect(logs).toEqual([])
})

test('forks, skipped agent types and non-Opus sessions are left alone', async ($, on) => {
  fakeSession(on)
  engineAnswers(on)
  expect((await $.agent.spawn(spawnInput({ fork: true }))).model).toBe('inherit')
  expect((await $.agent.spawn(spawnInput({ subagentType: 'claude-code-guide' }))).model).toBe('inherit')
  expect((await $.agent.spawn(spawnInput({ parentModel: 'claude-sonnet-5-5' }))).model).toBe('inherit')
})

test('with /cheap on, the subagent follows the cheap model', async ($, on) => {
  fakeSession(on)
  engineAnswers(on)
  await typeCommand($, 'cheap', 'haiku')
  expect((await $.agent.spawn(spawnInput())).model).toBe('claude-haiku-5-5')
})
