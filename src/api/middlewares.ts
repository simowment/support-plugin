import { authenticate, defineMiddlewares } from '@medusajs/framework/http'
import multer from 'multer'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

export default defineMiddlewares({
  routes: [
    {
      matcher: '/admin/tickets*',
      middlewares: [authenticate('user', ['session', 'bearer', 'api-key'])],
    },
    {
      matcher: '/store/tickets*',
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
