// Feature 7: hold a message after a long break when the context is big.
import { expect, test } from 'claude-code/testing'

import { idleText } from '../hooks/features/idle-reminder.ts'
import { answerAsk, captureLogs, fakeSession } from './stubs.ts'

const COMPOSER = { kind: 'composer' } as const
const MIN = 60_000

// Claude finishing a response (the Stop event), then the test's own answer to it.
async function claudeResponds($: any) {
  await $.classic.Stop({ stop_hook_active: false })
}

// What reached the model: the bottom of prompt.submit records each text.
function sentPrompts(on: any): string[] {
  const sent: string[] = []
  on('prompt.submit', ($: any, e: any) => {
    sent.push(e.text)
    return { text: e.text }
  })
  on('classic.Stop', () => ({}))
  return sent
}

test('the reminder text has idle time, context size, cost and the cache note', () => {
  expect(idleText(14 * MIN, 152_000, 0.76)).toBe(
    'Idle for 14 min with 152K tokens of context. The prompt cache has likely expired, ' +
      'so this message re-sends the full context at full price (about $0.760).',
  )
})

test('no reminder after a short break or with a small context', async ($, on) => {
  const clock = fakeSession(on, { contextTokens: 50_000 })
  const sent = sentPrompts(on)
  const asked = answerAsk(on, 'Continue')

  await claudeResponds($)
  await clock.advance(3 * MIN)
  await $.prompt.submit({ text: 'next step', origin: COMPOSER, wait: false })
  await claudeResponds($)
  await clock.advance(30 * MIN) // long break, but only 50K tokens
  await $.prompt.submit({ text: 'and then?', origin: COMPOSER, wait: false })
  expect(asked).toEqual([])
  expect(sent).toEqual(['next step', 'and then?'])
})

test('after 10+ idle minutes with a big context: asks, and "Continue" sends', async ($, on) => {
  const clock = fakeSession(on, { contextTokens: 150_000 })
  const sent = sentPrompts(on)
  const asked = answerAsk(on, 'Continue')

  await claudeResponds($)
  await clock.advance(12 * MIN)
  const result = await $.prompt.submit({ text: 'go on', origin: COMPOSER, wait: false })
  expect(result.drop).toBeUndefined()
  expect(sent).toEqual(['go on'])
  expect(asked[0]).toContain('Idle for 12 min with 150K tokens of context')
  expect(asked[0]).toContain('cache has likely expired')
})

test('"Compact first" holds the message, puts it back in the box and runs /compact', async ($, on) => {
  const clock = fakeSession(on, { contextTokens: 150_000 })
  const sent = sentPrompts(on)
  answerAsk(on, 'Compact first')
  const logs = captureLogs(on)
  const ran: string[] = []
  on('command.run', { command: 'compact' }, ($, e) => {
    ran.push(e.command)
    return { text: 'compacted' }
  })
  const filled: string[] = []
  on('prompt.fill', ($, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })

  await claudeResponds($)
  await clock.advance(20 * MIN)
  const result = await $.prompt.submit({ text: 'go on', origin: COMPOSER, wait: false })
  await clock.advance(200) // the timer that starts /compact
  expect(result.drop).toContain('started /compact')
  expect(sent).toEqual([])
  expect(filled).toEqual(['go on'])
  expect(logs).toEqual([])
  expect(ran).toEqual(['compact'])
})

test('dismissing holds the message; sending again goes straight through', async ($, on) => {
  const clock = fakeSession(on, { contextTokens: 150_000 })
  const sent = sentPrompts(on)
  const asked = answerAsk(on, null)
  on('prompt.fill', () => ({ isFilled: true }))

  await claudeResponds($)
  await clock.advance(15 * MIN)
  const first = await $.prompt.submit({ text: 'go on', origin: COMPOSER, wait: false })
  expect(first.drop).toContain('Send again to continue')
  expect(sent).toEqual([])

  const second = await $.prompt.submit({ text: 'go on', origin: COMPOSER, wait: false })
  expect(second.drop).toBeUndefined()
  expect(sent).toEqual(['go on'])
  expect(asked).toHaveLength(1)
})

test('with nobody to ask (claude -p) it logs the reminder and sends', async ($, on) => {
  const clock = fakeSession(on, { contextTokens: 150_000, surfaces: [] })
  const sent = sentPrompts(on)
  const logs = captureLogs(on)

  await claudeResponds($)
  await clock.advance(15 * MIN)
  await $.prompt.submit({ text: 'go on', origin: COMPOSER, wait: false })
  expect(sent).toEqual(['go on'])
  expect(logs[0]).toContain('Idle for 15 min')
})
