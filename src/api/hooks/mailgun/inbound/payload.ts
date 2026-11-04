import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { ReceiveInboundEmailInput } from '../../../../modules/support-ticket/service'

export const MAX_INBOUND_BYTES = 25 * 1024 * 1024
export const MAX_INBOUND_TEXT_BYTES = 100_000
const MAX_SIGNATURE_AGE_SECONDS = 8 * 60 * 60 + 300
const REPLY_TOKEN = /^[A-Za-z0-9_-]{43}$/

export class InboundEmailError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code)
  }
}

function scalar(body: Record<string, unknown>, name: string, maximum: number, required = true) {
  const value = body[name]
  if (!required && value === undefined) return ''
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim())) {
    throw new InboundEmailError(400, 'invalid_email_fields')
  }
  return value
}

function address(value: string, preserveReplyToken = false) {
  const trimmed = value.trim()
  const at = trimmed.lastIndexOf('@')
  // Reply tokens are case-sensitive secrets; mailbox normalization must retain them.
  const normalized =
    preserveReplyToken && trimmed.startsWith('reply+')
      ? trimmed.slice(0, at) + trimmed.slice(at).toLowerCase()
      : trimmed.toLowerCase()
  if (
    normalized.length > 254 ||
    /[\x00-\x20\x7f]/.test(normalized) ||
    !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(normalized)
  ) {
    throw new InboundEmailError(400, 'invalid_email_address')
  }
  return normalized
}

export function verifyInboundSignature(body: Record<string, unknown>) {
  const key = process.env.MAILGUN_WEBHOOK_SIGNING_KEY?.trim()
  if (!key) throw new InboundEmailError(503, 'inbound_signature_not_configured')
  const timestamp = scalar(body, 'timestamp', 12)
  const token = scalar(body, 'token', 128)
  const signature = scalar(body, 'signature', 64)
  if (
    !/^\d{9,12}$/.test(timestamp) ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(token) ||
    !/^[a-fA-F0-9]{64}$/.test(signature)
  ) {
    throw new InboundEmailError(401, 'invalid_inbound_signature')
  }
  const expected = createHmac('sha256', key)
    .update(timestamp + token)
    .digest()
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
    throw new InboundEmailError(401, 'invalid_inbound_signature')
  }
  const age = Math.floor(Date.now() / 1000) - Number(timestamp)
  if (age < -60 || age > MAX_SIGNATURE_AGE_SECONDS) {
    throw new InboundEmailError(401, 'expired_inbound_signature')
  }
  return createHash('sha256').update(token).digest('hex')
}

export function normalizeInboundEmail(body: Record<string, unknown>, files: Express.Multer.File[]) {
  const recipientEmail = address(scalar(body, 'recipient', 254), true)
  const [localPart, domain] = recipientEmail.split('@')
  const allowed = (process.env.SUPPORT_INBOUND_RECIPIENTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  let replyToken: string | undefined
  if (!allowed.includes(recipientEmail)) {
    const replyDomain = process.env.SUPPORT_REPLY_EMAIL_DOMAIN?.trim().toLowerCase()
    const token = localPart.startsWith('reply+') ? localPart.slice(6) : ''
    if (!replyDomain || domain !== replyDomain || !REPLY_TOKEN.test(token)) {
      throw new InboundEmailError(406, 'unsupported_inbound_recipient')
    }
    replyToken = token
  }
  const from = scalar(body, 'from', 1000)
  const mailbox = from.match(/^\s*([^<>]*)<([^<>]+)>\s*$/)
  const senderEmail = address(mailbox ? mailbox[2] : from)
  const senderName = mailbox?.[1].trim().replace(/^"|"$/g, '').slice(0, 200) || undefined
  const envelopeSender = scalar(body, 'sender', 1000, false)
  let headers: unknown
  try {
    headers = JSON.parse(scalar(body, 'message-headers', 64_000))
  } catch {
    throw new InboundEmailError(400, 'invalid_message_headers')
  }
  if (
    !Array.isArray(headers) ||
    headers.length > 300 ||
    headers.some((v) => !Array.isArray(v) || v.length !== 2 || v.some((x) => typeof x !== 'string'))
  ) {
    throw new InboundEmailError(400, 'invalid_message_headers')
  }
  const values = (name: string) =>
    (headers as string[][])
      .filter(([key]) => key.toLowerCase() === name)
      .map(([, value]) => value.trim())
  const ids = [...new Set(values('message-id'))]
  if (ids.length !== 1 || !ids[0] || ids[0].length > 998 || /[\r\n]/.test(ids[0])) {
    throw new InboundEmailError(406, 'missing_unique_message_id')
  }
  const automatic = values('auto-submitted').some((value) => value.toLowerCase() !== 'no')
  const subject = scalar(body, 'subject', 2000, false).trim().slice(0, 500)
  const stripped = scalar(body, 'stripped-text', MAX_INBOUND_TEXT_BYTES, false)
  const plain = scalar(body, 'body-plain', MAX_INBOUND_TEXT_BYTES, false)
  const text = stripped.trim() || plain.trim()
  if (!text && !files.length && !automatic)
    throw new InboundEmailError(406, 'empty_inbound_message')
  const declaredAttachments =
    body['attachment-count'] === undefined ? 0 : Number(scalar(body, 'attachment-count', 2))
  if (!Number.isInteger(declaredAttachments) || declaredAttachments !== files.length) {
    throw new InboundEmailError(400, 'attachment_count_mismatch')
  }
  const attachments = files
    .map((file) => ({
      field: file.fieldname.toLowerCase(),
      filename: file.originalname,
      type: file.mimetype,
      bytes: file.size,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    }))
    .sort((a, b) => a.field.localeCompare(b.field))
  const payloadHash = createHash('sha256')
    .update(
      JSON.stringify({
        recipientEmail,
        senderEmail,
        senderName: senderName ?? '',
        envelopeSender,
        messageId: ids[0],
        subject,
        text,
        replyToken: replyToken ?? '',
        automatic,
        attachments,
      }),
    )
    .digest('hex')
  const input: ReceiveInboundEmailInput = {
    recipientEmail,
    senderEmail,
    senderName,
    messageId: ids[0],
    subject,
    text: text || '[Email contains attachments]',
    replyToken,
  }
  return { input, payloadHash, automatic }
}
