// ─────────────────────────────────────────────────────────────────────────────
// PRICE TABLE  (USD per 1 million tokens)
//
// Source: Anthropic API pricing, https://platform.claude.com/docs/en/about-claude/pricing
// Copied: 2026-10-08. Prices change: if a receipt looks wrong, check that page
// and edit the numbers below. Everything the mod prints from this table is an
// ESTIMATE of list API prices. A Pro/Max subscription is billed differently,
// and Bedrock / Vertex / regional endpoints have their own prices.
//
// Columns:
//   input       uncached input tokens
//   cacheWrite5m writing to the 5-minute prompt cache
//   cacheWrite1h writing to the 1-hour prompt cache
//   cacheRead   cache hits and refreshes
//   output      output tokens (thinking included)
//
// `match` is tested against the model ID the API reports (for example
// "claude-opus-5-5" or "claude-opus-5-5-20260901"). The first row that
// matches wins, so keep more specific rows above general ones.
// ─────────────────────────────────────────────────────────────────────────────

export type Price = {
  input: number
  cacheWrite5m: number
  cacheWrite1h: number
  cacheRead: number
  output: number
}

export type PriceRow = {
  label: string
  match: RegExp
  price: Price
  // Some models charge more once a single request's prompt passes a size.
  // When the request's whole prompt (uncached + cache read + cache write) is
  // above `overTokens`, `price` is replaced by `overPrice`.
  longPrompt?: { overTokens: number; overPrice: Price }
}

export const PRICES: PriceRow[] = [
  // label                match                                 input  5m write  1h write  cache read  output
  { label: 'Fable 5.1',   match: /fable-5-1|mythos-5-1/,  price: p(10,    12.5,     20,       0.25,       50) },
  { label: 'Fable 5',     match: /fable-5|mythos-5/,      price: p(10,    12.5,     20,       1,          50) },
  { label: 'Opus 5.5',    match: /opus-5-5/,              price: p(4,     5,        8,        0.2,        20) },
  { label: 'Opus 5',      match: /opus-5/,                price: p(5,     6.25,     10,       0.5,        25) },
  { label: 'Opus 4.5–4.8', match: /opus-4-[5-8]/,         price: p(5,     6.25,     10,       0.5,        25) },
  { label: 'Opus 4/4.1',  match: /opus-4/,                price: p(15,    18.75,    30,       1.5,        75) },
  { label: 'Sonnet 5.5',  match: /sonnet-5-5/,            price: p(2,     2.5,      4,        0.1,        10) },
  { label: 'Sonnet 5',    match: /sonnet-5/,              price: p(2,     2.5,      4,        0.2,        10) },
  { label: 'Sonnet 4.x',  match: /sonnet-4/,              price: p(3,     3.75,     6,        0.3,        15) },
  {
    label: 'Haiku 5.5',
    match: /haiku-5-5/,
    price: p(0.1, 0.125, 0.2, 0.01, 0.5), // prompts up to 100,000 tokens
    longPrompt: { overTokens: 100_000, overPrice: p(0.5, 0.625, 1, 0.05, 2.5) },
  },
  { label: 'Haiku 4.5',   match: /haiku-4-5/,             price: p(1,     1.25,     2,        0.1,        5) },
  { label: 'Haiku 3.5',   match: /haiku-3-5|3-5-haiku/,   price: p(0.8,   1,        1.6,      0.08,       4) },
]

// A short way to write one row's numbers, in the column order above.
function p(input: number, cacheWrite5m: number, cacheWrite1h: number, cacheRead: number, output: number): Price {
  return { input, cacheWrite5m, cacheWrite1h, cacheRead, output }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers that use the table. Nothing below needs editing when prices change.
// ─────────────────────────────────────────────────────────────────────────────

// The four token counts every API response reports.
export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

// Finds the price row for a model ID, or undefined for a model not in the table.
export function findPriceRow(model: string): PriceRow | undefined {
  const id = model.toLowerCase().replace(/\./g, '-')
  return PRICES.find(row => row.match.test(id))
}

// The price that applies to one request of `model` with this usage.
export function priceFor(model: string, usage?: Usage): Price | undefined {
  const row = findPriceRow(model)
  if (!row) return undefined
  if (row.longPrompt && usage) {
    const prompt = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
    if (prompt > row.longPrompt.overTokens) return row.longPrompt.overPrice
  }
  return row.price
}

// What one request cost, in USD, each kind of token priced separately.
// Returns undefined when the model has no row in the table.
export function costOf(model: string, usage: Usage, ttl: '5m' | '1h'): number | undefined {
  const price = priceFor(model, usage)
  if (!price) return undefined
  const write = ttl === '1h' ? price.cacheWrite1h : price.cacheWrite5m
  return (
    (usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      usage.cache_read_input_tokens * price.cacheRead +
      usage.cache_creation_input_tokens * write) /
    1_000_000
  )
}

// What it costs to send `tokens` of context to `model` with no cache help:
// the context is written to the cache again at the cache-write price.
export function recacheCost(model: string, tokens: number, ttl: '5m' | '1h'): number | undefined {
  return costOf(model, { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: tokens }, ttl)
}
