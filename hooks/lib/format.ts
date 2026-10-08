// Small pure helpers shared by the features. None of them touch `$`, so the
// tests can call them directly.

// 1234 → "1.2K", 1_500_000 → "1.5M", 999 → "999"
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return trim(n / 1_000_000) + 'M'
  if (n >= 1_000) return trim(n / 1_000) + 'K'
  return String(Math.round(n))
}

// 0.0123 → "$0.012", 1.5 → "$1.50", 0.00004 → "<$0.001"
export function formatUsd(usd: number): string {
  if (usd > 0 && usd < 0.001) return '<$0.001'
  if (usd < 1) return '$' + usd.toFixed(3)
  return '$' + usd.toFixed(2)
}

// 1536 bytes → "1.5 KB", 3 MB → "3.0 MB"
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024).toFixed(1) + ' KB'
}

// 754_000 ms → "12 min", 5_400_000 → "1 h 30 min"
export function formatMinutes(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return minutes + ' min'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? hours + ' h' : hours + ' h ' + rest + ' min'
}

// "claude-haiku-5-5-20261001" → "Haiku 5.5", "claude-opus-5-5[1m]" → "Opus 5.5",
// "sonnet" → "Sonnet". Anything else comes back as it was.
export function shortModelName(model: string): string {
  const m = /(opus|sonnet|haiku|fable|mythos)(?:[-\s]?(\d+)(?:[-.](\d+))?)?/i.exec(model)
  if (!m || !m[1]) return model
  const family = m[1][0]!.toUpperCase() + m[1].slice(1).toLowerCase()
  if (!m[2]) return family
  return family + ' ' + m[2] + (m[3] && m[3].length <= 2 ? '.' + m[3] : '')
}

// True when the model is an Opus model (by ID or display name).
export function isOpus(model: string): boolean {
  return /opus/i.test(model)
}

// The text a short-message check looks at: words, ignoring extra spaces.
export function wordCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0)
  return words.length
}

// A rough "does this look like code?" check: fenced or inline code, or a line
// with typical code punctuation.
export function looksLikeCode(text: string): boolean {
  if (/```|`[^`]+`/.test(text)) return true
  if (/[{};]\s*$|=>|\(\)|<\/?[a-z][\w-]*>|^\s*(import|export|def|function|class|const|let|var)\s/m.test(text)) return true
  return false
}

// "@src/app.ts" style mentions attach a file to the prompt.
export function mentionsFile(text: string): boolean {
  return /(^|\s)@[\w./~-]+/.test(text)
}

function trim(n: number): string {
  return n >= 100 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, '')
}
