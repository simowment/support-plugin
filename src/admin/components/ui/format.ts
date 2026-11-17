/**
 * Admin wording and formatting shared by every admin bundle (backend and plugins).
 *
 * Source of truth for `@medusastore/shared-config/admin-format`. Plugins stay
 * self-contained: they keep a byte-for-byte copy at `src/admin/components/ui/format.ts`,
 * listed in `scripts/check-contract-mirrors.mjs`. Keep this file free of imports so the
 * copies compile anywhere (browser, Node, any tsconfig). Rules: docs/admin-ux-rules.md.
 */

// ---------------------------------------------------------------------------
// S3. Status vocabulary: five states, one label and one colour each.
// ---------------------------------------------------------------------------

export type StatusKind = 'ok' | 'attention' | 'problem' | 'off' | 'not_checked'

export const STATUS_KINDS: readonly StatusKind[] = [
  'problem',
  'attention',
  'not_checked',
  'off',
  'ok',
]

const STATUS_LABELS: Record<StatusKind, string> = {
  ok: 'OK',
  attention: 'Needs a look',
  problem: 'Problem',
  off: 'Off',
  not_checked: 'Not checked yet',
}

/** Colour names accepted by `StatusBadge` / `Badge` in @medusajs/ui. */
export type StatusColor = 'green' | 'orange' | 'red' | 'grey'

const STATUS_COLORS: Record<StatusKind, StatusColor> = {
  ok: 'green',
  attention: 'orange',
  problem: 'red',
  off: 'grey',
  not_checked: 'grey',
}

export const statusLabel = (kind: StatusKind): string => STATUS_LABELS[kind]
export const statusColor = (kind: StatusKind): StatusColor => STATUS_COLORS[kind]

/** Sort key, most urgent first: problem, attention, not checked, off, OK. */
export const statusRank = (kind: StatusKind): number => STATUS_KINDS.indexOf(kind)

/** The most urgent of several states (for a row that sums up several checks). */
export function worstStatus(kinds: readonly StatusKind[]): StatusKind {
  return kinds.reduce<StatusKind>(
    (worst, kind) => (statusRank(kind) < statusRank(worst) ? kind : worst),
    'ok',
  )
}

/**
 * A check waived at launch that still fails is `attention`, never `ok` (decision D3).
 * `passing` is the check's real result, `waived` whether the owner accepted it at launch.
 */
export function waivedStatus(passing: boolean, waived: boolean): StatusKind {
  if (passing) return 'ok'
  return waived ? 'attention' : 'problem'
}

// ---------------------------------------------------------------------------
// S4. Dates, money and counts, keyed to the admin language and the store currency.
// ISO strings and raw numbers never reach the owner.
// ---------------------------------------------------------------------------

export type DateInput = Date | string | number | null | undefined

export interface FormatOptions {
  /** BCP 47 locale. Defaults to the admin language (see `adminLocale`). */
  locale?: string
  /** IANA time zone, e.g. "Europe/Paris". Defaults to the browser's. */
  timeZone?: string
  /** Shown when the value is missing or not a valid date. */
  fallback?: string
  /** "Now" for relative wording; pass it in tests or server code. */
  now?: Date
}

const DASH = '—'

/**
 * The admin language: Medusa's `lng` setting, then the page language, then the browser.
 * Returns undefined outside a browser so Intl uses the runtime default.
 */
export function adminLocale(): string | undefined {
  try {
    const g = globalThis as {
      localStorage?: { getItem(key: string): string | null }
      document?: { documentElement?: { lang?: string } }
      navigator?: { language?: string }
    }
    // Only in a browser: reading `localStorage` in Node prints a warning.
    if (!g.document) return undefined
    return (
      g.localStorage?.getItem('lng') ||
      g.document.documentElement?.lang ||
      g.navigator?.language ||
      undefined
    )
  } catch {
    return undefined
  }
}

/** A valid Date, or null. Accepts Date, ISO string, epoch milliseconds. */
export function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function sameYear(a: Date, b: Date, timeZone?: string): boolean {
  const year = (d: Date) => new Intl.DateTimeFormat('en', { year: 'numeric', timeZone }).format(d)
  return year(a) === year(b)
}

/** "Tue 18 Nov" (the year is added when it is not this year: "Tue 18 Nov 2025"). */
export function formatDate(value: DateInput, options: FormatOptions = {}): string {
  const date = toDate(value)
  if (!date) return options.fallback ?? DASH
  const { locale = adminLocale(), timeZone, now = new Date() } = options
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: sameYear(date, now, timeZone) ? undefined : 'numeric',
    timeZone,
  })
    .format(date)
    .replace(/,/g, '')
}

