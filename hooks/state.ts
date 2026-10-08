// The starting values of what this mod keeps in `$.state` (its memory for
// the session, which survives a hot reload). The value types are declared in
// ../types/index.d.ts. Each feature file makes its own handle with
// `atom({ plugin, key }, INITIAL_...)`, because `claude plugin validate`
// needs to see the key written in the file that reads or writes it.
import type { ContextState, IdleState, RouterState } from '../types'

export const INITIAL_ROUTER: RouterState = { override: null, previous: null, lastTipAt: 0 }
export const INITIAL_CONTEXT: ContextState = { warned: false, dangered: false }
export const INITIAL_IDLE: IdleState = { lastResponseAt: 0, graceUntil: 0 }
