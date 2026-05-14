import { authenticate, defineMiddlewares } from '@medusajs/framework/http'
import multer from 'multer'
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, MAX_FILES_PER_MESSAGE } from './shared/helpers'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
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
      middlewares: [upload.array('files', MAX_FILES_PER_MESSAGE)],
    },
    {
      method: ['POST'],
      matcher: '/store/tickets/upload',
      // @ts-ignore
      middlewares: [upload.array('files', MAX_FILES_PER_MESSAGE)],
    },
  ],
})
