// The values session-saver-mod keeps in `$.state`: the session's memory,
// which survives a hot reload of the mod (plain variables in the module do not).
// `claude plugin validate` checks every `$.state` key the code uses against this list.

// Which cheaper model /cheap switched the main conversation to, if any.
export type RouterState = {
  // The model ID every main-conversation request is sent to, or null when /cheap is off.
  override: string | null
  // What the conversation ran on before /cheap, shown by /smart.
  previous: string | null
  // When the short-message tip last showed (ms), for its cooldown.
  lastTipAt: number
}

// A colored notice drawn in the band above the prompt.
export type Notice = {
  // 'warning' draws yellow, 'error' draws red (theme colors).
  level: 'warning' | 'error'
  text: string
}

// Which context thresholds have already shown their notice this session.
export type ContextState = {
  warned: boolean
  dangered: boolean
}

// What the idle reminder remembers between prompts.
export type IdleState = {
  // When Claude last finished responding (ms), or 0 before the first response.
  lastResponseAt: number
  // Until when a re-sent message skips the reminder (ms), after one was shown.
  graceUntil: number
}

declare module 'claude-code' {
  interface PluginState {
    'session-saver-mod': {
      router: RouterState
      notice: Notice | null
      context: ContextState
      idle: IdleState
    }
  }
}
