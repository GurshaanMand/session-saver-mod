// Feature 4: confirm before reading a huge file or searching a huge folder.
import { expect, test } from 'claude-code/testing'

import { answerAsk, captureLogs, fakeFiles, fakeSession } from './stubs.ts'

const KB = 1024

// Lets every tool call that reaches the bottom "run" and answer ok.
function toolsRun(on: any) {
  on('tool.call', { tool: ['Read', 'Glob', 'Grep'] }, () => ({ result: 'ok' }))
}

test('a small file is read without a question', async ($, on) => {
  fakeSession(on)
  fakeFiles(on, { '/work/small.ts': { size: 10 * KB } })
  const asked = answerAsk(on, 'Read it')
  toolsRun(on)
  const result = await $.tool.call({ tool: 'Read', file_path: '/work/small.ts' })
  expect(result.deny).toBeUndefined()
  expect(asked).toEqual([])
})

test('a big file asks first, with size and token estimate; "Read it" reads it', async ($, on) => {
  fakeSession(on)
  fakeFiles(on, { '/work/big.json': { size: 400 * KB } })
  const asked = answerAsk(on, 'Read it')
  toolsRun(on)

  const result = await $.tool.call({ tool: 'Read', file_path: 'big.json' })
  expect(result.deny).toBeUndefined()
  expect(asked).toHaveLength(1)
  expect(asked[0]).toContain('/work/big.json is 400.0 KB, roughly 102K tokens')

  // Approved once: not asked again this session.
  await $.tool.call({ tool: 'Read', file_path: '/work/big.json' })
  expect(asked).toHaveLength(1)
})

test('"Skip it" refuses the read and tells Claude to look at a smaller part', async ($, on) => {
  fakeSession(on)
  fakeFiles(on, { '/work/big.log': { size: 2048 * KB } })
  answerAsk(on, 'Skip it')
  toolsRun(on)
  const result = await $.tool.call({ tool: 'Read', file_path: '/work/big.log' })
  expect(result.deny).toContain('offset and limit')
})

test('dismissing the question also refuses', async ($, on) => {
  fakeSession(on)
  fakeFiles(on, { '/work/big.log': { size: 2048 * KB } })
  answerAsk(on, null)
  toolsRun(on)
  const result = await $.tool.call({ tool: 'Read', file_path: '/work/big.log' })
  expect(result.deny).toContain('chose not to read')
})

test('a slice of a big file (offset/limit) is never asked about', async ($, on) => {
  fakeSession(on)
  fakeFiles(on, { '/work/big.log': { size: 2048 * KB } })
  const asked = answerAsk(on, 'Skip it')
  toolsRun(on)
  const result = await $.tool.call({ tool: 'Read', file_path: '/work/big.log', offset: 100, limit: 50 })
  expect(result.deny).toBeUndefined()
  expect(asked).toEqual([])
})

test('with nobody to ask (claude -p) it logs a line and reads', async ($, on) => {
  fakeSession(on, { surfaces: [] })
  fakeFiles(on, { '/work/big.log': { size: 2048 * KB } })
  const logs = captureLogs(on)
  toolsRun(on)
  const result = await $.tool.call({ tool: 'Read', file_path: '/work/big.log' })
  expect(result.deny).toBeUndefined()
  expect(logs[0]).toContain('Big file read: /work/big.log is 2.0 MB')
})

test('Grep over a folder with too many files asks first', async ($, on) => {
  fakeSession(on)
  // /work/huge holds 6,000 files across two subfolders (and a skipped node_modules).
  const names = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}.ts`)
  fakeFiles(on, {}, {
    '/work/huge': ['a', 'b', 'node_modules'],
    '/work/huge/a': names(3000, 'a'),
    '/work/huge/b': names(3000, 'b'),
    '/work/huge/node_modules': names(9000, 'n'),
    '/work/small': names(10, 's'),
  })
  const asked = answerAsk(on, 'Skip it')
  toolsRun(on)

  const small = await $.tool.call({ tool: 'Grep', pattern: 'x', path: '/work/small' })
  expect(small.deny).toBeUndefined()
  expect(asked).toEqual([])

  const huge = await $.tool.call({ tool: 'Grep', pattern: 'x', path: '/work/huge' })
  expect(huge.deny).toContain('Narrow it')
  expect(asked[0]).toContain('search a big folder: /work/huge holds more than 5,000 files')
})