/** "Tue 18 Nov, 14:05". */
export function formatDateTime(value: DateInput, options: FormatOptions = {}): string {
  const date = toDate(value)
  if (!date) return options.fallback ?? DASH
  const { locale = adminLocale(), timeZone } = options
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(date)
  return `${formatDate(date, options)}, ${time}`
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

function largestUnit(seconds: number): [Intl.RelativeTimeFormatUnit, number] {
  const abs = Math.abs(seconds)
  for (const [unit, size] of UNITS) {
    if (abs >= size) return [unit, Math.round(seconds / size)]
  }
  return ['minute', 0]
}

/** "3 hours ago", "in 2 days", "yesterday", "just now". */
export function formatRelative(value: DateInput, options: FormatOptions = {}): string {
  const date = toDate(value)
  if (!date) return options.fallback ?? DASH
  const { locale = adminLocale(), now = new Date() } = options
  const [unit, amount] = largestUnit((date.getTime() - now.getTime()) / 1000)
  if (amount === 0) return 'just now'
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(amount, unit)
}

/**
 * Time to a deadline: "1 day left", "3 hours left", or "passed 2 days ago" once it is over.
 * A past deadline is never printed as if it were still ahead.
 */
export function formatTimeLeft(deadline: DateInput, options: FormatOptions = {}): string {
  const date = toDate(deadline)
  if (!date) return options.fallback ?? DASH
  const { now = new Date() } = options
  const seconds = (date.getTime() - now.getTime()) / 1000
  const [unit, amount] = largestUnit(seconds)
  if (seconds <= 0) return amount === 0 ? 'passed just now' : `passed ${plural(-amount, unit)} ago`
  return amount === 0 ? 'less than a minute left' : `${plural(amount, unit)} left`
}

/** Whole days from now to the deadline (negative once it has passed). */
export function daysLeft(deadline: DateInput, now: Date = new Date()): number | null {
  const date = toDate(deadline)
  return date ? Math.floor((date.getTime() - now.getTime()) / (24 * 3600 * 1000)) : null
}

/**
 * Money in major units, as Medusa v2 stores it: formatMoney(50, 'eur') → "€50.00".
 * Unknown currency codes fall back to "50.00 XYZ".
 */
export function formatMoney(
  amount: number | null | undefined,
  currency: string,
  options: FormatOptions = {},
): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount))
    return options.fallback ?? DASH
  const code = currency.toUpperCase()
  try {
    return new Intl.NumberFormat(options.locale ?? adminLocale(), {
      style: 'currency',
      currency: code,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${code}`
  }
}

/** Digits after the decimal point for a currency (2 for EUR, 0 for JPY). */
export function currencyDecimals(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).resolvedOptions().maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

/** Amount stored in the smallest unit (cents) to major units: 5000 EUR cents → 50. */
export const fromMinorUnits = (minor: number, currency: string): number =>
  minor / 10 ** currencyDecimals(currency)

/** Major units to the smallest unit, rounded: 50.005 EUR → 5001 cents. */
export const toMinorUnits = (major: number, currency: string): number =>
  Math.round(major * 10 ** currencyDecimals(currency))

/** "1,234" in the admin language. */
export function formatNumber(value: number, options: FormatOptions = {}): string {
  return new Intl.NumberFormat(options.locale ?? adminLocale()).format(value)
}

/**
 * "1 blocker", "3 blockers", "0 orders". Never "blocker(s)".
 * Pass the plural form when it is not singular + "s": plural(2, 'reply', 'replies').
 */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  const form = new Intl.PluralRules('en').select(count) === 'one' ? singular : pluralForm
  return `${formatNumber(count)} ${form}`
}

/** "a, b and c" (English; Intl.ListFormat is left out so older tsconfig libs compile). */
export function formatList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

// ---------------------------------------------------------------------------
// S10. Wording. The rule: keep a precise technical term unless a more common word is
// exactly as precise; add a short gloss on first use instead of a vaguer word. Hide only
// implementation detail (commands, env names, file paths, exit codes, ids) behind
// "Technical details".
// ---------------------------------------------------------------------------

/**
 * `replace`: the term is vague or internal; use the replacement, which says the same or more.
 * `gloss`: keep the term, add the gloss on its first use on a page.
 * `installer`: implementation detail; move it under "Technical details".
 */
export type GlossaryKind = 'replace' | 'gloss' | 'installer'

export interface GlossaryEntry {
  /** Matched case-insensitively, as a whole word or phrase. */
  term: string
  kind: GlossaryKind
  /** The replacement (`replace`), the gloss (`gloss`) or what the owner sees instead (`installer`). */
  use: string
  why?: string
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  // Vague or internal wording replaced by something at least as precise.
  {
    term: 'writes on hold',
    kind: 'replace',
    use: 'Orders are not sent to suppliers yet (store not launched)',
  },
  {
    term: 'from configuration',
    kind: 'replace',
    use: 'Default (set by your installer)',
    why: 'says where the value comes from',
  },
  { term: 'use store configuration', kind: 'replace', use: 'Not chosen yet' },
  {
    term: 'admin only',
    kind: 'replace',
    use: 'Only admins see this',
    why: '"Only you" is wrong when there are several admins',
  },
  {
    term: 'in cents',
    kind: 'replace',
    use: 'a money field in the store currency (e.g. "€50.00")',
    why: 'decision D7',
  },
  {
    term: 'wall-clock',
    kind: 'replace',
    use: 'Took too long and was stopped (limit: 10 minutes)',
    why: 'state the limit in minutes',
  },
  { term: 'stale', kind: 'replace', use: 'Not updated since <time>', why: 'say since when' },
  { term: '(s)', kind: 'replace', use: 'plural(n, word): "1 blocker", "3 blockers"' },
  {
    term: 'not set up',
    kind: 'replace',
    use: 'Off (status "off") for an optional feature; "Needs a look" only when it is required',
  },
  {
    term: 'authorised',
    kind: 'replace',
    use: 'authorized',
    why: 'one spelling, as Medusa and Stripe use it',
  },
  {
    term: 'likely_expired',
    kind: 'replace',
    use: 'has probably expired (authorized more than 7 days ago)',
  },

  // Precise terms we keep, with the gloss for their first use on a page.
  { term: 'authorized', kind: 'gloss', use: 'the amount is held on the card, not charged yet' },
  {
    term: 'captured',
    kind: 'gloss',
    use: 'the held amount is charged; only then is the money yours',
  },
  { term: 'capture', kind: 'gloss', use: 'charge the amount held on the card' },
  { term: 'refund', kind: 'gloss', use: 'send money back to the customer’s card' },
  {
    term: 'webhook',
    kind: 'gloss',
    use: 'a message another service (Stripe, your supplier) sends to the store when something happens',
  },
  {
    term: 'DNS',
    kind: 'gloss',
    use: 'the records at your domain provider that point your web address to the store',
  },
  {
    term: 'handle',
    kind: 'gloss',
    use: 'the last part of the web address, e.g. /products/blue-mug',
    why: '"Web address" alone is less precise',
  },
  { term: 'SKU', kind: 'gloss', use: 'your stock-keeping code for one variant' },
  {
    term: 'variant',
    kind: 'gloss',
    use: 'one buyable version of a product, such as size M in blue',
  },
  { term: 'fulfillment', kind: 'gloss', use: 'packing and shipping an order' },
  { term: 'chargeback', kind: 'gloss', use: 'the customer’s bank reversed the payment' },
  { term: 'SMTP', kind: 'gloss', use: 'the mail server that sends the store’s emails' },

  // Implementation detail: owners see a plain status line; the detail goes to the installer.
  { term: 'exit code', kind: 'installer', use: 'a plain sentence: "The backup did not finish"' },
  { term: 'check id', kind: 'installer', use: 'the check’s title' },
  { term: 'env', kind: 'installer', use: 'Default (set by your installer)' },
  { term: 'mailpit', kind: 'installer', use: 'Test mailbox (emails are not delivered)' },
  { term: 'rclone', kind: 'installer', use: 'Backup copy' },
  { term: 'cron', kind: 'installer', use: 'the schedule in words: "Every night at 03:30"' },
  {
    term: 'stack trace',
    kind: 'installer',
    use: 'a plain sentence, with the detail under "Details for support"',
  },
]

export interface GlossaryHit {
  entry: GlossaryEntry
  index: number
  match: string
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Glossary terms found in a piece of copy (for review scripts and drift checks). */
export function findGlossaryHits(
  text: string,
  kinds: readonly GlossaryKind[] = ['replace', 'installer'],
): GlossaryHit[] {
  const hits: GlossaryHit[] = []
  for (const entry of GLOSSARY) {
    if (!kinds.includes(entry.kind)) continue
    const word = /^\w/.test(entry.term) && /\w$/.test(entry.term)
    const pattern = new RegExp(
      word ? `\\b${escapeRegExp(entry.term)}\\b` : escapeRegExp(entry.term),
      'gi',
    )
    for (const m of text.matchAll(pattern)) hits.push({ entry, index: m.index ?? 0, match: m[0] })
  }
  return hits.sort((a, b) => a.index - b.index)
}

/** The gloss for a kept precise term, or undefined: `Authorized (${glossFor('authorized')})`. */
export function glossFor(term: string): string | undefined {
  const t = term.toLowerCase()
  return GLOSSARY.find((e) => e.kind === 'gloss' && e.term.toLowerCase() === t)?.use
}
