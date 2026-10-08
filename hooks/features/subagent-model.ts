// ─────────────────────────────────────────────────────────────────────────────
// Feature 3: Subagent model default
//
// When Claude starts a subagent (the Agent tool) without choosing a model,
// Claude Code normally runs it on the main conversation's model, which is
// often Opus. This hook picks Sonnet for it instead, and logs a dim line.
//
// It leaves the subagent alone when:
//   - Claude passed a model for it (the Agent tool's `model` parameter)
//   - it is a fork, which always runs on the parent's model
//   - its type is listed in CONFIG.subagent.skipAgentTypes (its own
//     definition already picks a cheaper model)
//   - the main conversation isn't on Opus (or Fable): no saving to make
//   - /cheap is on: then the subagent follows /cheap's model instead
//
// Event used: agent.spawn, which fires just before a subagent starts.
// `next({ ...e, model })` picks the model it runs on.
// ─────────────────────────────────────────────────────────────────────────────
import type { On } from 'claude-code'
import { atom, read } from 'claude-code'

import { CONFIG } from '../config.ts'
import { shortModelName } from '../lib/format.ts'
import { INITIAL_ROUTER } from '../state.ts'

// This mod's memory of /cheap, kept in `$.state` (see types/index.d.ts).
const routerAtom = atom({ plugin: 'session-saver-mod', key: 'router' } as const, INITIAL_ROUTER)

export function registerSubagentModel(on: On) {
  if (!CONFIG.features.subagentModel) return

  on('agent.spawn', async ($, e, next) => {
    const hasOwnModel = e.model !== undefined && e.model !== ''
    const isSkipped = CONFIG.subagent.skipAgentTypes.includes(e.subagentType)
    if (hasOwnModel || e.fork || e.workflow || isSkipped) return next(e)
    if (!CONFIG.subagent.onlyWhenParentMatches.test(e.parentModel)) return next(e)

    const router = await read($, routerAtom)
    const model = router.override ?? CONFIG.subagent.defaultModel
    const name = e.description || e.subagentType
    $.ui.log(`Subagent '${name}' running on ${shortModelName(model)} (session default is ${shortModelName(e.parentModel)}).`)
    return next({ ...e, model })
  })
}
