// ─────────────────────────────────────────────────────────────────────────────
// Feature 5: Repeat-read detector
//
// Counts how often Claude reads each file. When the same file is read for
// the 3rd time (CONFIG.repeatRead.threshold) and it hasn't changed since the
// last read, a dim line names the file and the count. Every read after that
// says the new count too. A file that changed (different size or modified
// time) starts counting again from 1, because reading it again is useful.
//
// A read of a slice (`offset`/`limit`) counts separately from a whole-file
// read and from other slices: reading a long file in parts is fine.
//
// Event used: tool.call on Read. The hook lets the read run first
// (`await next(e)`) and only counts reads that succeeded.
// ─────────────────────────────────────────────────────────────────────────────
import type { On } from 'claude-code'

import { CONFIG } from '../config.ts'
import { absolute } from './big-file.ts'

type Seen = { count: number; size: number; mtimeMs: number }

// One entry per file (and slice). A plain variable: a hot reload of the mod
// starts the counts over.
const reads = new Map<string, Seen>()

// Records one read and answers the new count. Exported for the tests.
export function recordRead(key: string, size: number, mtimeMs: number): number {
  const before = reads.get(key)
  const isUnchanged = before !== undefined && before.size === size && before.mtimeMs === mtimeMs
  const count = isUnchanged ? before.count + 1 : 1
  reads.set(key, { count, size, mtimeMs })
  return count
}

export function registerRepeatRead(on: On) {
  if (!CONFIG.features.repeatReadDetector) return

  on('tool.call', { tool: 'Read' }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny !== undefined || result.isError) return result

    const path = absolute(await $.session.cwd(), e.file_path)
    let stat
    try {
      stat = await $.fs.stat(path)
    } catch {
      return result // gone already: nothing to compare against
    }

    const slice = e.offset !== undefined || e.limit !== undefined ? ` (lines from ${e.offset ?? 1}, ${e.limit ?? 'all'})` : ''
    const count = recordRead(path + slice, stat.size, stat.mtimeMs)
    if (count >= CONFIG.repeatRead.threshold) {
      $.ui.log(`${path}${slice} has been read ${count} times and hasn't changed since the last read.`)
    }
    return result
  })
}
