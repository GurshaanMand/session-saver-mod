// The small helpers every feature uses.
import { expect, test } from 'claude-code/testing'

import { formatMinutes, formatTokens, formatUsd, looksLikeCode, shortModelName, wordCount } from '../hooks/lib/format.ts'

test('formatting', () => {
  expect(formatTokens(999)).toBe('999')
  expect(formatTokens(1234)).toBe('1.2K')
  expect(formatTokens(152_000)).toBe('152K')
  expect(formatTokens(1_500_000)).toBe('1.5M')
  expect(formatUsd(0.0004)).toBe('<$0.001')
  expect(formatUsd(0.0123)).toBe('$0.012')
  expect(formatUsd(1.5)).toBe('$1.50')
  expect(formatMinutes(14 * 60_000)).toBe('14 min')
  expect(formatMinutes(90 * 60_000)).toBe('1 h 30 min')
})

test('model names', () => {
  expect(shortModelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(shortModelName('claude-haiku-5-5-20261001')).toBe('Haiku 5.5')
  expect(shortModelName('claude-opus-4-20250514')).toBe('Opus 4')
  expect(shortModelName('sonnet')).toBe('Sonnet')
  expect(shortModelName('Opus 5.5')).toBe('Opus 5.5')
  expect(shortModelName('mystery')).toBe('mystery')
})

test('short-message checks', () => {
  expect(wordCount('  what does   this do? ')).toBe(4)
  expect(looksLikeCode('why is `x` null')).toBe(true)
  expect(looksLikeCode('const a = 1;')).toBe(true)
  expect(looksLikeCode('thanks, looks good')).toBe(false)
})
