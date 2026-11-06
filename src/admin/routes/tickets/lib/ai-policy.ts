// Mirrors the server constants in modules/ai/constants.ts so the admin copy states the
// real auto-reply rules. Keep both in sync.
export const CONFIDENCE_THRESHOLD_AUTO_REPLY = 0.85
export const BLOCKED_AUTO_REPLY_CATEGORIES = [
  'refund',
  'payment',
  'chargeback',
  'fraud',
  'legal',
  'complaint',
  'shipping_issue',
]

export const CONFIDENCE_THRESHOLD_LABEL = `${Math.round(CONFIDENCE_THRESHOLD_AUTO_REPLY * 100)}%`
export const BLOCKED_CATEGORIES_LABEL = BLOCKED_AUTO_REPLY_CATEGORIES.map((c) =>
  c.replace(/_/g, ' '),
).join(', ')
