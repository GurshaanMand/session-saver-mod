// ─────────────────────────────────────────────────────────────────────────────
// Feature 1: Model router
//
//   /cheap [haiku|sonnet]  send the main conversation's requests to a cheaper model
//   /smart                 go back to the model the session was on
//   tip                    a dim line when a short, simple message is sent on Opus
//
// HOW IT SWITCHES: the mods API has no call that changes the session's model
// setting (the one /model changes). What it does have is `turn.step`, which
// fires before every request to the model and lets a hook send that request
// to a different model. So /cheap remembers a model in `$.state`, and the
// `turn.step` hook below sends every main-conversation request there until
// /smart clears it. Claude really answers on the cheaper model, and the cost
// receipt shows it, but `/model` and the status line's model name still show
// the session's own model. A status line entry says when /cheap is on.
// ─────────────────────────────────────────────────────────────────────────────
import type { On } from 'claude-code'
import { atom, read, update } from 'claude-code'

import { CONFIG, type CheapModelName } from '../config.ts'
import { formatTokens, formatUsd, isOpus, looksLikeCode, mentionsFile, shortModelName, wordCount } from '../lib/format.ts'
import { recacheCost } from '../pricing.ts'
import { INITIAL_ROUTER } from '../state.ts'

// This mod's memory of /cheap, kept in `$.state` (see types/index.d.ts).
const routerAtom = atom({ plugin: 'session-saver-mod', key: 'router' } as const, INITIAL_ROUTER)

// Below this much context, switching models is cheap enough not to mention.
const MENTION_RECACHE_ABOVE_TOKENS = 20_000

export function registerModelRouter(on: On) {
  if (!CONFIG.features.modelRouter) return

  // When the session starts (and after each hot reload): add the two commands,
  // and put the status line entry back if /cheap was on.
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cheap',
      description: 'Send this conversation to a cheaper model (default Haiku). /smart to switch back.',
      argumentHint: '[haiku|sonnet]',
      immediate: true,
    })
    await $.command.register({
      name: 'smart',
      description: 'Switch back to the model you were on before /cheap.',
      immediate: true,
    })
    const router = await read($, routerAtom)
    $.ui.status(router.override ? statusText(router.override) : undefined)
    return next(e)
  })

  // /cheap [haiku|sonnet]
  on('command.run', { command: 'cheap' }, async ($, e) => {
    const asked = e.args.trim().toLowerCase() || CONFIG.router.defaultCheapModel
    if (asked !== 'haiku' && asked !== 'sonnet') {
      return { text: `Unknown model "${asked}". Use /cheap haiku or /cheap sonnet.` }
    }
    const target = CONFIG.router.models[asked as CheapModelName]
    const router = await read($, routerAtom)
    const current = router.override ?? (await $.session.model())

    // Remember where we came from only the first time, so /cheap sonnet then
    // /cheap haiku still lets /smart go all the way back.
    await update($, routerAtom, r => ({ ...r, override: target, previous: r.override ? r.previous : current }))
    $.ui.status(statusText(target))

    // Changing model means the next request can't use the prompt cache the
    // old model built, so the whole context is sent (and cached) again once.
    const tokens = (await $.session.usage()).context.tokens ?? 0
    let note = ''
    if (tokens > MENTION_RECACHE_ABOVE_TOKENS) {
      const usd = recacheCost(target, tokens, CONFIG.cost.cacheWriteTtl)
      note =
        ` Heads-up: the first ${shortModelName(target)} request re-sends the ${formatTokens(tokens)}-token context` +
        ` without cache help` + (usd === undefined ? '.' : ` (about ${formatUsd(usd)}).`)
    }
    return {
      text:
        `Main conversation now runs on ${shortModelName(target)} (${target}), was ${shortModelName(current)}.` +
        ` /smart to switch back.` + note,
    }
  })

  // /smart
  on('command.run', { command: 'smart' }, async $ => {
    const router = await read($, routerAtom)
    if (!router.override) {
      return { text: `Already on ${shortModelName(await $.session.model())}; /cheap is not on.` }
    }
    const back = router.previous ?? (await $.session.model())
    await update($, routerAtom, r => ({ ...r, override: null, previous: null }))
    $.ui.status(undefined)
    return { text: `Back on ${shortModelName(back)}.` }
  })

  // Before every request to the model: if /cheap is on and this is the main
  // conversation (no agentId), send the request to the cheaper model instead.
  // `turn.step` streams, so the hook is an async generator and `yield*`
  // passes the response through piece by piece. The matcher `{ model: /./ }`
  // matches every request; it is there because the cost receipt also hooks
  // `turn.step`, and one event can't be hooked twice with the same matcher.
  on('turn.step', { model: /./ }, async function* ($, e, next) {
    if (e.agentId) return yield* next(e)
    const router = await read($, routerAtom)
    if (!router.override || router.override === e.model) return yield* next(e)
    return yield* next({ ...e, model: router.override })
  })

  // The tip: a short, plain message typed while the conversation runs on Opus.
  on('prompt.submit', { origin: { kind: 'composer' } }, async ($, e, next) => {
    const result = await next(e)
    if (result.drop !== undefined) return result // another hook stopped it

    const isShortAndPlain =
      wordCount(e.text) < CONFIG.router.shortMessageWords &&
      !e.text.trim().startsWith('/') &&
      (e.attachments?.length ?? 0) === 0 &&
      !mentionsFile(e.text) &&
      !looksLikeCode(e.text)
    if (!isShortAndPlain) return result

    const router = await read($, routerAtom)
    const model = router.override ?? (await $.session.model())
    if (!isOpus(model)) return result

    const now = await $.clock.now()
    if (now - router.lastTipAt < CONFIG.router.shortMessageTipCooldownMinutes * 60_000) return result
    await update($, routerAtom, r => ({ ...r, lastTipAt: now }))
    $.ui.log('Short message on Opus. /cheap to switch.')
    return result
  })
}

function statusText(model: string): string {
  return `cheap mode: ${shortModelName(model)} · /smart to undo`
}
