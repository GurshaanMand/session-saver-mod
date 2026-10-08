// Test helpers: they answer, in Claude Code's place, the calls the mod makes
// (`$.session.model()`, `$.ui.log(...)`, `$.ui.ask(...)`, ...), so each test
// sets up exactly the session it needs. In a test, hooks registered with the
// test's own `on` sit beneath the mod, where Claude Code would be.
import type { On } from 'claude-code'
import { mock } from 'claude-code/testing'

export type FakeSession = {
  model?: string
  contextTokens?: number
  contextPercent?: number
  surfaces?: Array<'terminal' | 'desktop'>
  cwd?: string
}

// Answers the session questions the mod asks, and returns a clock the test
// moves by hand (`clock.advance(ms)`), starting at 1,000,000 ms.
export function fakeSession(on: On, s: FakeSession = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  on('session.model', () => ({ value: s.model ?? 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: s.cwd ?? '/work' }))
  on('session.surfaces', () => ({ value: s.surfaces ?? ['terminal'] }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { tokens: s.contextTokens, percent: s.contextPercent, window: 200_000 },
      rateLimits: [],
    },
  }))
  on('ui.status', () => ({ value: undefined }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  return clock
}

// Collects every dim transcript line the mod writes with `$.ui.log`.
export function captureLogs(on: On): string[] {
  const lines: string[] = []
  on('ui.log', ($, e) => {
    lines.push(e.text)
    return { value: undefined }
  })
  return lines
}

// Answers `$.ui.ask` (an AskUserQuestion tool call) with `label`, or
// dismisses it when `label` is null. Returns the questions that were asked.
export function answerAsk(on: On, label: string | null): string[] {
  const asked: string[] = []
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const question = e.questions[0]?.question ?? ''
    asked.push(question)
    if (label === null) return { deny: 'The user dismissed the question.' }
    return { result: { questions: e.questions, answers: { [question]: label } } }
  })
  return asked
}

// Fake file system: `$.fs.stat` and `$.fs.list` answer from this table.
export type FakeFile = { size: number; mtimeMs?: number }
export function fakeFiles(on: On, files: Record<string, FakeFile>, dirs: Record<string, string[]> = {}) {
  on('fs.stat', ($, e) => {
    const f = files[e.path]
    if (f) return { value: { kind: 'file' as const, size: f.size, mtimeMs: f.mtimeMs ?? 1, isLink: false } }
    if (dirs[e.path]) return { value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false } }
    return { deny: 'ENOENT' }
  })
  on('fs.list', ($, e) => {
    const names = dirs[e.path ?? ''] ?? []
    return {
      value: names.map(name => {
        const full = e.path + '/' + name
        const isDir = dirs[full] !== undefined
        return { name, kind: isDir ? ('dir' as const) : ('file' as const), size: 1, mtimeMs: 1, isLink: false }
      }),
    }
  })
}

// A model request that answers at once with this usage, for `turn.step`.
export type FakeUsage = { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
export function fakeModel(on: On, usage: FakeUsage = {}, seen: string[] = []) {
  on('turn.step', async function* ($, e) {
    seen.push(e.model)
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'ok',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: {
        model: e.model,
        input_tokens: usage.input ?? 0,
        output_tokens: usage.output ?? 0,
        cache_read_input_tokens: usage.cacheRead ?? 0,
        cache_creation_input_tokens: usage.cacheWrite ?? 0,
      },
    }
  })
  return seen
}

// Runs a slash command the way you typing `/name args` at the prompt does.
export function typeCommand($: any, command: string, args = '') {
  return $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
}
