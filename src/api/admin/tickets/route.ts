import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { resolveTicketService, parsePagination } from '../../shared/helpers'
import type { ListAdminTicketsQuery } from '../../middlewares'

type CustomerSummary = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
}

type QueryGraph = {
  graph(input: {
    entity: string
    fields: string[]
    filters: Record<string, unknown>
  }): Promise<{ data: Array<Record<string, unknown>> }>
}

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, ListAdminTicketsQuery>,
  res: MedusaResponse,
) {
  const service = resolveTicketService(req)
  const { take, skip } = parsePagination(req.validatedQuery)

  const { tickets, count } = await service.listAdminTickets(req.validatedQuery, { take, skip })

  // Attach the customer's name and email so the inbox can show who wrote, and flag
  // tickets whose customer account no longer exists.
  const customerIds = [
    ...new Set(
      (tickets as Array<{ customer_id?: string | null }>)
        .map((ticket) => ticket.customer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const customers = new Map<string, CustomerSummary>()
  if (customerIds.length) {
    const query = req.scope.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: 'customer',
      fields: ['id', 'email', 'first_name', 'last_name'],
      filters: { id: customerIds },
    })
    for (const row of data as CustomerSummary[]) customers.set(row.id, row)
  }

  const enriched = (
    tickets as Array<Record<string, unknown> & { customer_id?: string | null }>
  ).map((ticket) => {
    const customer = ticket.customer_id ? (customers.get(ticket.customer_id) ?? null) : null
    return {
      ...ticket,
      customer,
      customer_deleted: Boolean(ticket.customer_id && !customer),
    }
  })

  return res.json({ success: true, tickets: enriched, count, limit: take, offset: skip })
}
