import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import SupportTicketModuleService from '../../../modules/support-ticket/service'
import { SUPPORT_TICKET_MODULE } from '../../../modules/support-ticket'

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const supportTicketService: SupportTicketModuleService =
    req.scope.resolve(SUPPORT_TICKET_MODULE)

  const status = req.query['status'] as string | undefined
  const category = req.query['category'] as string | undefined
  const customer_id = req.query['customer_id'] as string | undefined

  const filters: Record<string, unknown> = {}
  if (status) filters.status = status
  if (category) filters.category = category
  if (customer_id) filters.customer_id = customer_id

  const tickets = await supportTicketService.listTickets(filters, {
    order: { created_at: 'DESC' },
    take: parseInt(req.query['limit'] as string) || 50,
    skip: parseInt(req.query['offset'] as string) || 0,
  })

  // Diagnostic
  const svc = supportTicketService as any
  const container = svc.__container__
  const allKeys = container ? Object.keys(container) : []
  const repoKeys = allKeys.filter(k => k.toLowerCase().includes('repository') || k.toLowerCase().includes('manager'))
  const repoStates: Record<string, string> = {}
  for (const k of repoKeys) {
    const val = container[k]
    if (val && typeof val === 'object') {
      repoStates[k] = `type=${val.constructor?.name}, hasManager_=${!!val.manager_}`
    } else {
      repoStates[k] = `value=${String(val)}`
    }
  }

  return res.json({ tickets, _debug: { allKeys, repoStates, keyCount: allKeys.length } })
}
