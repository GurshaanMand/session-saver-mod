// ─────────────────────────────────────────────────────────────────────────────
// Feature 2: Fresh-session nudge
//
// Watches how full the context window is. The first time it passes 60% a
// yellow notice above the prompt suggests /compact; the first time it passes
// 85% a red notice suggests asking for a summary and starting fresh. Each
// shows once. If the context drops back under 60% (after /compact or
// /clear), both are armed again.
//
// Events used:
//   session.measure  Claude Code measures the session after each turn; `e.context.percent`
//   ui.render        draws the band above the prompt (component 'AbovePrompt')
// ─────────────────────────────────────────────────────────────────────────────
import type { EngineInterface, On } from 'claude-code'
import { atom, read, update } from 'claude-code'

import { CONFIG } from '../config.ts'
import { INITIAL_CONTEXT } from '../state.ts'
import type { Notice } from '../../types'

// This mod's memory, kept in `$.state` (see types/index.d.ts).
const contextAtom = atom({ plugin: 'session-saver-mod', key: 'context' } as const, INITIAL_CONTEXT)
const noticeAtom = atom({ plugin: 'session-saver-mod', key: 'notice' } as const, null as Notice | null)

export function warnText(percent: number): string {
  return `Context ${percent}% full. Run /compact to summarize older messages so each request sends less.`
}

export function dangerText(percent: number): string {
  return (
    `Context ${percent}% full. Ask Claude for a short summary of where things stand, ` +
    `then /clear and paste it in to start fresh.`
  )
}

export function registerContextNudge(on: On) {
  if (!CONFIG.features.contextNudge) return

  on('session.measure', async ($, e, next) => {
    const percent = e.context.percent
    if (!e.changed.includes('context') || percent === undefined) return next(e)

    const seen = await read($, contextAtom)
    const { warnPercent, dangerPercent } = CONFIG.context

    if (percent < warnPercent) {
      // Back under the first line (compacted or cleared): arm both notices again.
      if (seen.warned || seen.dangered) {
        await update($, contextAtom, () => ({ warned: false, dangered: false }))
        await update($, noticeAtom, () => null)
      }
    } else if (percent >= dangerPercent && !seen.dangered) {
      await update($, contextAtom, () => ({ warned: true, dangered: true }))
      await show($, 'error', dangerText(percent))
    } else if (percent < dangerPercent && !seen.warned) {
      await update($, contextAtom, s => ({ ...s, warned: true }))
      await show($, 'warning', warnText(percent))
    }
    return next(e)
  })

  // The band above the prompt. It reads the notice from `$.state`, so writing
  // a new notice redraws it with no extra call.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const notice = await read($, noticeAtom)
    if (notice === null || e.props.hasSurvey) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" gap={1}>
        <Text color={notice.level} wrap="wrap">
          {notice.level === 'error' ? '● ' : '▲ '}
          {notice.text}
        </Text>
        <Button key="dismiss-context-notice" label="Dismiss" onPress={() => update($, noticeAtom, () => null)} />
      </Box>
    )
  })
}

// Shows a notice in the band, or as a transcript line where nothing draws
// bands (claude -p, the VS Code extension's chat panel).
async function show($: EngineInterface, level: 'warning' | 'error', text: string) {
  await update($, noticeAtom, () => ({ level, text }))
  const surfaces = await $.session.surfaces()
  if (!surfaces.some(s => s === 'terminal' || s === 'desktop')) $.ui.log(text)
}
