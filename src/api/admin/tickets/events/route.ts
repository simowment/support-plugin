import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { requireAdminAuth } from '../../../shared/helpers'
import { ticketEventBus } from '../../../shared/event-bus'

const HEARTBEAT_INTERVAL = 30_000

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const adminId = requireAdminAuth(req, res)
  if (!adminId) return

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)

  const unsubscribe = ticketEventBus.onAny((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  })

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n')
  }, HEARTBEAT_INTERVAL)

  req.on('close', () => {
    unsubscribe()
    clearInterval(heartbeat)
    res.end()
  })
}
