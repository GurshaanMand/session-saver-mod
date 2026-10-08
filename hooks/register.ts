// ─────────────────────────────────────────────────────────────────────────────
// session-saver-mod: the hooks module Claude Code loads (named in hooks.json).
//
// Claude Code calls `register` once when the mod loads (and again after each
// hot reload). Each feature lives in its own file under ./features and adds
// its own hooks; this file just switches them on, in this order:
//
//   - The idle reminder comes before the model router, so a message the
//     reminder holds back never gets the "short message" tip.
//   - The big-file warning comes before the repeat-read detector, so a read
//     you refuse is never counted.
//
// Settings (thresholds, on/off switches) are in ./config.ts.
// Prices are in ./pricing.ts.
// ─────────────────────────────────────────────────────────────────────────────
import type { Register } from 'claude-code'

import { registerBigFile } from './features/big-file.ts'
import { registerContextNudge } from './features/context-nudge.tsx'
import { registerCostReceipt } from './features/cost-receipt.ts'
import { registerIdleReminder } from './features/idle-reminder.ts'
import { registerModelRouter } from './features/model-router.ts'
import { registerRepeatRead } from './features/repeat-read.ts'
import { registerSubagentModel } from './features/subagent-model.ts'

export const register: Register = on => {
  registerIdleReminder(on) // 7. warn before re-sending a big context after a break
  registerModelRouter(on) // 1. /cheap, /smart, short-message tip
  registerContextNudge(on) // 2. 60% / 85% context notices
  registerSubagentModel(on) // 3. subagents default to Sonnet
  registerBigFile(on) // 4. confirm huge reads and searches
  registerRepeatRead(on) // 5. notice the same file read again and again
  registerCostReceipt(on) // 6. per-prompt token and cost receipt
}
