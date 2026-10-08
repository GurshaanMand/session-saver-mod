// ─────────────────────────────────────────────────────────────────────────────
// Feature 7: Idle session reminder
//
// The prompt cache keeps your conversation cheap to re-send, but it expires
// after a few idle minutes. If more than CONFIG.idle.idleMinutes have passed
// since Claude's last response, and the context is over
// CONFIG.idle.minContextTokens, your next message is held and you're asked:
//
//   Continue          send it anyway (one keypress: 1)
//   Compact first     your message goes back in the prompt box and /compact runs
//   Start fresh       your message goes back in the prompt box; type /clear, then send it
//
// If you dismiss the question (Esc), the message is held and you're told to
// send it again: sending again within CONFIG.idle.resendGraceMinutes goes
// straight through.
//
// Events used:
//   classic.Stop    Claude finished responding: remember the time
//   prompt.submit   a message is about to be sent: hold it, or let it through
// ─────────────────────────────────────────────────────────────────────────────
import type { On } from 'claude-code'
import { atom, read, update } from 'claude-code'

import { CONFIG } from '../config.ts'
import { formatMinutes, formatTokens, formatUsd } from '../lib/format.ts'
import { recacheCost } from '../pricing.ts'
import { INITIAL_IDLE, INITIAL_ROUTER } from '../state.ts'

// This mod's memory, kept in `$.state` (see types/index.d.ts).
const idleAtom = atom({ plugin: 'session-saver-mod', key: 'idle' } as const, INITIAL_IDLE)
const routerAtom = atom({ plugin: 'session-saver-mod', key: 'router' } as const, INITIAL_ROUTER)

const CONTINUE = 'Continue'
const COMPACT = 'Compact first'
const FRESH = 'Start fresh'

// The reminder's text. Exported for the tests.
export function idleText(idleMs: number, tokens: number, usd: number | undefined): string {
  const cost = usd === undefined ? '' : ` (about ${formatUsd(usd)})`
  return (
    `Idle for ${formatMinutes(idleMs)} with ${formatTokens(tokens)} tokens of context. ` +
    `The prompt cache has likely expired, so this message re-sends the full context at full price${cost}.`
  )
}

export function registerIdleReminder(on: On) {
  if (!CONFIG.features.idleReminder) return

  // Claude finished responding: note the time.
  on('classic.Stop', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, idleAtom, s => ({ ...s, lastResponseAt: now }))
    return next(e)
  })

  // Only your own messages, typed (composer) or sent from the phone/web (bridge).
  on('prompt.submit', { origin: { kind: /^(composer|bridge)$/ } }, async ($, e, next) => {
    if (e.turnId !== undefined) return next(e) // typed while Claude is working: not idle

    const idle = await read($, idleAtom)
    const now = await $.clock.now()
    const idleMs = now - idle.lastResponseAt
    if (idle.lastResponseAt === 0 || idleMs < CONFIG.idle.idleMinutes * 60_000) return next(e)
    if (now < idle.graceUntil) return next(e) // the "send again" after a dismissed reminder

    const tokens = (await $.session.usage()).context.tokens ?? 0
    if (tokens <= CONFIG.idle.minContextTokens) return next(e)

    const router = await read($, routerAtom)
    const model = router.override ?? (await $.session.model())
    const text = idleText(idleMs, tokens, recacheCost(model, tokens, CONFIG.cost.cacheWriteTtl))

    // Nobody to ask (claude -p): say it and carry on.
    if ((await $.session.surfaces()).length === 0) {
      $.ui.log(text)
      return next(e)
    }

    let picked: string | undefined
    try {
      picked = await $.ui.ask(`${text} What now?`, { header: 'Idle', options: [CONTINUE, COMPACT, FRESH] })
    } catch {
      picked = undefined // dismissed
    }

    if (picked === CONTINUE) {
      // Count from now, so the next message isn't asked about again.
      await update($, idleAtom, s => ({ ...s, lastResponseAt: now }))
      return next(e)
    }

    // Every other answer holds the message. Put it back in the prompt box so nothing is lost.
    await update($, idleAtom, s => ({ ...s, graceUntil: now + CONFIG.idle.resendGraceMinutes * 60_000 }))
    await $.prompt.fill({ text: e.text, mode: 'replace' }).catch(() => undefined)

    if (picked === COMPACT) {
      // A command can't start from inside prompt.submit (it would wait on this
      // very hook), so a timer starts /compact a moment after the message is held.
      $.clock.after(100, () => {
        $.command.run({ command: 'compact', args: '' }).catch(() => $.ui.log('Could not start /compact; run it yourself.'))
      })
      return { drop: 'Held your message and started /compact. Your message is back in the prompt box: send it when compaction finishes.' }
    }
    if (picked === FRESH) {
      return { drop: 'Held your message (it is back in the prompt box). Type /clear to start a fresh session, then send it.' }
    }
    return { drop: `${text} Send again to continue, or run /compact or /clear first.` }
  })
}
