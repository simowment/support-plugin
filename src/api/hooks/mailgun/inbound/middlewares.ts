import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
  MiddlewareRoute,
} from '@medusajs/framework/http'
import multer from 'multer'
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_MESSAGE,
} from '../../../shared/helpers'
import { MAX_INBOUND_BYTES } from './payload'

const parseMultipart = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILES_PER_MESSAGE,
    fields: 100,
    fieldSize: 128 * 1024,
    parts: 105,
  },
  fileFilter: (_req, file, callback) => {
    callback(
      null,
      /^attachment-[1-5]$/i.test(file.fieldname) && ALLOWED_MIME_TYPES.has(file.mimetype),
    )
  },
}).any()

export function parseInboundEmail(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction,
) {
  if (process.env.SUPPORT_MAILGUN_INBOUND_ENABLED !== 'true') {
    return res.status(503).json({ message: 'Support email ingestion is not enabled' })
  }
  const length = req.headers['content-length']
  if (length && (!/^\d+$/.test(String(length)) || Number(length) > MAX_INBOUND_BYTES)) {
    return res.status(413).json({ message: 'Inbound email exceeds the size limit' })
  }
  const type = (req.headers['content-type'] ?? '').split(';')[0].toLowerCase()
  if (type !== 'multipart/form-data' && type !== 'application/x-www-form-urlencoded') {
    return res.status(415).json({ message: 'Unsupported inbound email encoding' })
  }
  let received = 0
  let rejected = false
  const maximum = type === 'multipart/form-data' ? MAX_INBOUND_BYTES : 512 * 1024
  const count = (chunk: Buffer) => {
    received += chunk.byteLength
    if (received > maximum && !rejected) {
      rejected = true
      if (!res.headersSent)
        res.status(413).json({ message: 'Inbound email exceeds the size limit' })
      req.destroy()
    }
  }
  req.on('data', count)
  req.once('end', () => req.off('data', count))
  if (type === 'multipart/form-data') {
    return parseMultipart(req as never, res as never, (error) => {
      if (rejected || res.headersSent) return
      if (error) return res.status(400).json({ message: 'Invalid inbound email upload' })
      next()
    })
  }
  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => {
    if (!rejected) chunks.push(chunk)
  })
  req.once('end', () => {
    if (res.headersSent) return
    const values = new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
    const body = Object.create(null)
    let fields = 0
    for (const [key, value] of values) {
      if (++fields > 100 || Object.prototype.hasOwnProperty.call(body, key))
        return res.status(400).json({ message: 'Invalid inbound email fields' })
      body[key] = value
    }
    req.body = body
    req.files = []
    next()
  })
}

export const mailgunInboundMiddlewares: MiddlewareRoute[] = [
  {
    matcher: '/hooks/mailgun/inbound',
    method: 'POST',
    bodyParser: false,
    middlewares: [parseInboundEmail],
  },
]
