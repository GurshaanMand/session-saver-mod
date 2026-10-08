// ─────────────────────────────────────────────────────────────────────────────
// session-saver-mod settings
//
// Every threshold and every on/off switch lives in this one object.
// Change a value, save the file, and (with `claude --plugin-dir`) the mod
// reloads when you save. For an installed copy, see "Change a setting" in
// the README.
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG = {
  // ── Turn each feature on (true) or off (false) ──────────────────────────
  features: {
    modelRouter: true, // /cheap and /smart, plus the "short message on Opus" tip
    contextNudge: true, // yellow notice at 60% context, red notice at 85%
    subagentModel: true, // subagents with no model of their own run on Sonnet
    bigFileWarning: true, // ask before reading a huge file or searching a huge folder
    repeatReadDetector: true, // dim notice when the same unchanged file is read again and again
    costReceipt: true, // one-line token + cost receipt after each prompt
    idleReminder: true, // warn before re-sending a big, probably-uncached context
  },

  // ── 1. Model router ─────────────────────────────────────────────────────
  router: {
    // Which model /cheap picks when you type it with no argument: 'haiku' or 'sonnet'.
    defaultCheapModel: 'haiku' as CheapModelName,
    // The exact model IDs the two names stand for. If you use Claude through
    // Bedrock, Vertex or a gateway, put that provider's IDs here.
    models: {
      haiku: 'claude-haiku-5-5',
      sonnet: 'claude-sonnet-5-5',
    } as Record<CheapModelName, string>,
    // A message counts as "short" when it has fewer words than this.
    shortMessageWords: 15,
    // Minutes to wait before showing the short-message tip again. 0 = every time.
    shortMessageTipCooldownMinutes: 0,
  },

  // ── 2. Fresh-session nudge ──────────────────────────────────────────────
  context: {
    // Percent of the context window that triggers the yellow "/compact" notice.
    warnPercent: 60,
    // Percent that triggers the red "start a fresh session" notice.
    dangerPercent: 85,
  },

  // ── 3. Subagent model default ───────────────────────────────────────────
  subagent: {
    // Model alias a subagent gets when nobody picked one for it.
    defaultModel: 'sonnet',
    // Only step in when the main conversation runs on a model matching this.
    onlyWhenParentMatches: /opus|fable|mythos/i,
    // Agent types whose own definition already picks a cheaper model (Claude
    // Code docs: claude-code-guide uses Haiku, statusline-setup uses Sonnet).
    // Add the name of any of your own agents that sets `model:` in its file.
    skipAgentTypes: ['claude-code-guide', 'statusline-setup'] as string[],
  },

  // ── 4. Big-file warning ─────────────────────────────────────────────────
  bigFile: {
    // Ask before reading a file larger than this many kilobytes (1 KB = 1024 bytes).
    maxFileKB: 200,
    // Ask before Glob/Grep searches a folder holding more than this many files
    // (counted recursively, skipping the folders in ignoreDirs).
    maxDirEntries: 5000,
    // Folders not counted (Grep and Glob already skip most of these).
    ignoreDirs: ['.git', 'node_modules', 'dist', 'build', '.next', 'target', '.venv', '__pycache__'] as string[],
    // Rough characters per token, for the estimate (English text is about 4).
    bytesPerToken: 4,
  },

  // ── 5. Repeat-read detector ─────────────────────────────────────────────
  repeatRead: {
    // Show the notice when an unchanged file is read this many times.
    threshold: 3,
  },

  // ── 6. Cost-per-task receipt ────────────────────────────────────────────
  cost: {
    // Which cache-write price to use: '5m' (Claude Code's usual) or '1h'.
    cacheWriteTtl: '5m' as '5m' | '1h',
    // Hide the receipt for prompts that cost less than this (USD). 0 = always show.
    hideBelowUsd: 0,
  },

  // ── 7. Idle session reminder ────────────────────────────────────────────
  idle: {
    // Minutes since Claude's last response before a new message gets the reminder.
    // The prompt cache usually lasts 5 minutes (an hour on some plans).
    idleMinutes: 10,
    // Only remind when the context holds more than this many tokens.
    minContextTokens: 100_000,
    // After you dismiss the reminder, sending again within this many minutes goes straight through.
    resendGraceMinutes: 5,
  },
}

export type CheapModelName = 'haiku' | 'sonnet'
