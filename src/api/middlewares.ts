import { authenticate, defineMiddlewares } from '@medusajs/framework/http'

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
  ],
})
