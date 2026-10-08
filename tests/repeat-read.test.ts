// Feature 5: notice when the same unchanged file is read 3+ times.
import { expect, test } from 'claude-code/testing'

import { captureLogs, fakeSession } from './stubs.ts'

// A file whose size/mtime the test can change between reads.
function changeableFile(on: any, path: string) {
  const file = { size: 100, mtimeMs: 1 }
  on('fs.stat', ($: any, e: any) =>
    e.path === path ? { value: { kind: 'file', size: file.size, mtimeMs: file.mtimeMs, isLink: false } } : { deny: 'ENOENT' },
  )
  return file
}

test('the 3rd read of an unchanged file logs a notice, the 4th updates the count', async ($, on) => {
  fakeSession(on)
  changeableFile(on, '/work/a.ts')
  const logs = captureLogs(on)
  on('tool.call', { tool: 'Read' }, () => ({ result: 'ok' }))

  await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
  await $.tool.call({ tool: 'Read', file_path: 'a.ts' }) // same file, relative path
  expect(logs).toEqual([])
  await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
  expect(logs).toEqual(["/work/a.ts has been read 3 times and hasn't changed since the last read."])
  await $.tool.call({ tool: 'Read', file_path: '/work/a.ts' })
  expect(logs[1]).toContain('read 4 times')
})

test('a file that changed between reads starts counting again', async ($, on) => {
  fakeSession(on)
  const file = changeableFile(on, '/work/b.ts')
  const logs = captureLogs(on)
  on('tool.call', { tool: 'Read' }, () => ({ result: 'ok' }))

  await $.tool.call({ tool: 'Read', file_path: '/work/b.ts' })
  await $.tool.call({ tool: 'Read', file_path: '/work/b.ts' })
  file.mtimeMs = 2 // edited
  await $.tool.call({ tool: 'Read', file_path: '/work/b.ts' })
  await $.tool.call({ tool: 'Read', file_path: '/work/b.ts' })
  expect(logs).toEqual([])
})

test('different slices of a file count separately; failed reads do not count', async ($, on) => {
  fakeSession(on)
  changeableFile(on, '/work/c.ts')
  const logs = captureLogs(on)
  on('tool.call', { tool: 'Read' }, ($: any, e: any) => (e.limit === 1 ? { deny: 'no' } : { result: 'ok' }))

  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Read', file_path: '/work/c.ts', offset: i * 100, limit: 100 })
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Read', file_path: '/work/c.ts', limit: 1 })
  expect(logs).toEqual([])
})
