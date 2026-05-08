import { authenticate, defineMiddlewares } from '@medusajs/framework/http'
import multer from 'multer'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.ms-excel',
])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`))
    }
  },
})

export default defineMiddlewares({
  routes: [
    {
      matcher: '/admin/tickets*',
      method: ['GET', 'POST', 'PATCH', 'DELETE'],
      middlewares: [authenticate('user', ['session', 'bearer', 'api-key'])],
    },
    {
      matcher: '/store/tickets*',
      method: ['GET', 'POST', 'PATCH', 'DELETE'],
      middlewares: [authenticate('customer', ['session', 'bearer'])],
    },
    {
      method: ['POST'],
      matcher: '/admin/tickets/upload',
      // @ts-ignore
      middlewares: [upload.array('files', 5)],
    },
    {
      method: ['POST'],
      matcher: '/store/tickets/upload',
      // @ts-ignore
      middlewares: [upload.array('files', 5)],
    },
  ],
})
