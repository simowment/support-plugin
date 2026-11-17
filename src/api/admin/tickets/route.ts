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

/** Order numbers are a convenience: a failed lookup is logged and the list still loads. */
async function orderLookup<T>(
  req: AuthenticatedMedusaRequest<unknown, ListAdminTicketsQuery>,
  run: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await run()
  } catch (error) {
    const logger = req.scope.resolve<{ warn(message: string): void }>(
      ContainerRegistrationKeys.LOGGER,
    )
    logger.warn(
      `[tickets] order number lookup failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    return undefined
  }
}

export async function GET(
  req: AuthenticatedMedusaRequest<unknown, ListAdminTicketsQuery>,
  res: MedusaResponse,
) {
  const service = resolveTicketService(req)
  const { take, skip } = parsePagination(req.validatedQuery)

  const query = req.scope.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY)

  // "#32" or "32" is an order number (`display_id`): find that order so its tickets match.
  const orderNumber = /^#?\s*(\d{1,9})$/.exec(req.validatedQuery.q?.trim() ?? '')?.[1]
  let orderIds: string[] | undefined
  if (orderNumber) {
    orderIds = await orderLookup(req, async () => {
      const { data } = await query.graph({
        entity: 'order',
        fields: ['id'],
        filters: { display_id: Number(orderNumber) },
      })
      return data.map((row) => String(row.id))
    })
  }

  const { tickets, count } = await service.listAdminTickets(
    { ...req.validatedQuery, order_ids: orderIds },
    { take, skip },
  )

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
    const { data } = await query.graph({
      entity: 'customer',
      fields: ['id', 'email', 'first_name', 'last_name'],
      filters: { id: customerIds },
    })
    for (const row of data as CustomerSummary[]) customers.set(row.id, row)
  }

  // The order number the owner knows ("#32"), so the inbox never shows a raw order id.
  const linkedOrderIds = [
    ...new Set(
      (tickets as Array<{ order_id?: string | null }>)
        .map((ticket) => ticket.order_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const orderNumbers = new Map<string, number>()
  if (linkedOrderIds.length) {
    const rows = await orderLookup(req, async () => {
      const { data } = await query.graph({
        entity: 'order',
        fields: ['id', 'display_id'],
        filters: { id: linkedOrderIds },
      })
      return data
    })
    for (const row of rows ?? []) {
      if (typeof row.display_id === 'number') orderNumbers.set(String(row.id), row.display_id)
    }
  }

  const enriched = (
    tickets as Array<Record<string, unknown> & { customer_id?: string | null; order_id?: unknown }>
  ).map((ticket) => {
    const customer = ticket.customer_id ? (customers.get(ticket.customer_id) ?? null) : null
    const orderId = typeof ticket.order_id === 'string' ? ticket.order_id : null
    return {
      ...ticket,
      customer,
      order_display_id: orderId ? (orderNumbers.get(orderId) ?? null) : null,
      customer_deleted: Boolean(ticket.customer_id && !customer),
    }
  })

  return res.json({ success: true, tickets: enriched, count, limit: take, offset: skip })
}
