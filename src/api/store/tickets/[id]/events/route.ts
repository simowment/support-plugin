import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { resolveTicketService, requireAuth } from '../../../../shared/helpers'
import { ticketEventBus } from '../../../../shared/event-bus'

const HEARTBEAT_INTERVAL = 30_000 // 30 seconds

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireAuth(req, res)
  if (!customerId) return

  const ticketId = req.params.id
  const service = resolveTicketService(req)

  // Verify ticket ownership
  const result = await service.getTicketWithMessages(ticketId)
  if (!result || result.ticket.customer_id !== customerId) {
    res.status(404).json({ error: 'Ticket not found' })
    return
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', ticketId })}\n\n`)

  // Listen for ticket events
  const unsubscribe = ticketEventBus.on(ticketId, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  })

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n')
  }, HEARTBEAT_INTERVAL)

  // Cleanup on disconnect
  req.on('close', () => {
    unsubscribe()
    clearInterval(heartbeat)
    res.end()
  })
}
