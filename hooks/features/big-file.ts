// ─────────────────────────────────────────────────────────────────────────────
// Feature 4: Big-file warning
//
// Before Claude reads a file bigger than CONFIG.bigFile.maxFileKB, or runs
// Glob/Grep over a folder holding more than CONFIG.bigFile.maxDirEntries
// files, this asks you first, with the size and a rough token estimate.
//
//   "Read it" / "Search it"  the call goes ahead (and that path isn't asked about again this session)
//   "Skip it" or dismiss     the call is refused, and Claude is told to look
//                            at a smaller part instead
//
// Nobody to ask (claude -p) → a dim line is logged and the call goes ahead.
// A read with `offset` or `limit` (a slice of the file) is never asked about.
// If this check itself fails for any reason, the call goes ahead: the mod
// warns, it doesn't stand in your way.
//
// Event used: tool.call, which fires before a tool runs. Returning
// `{ deny }` without calling next stops it; `next(e)` lets it run.
// ─────────────────────────────────────────────────────────────────────────────
import type { EngineInterface, On } from 'claude-code'

import { CONFIG } from '../config.ts'
import { formatBytes, formatTokens } from '../lib/format.ts'

// Paths you already said yes to this session. A plain variable: a hot reload
// of the mod forgets them, which only means being asked once more.
const approved = new Set<string>()

// Folder sizes already counted, so the same folder isn't walked twice.
const dirCounts = new Map<string, number>()

export function registerBigFile(on: On) {
  if (!CONFIG.features.bigFileWarning) return

  on('tool.call', { tool: ['Read', 'Glob', 'Grep'] }, async ($, e, next) => {
    const cwd = await $.session.cwd()

    if (e.tool === 'Read') {
      if (e.offset !== undefined || e.limit !== undefined) return next(e)
      const path = absolute(cwd, e.file_path)
      if (approved.has(path)) return next(e)

      const stat = await statOrNull($, path)
      if (stat === null || stat.kind !== 'file' || stat.size <= CONFIG.bigFile.maxFileKB * 1024) return next(e)

      const tokens = Math.round(stat.size / CONFIG.bigFile.bytesPerToken)
      const what = `${path} is ${formatBytes(stat.size)}, roughly ${formatTokens(tokens)} tokens`
      const answer = await askUser($, `Claude wants to read a big file: ${what}. Read it?`, 'Read it')
      if (answer === 'yes' || answer === 'nobody') {
        approved.add(path)
        if (answer === 'nobody') $.ui.log(`Big file read: ${what}.`)
        return next(e)
      }
      return {
        deny:
          `The user chose not to read the whole file (${what}). ` +
          `Find the part you need with Grep, then Read it with offset and limit.`,
      }
    }

    if (e.tool === 'Glob' || e.tool === 'Grep') {
      const path = absolute(cwd, e.path ?? cwd)
      if (approved.has(path)) return next(e)

      const stat = await statOrNull($, path)
      if (stat === null || stat.kind !== 'dir') return next(e)

      const limit = CONFIG.bigFile.maxDirEntries
      const count = dirCounts.get(path) ?? (await countFiles($, path, limit))
      dirCounts.set(path, count)
      if (count <= limit) return next(e)

      const what = `${path} holds more than ${limit.toLocaleString('en-US')} files, so the results could be very long`
      const verb = e.tool === 'Glob' ? 'list files in' : 'search'
      const answer = await askUser($, `Claude wants to ${verb} a big folder: ${what}. Go ahead?`, 'Search it')
      if (answer === 'yes' || answer === 'nobody') {
        approved.add(path)
        if (answer === 'nobody') $.ui.log(`Big folder ${e.tool}: ${what}.`)
        return next(e)
      }
      return {
        deny:
          `The user chose not to ${verb} the whole folder (${what}). ` +
          `Narrow it: give a subfolder as \`path\`, or a more specific pattern or glob.`,
      }
    }

    return next(e)
  })
}

// Asks the question with two buttons. Answers 'yes', 'no', or 'nobody' when
// there is no screen to ask on (claude -p, the SDK).
async function askUser($: EngineInterface, question: string, yesLabel: string): Promise<'yes' | 'no' | 'nobody'> {
  if ((await $.session.surfaces()).length === 0) return 'nobody'
  try {
    const picked = await $.ui.ask(question, { header: 'Big read', options: [yesLabel, 'Skip it'] })
    return picked === yesLabel ? 'yes' : 'no'
  } catch {
    return 'no' // dismissed (Esc, or "Chat about this")
  }
}

// Counts the files under `root`, stopping as soon as it passes `limit`.
// Skips CONFIG.bigFile.ignoreDirs, which Grep and Glob mostly skip too.
async function countFiles($: EngineInterface, root: string, limit: number): Promise<number> {
  let files = 0
  let foldersVisited = 0
  const queue = [root]
  while (queue.length > 0 && files <= limit && foldersVisited < 2000) {
    const dir = queue.shift()!
    foldersVisited += 1
    let entries
    try {
      entries = await $.fs.list(dir)
    } catch {
      continue // unreadable folder: skip it
    }
    for (const entry of entries) {
      if (entry.kind === 'dir') {
        if (!CONFIG.bigFile.ignoreDirs.includes(entry.name)) queue.push(dir.replace(/\/$/, '') + '/' + entry.name)
      } else {
        files += 1
      }
    }
  }
  return files
}

async function statOrNull($: EngineInterface, path: string) {
  try {
    return await $.fs.stat(path)
  } catch {
    return null // the path doesn't exist: let the tool report that itself
  }
}

// Turns a path relative to the session's folder into an absolute one.
export function absolute(cwd: string, path: string): string {
  if (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) return path
  return cwd.replace(/\/$/, '') + '/' + path.replace(/^\.\//, '')
}
