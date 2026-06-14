import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import type { IFileModuleService } from '@medusajs/framework/types'
import { Modules } from '@medusajs/framework/utils'
import {
  resolveTicketService,
  sendError,
  ticketNotFound,
} from '../../../../../shared/helpers'
import { findMessageAttachment } from '../../../../../shared/attachments'

const ADMIN_ACTOR_TYPE = 'user'
const CACHE_CONTROL_PRIVATE = 'private, no-store'
const CONTENT_LENGTH_HEADER = 'Content-Length'
const CACHE_CONTROL_HEADER = 'Cache-Control'
const CONTENT_TYPE_HEADER = 'Content-Type'

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const ticketId = req.params.ticket_id
  const fileId = req.params.file_id
  const service = resolveTicketService(req)
  const result = await service.getTicketWithMessages(ticketId)

  if (!result) return ticketNotFound(res)

  const isAdmin = req.auth_context.actor_type === ADMIN_ACTOR_TYPE
  if (!isAdmin && result.ticket.customer_id !== req.auth_context.actor_id) {
    return ticketNotFound(res)
  }

  const attachment = findMessageAttachment(result.messages, fileId)
  if (!attachment) {
    return sendError(res, 404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found')
  }

  const fileService = req.scope.resolve<IFileModuleService>(Modules.FILE)
  const buffer = await fileService.getAsBuffer(fileId)

  res.setHeader(CACHE_CONTROL_HEADER, CACHE_CONTROL_PRIVATE)
  res.setHeader(CONTENT_TYPE_HEADER, attachment.mimeType)
  res.setHeader(CONTENT_LENGTH_HEADER, buffer.byteLength.toString())

  return res.send(buffer)
}
