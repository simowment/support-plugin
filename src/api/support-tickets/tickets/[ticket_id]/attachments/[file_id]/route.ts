import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import type { IFileModuleService } from '@medusajs/framework/types'
import { Modules } from '@medusajs/framework/utils'
import { resolveTicketService, sendError, ticketNotFound } from '../../../../../shared/helpers'
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

  const isAdmin =
    req.auth_context.actor_type === ADMIN_ACTOR_TYPE || req.auth_context.actor_type === 'api-key'
  if (!isAdmin && result.ticket.customer_id !== req.auth_context.actor_id) {
    return ticketNotFound(res)
  }

  const attachment = findMessageAttachment(result.messages, fileId)
  if (!attachment) {
    return sendError(res, 404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found')
  }

  const fileService = req.scope.resolve<IFileModuleService>(Modules.FILE)
  let buffer: Buffer
  try {
    buffer = await fileService.getAsBuffer(fileId)
  } catch (error) {
    // The message still lists the file but storage no longer has it (deleted or
    // never uploaded): that is a missing file, not a server crash.
    const name = (error as { name?: string; Code?: string } | null)?.name
    const code = (error as { Code?: string; code?: string } | null)?.Code ?? (error as { code?: string } | null)?.code
    if (name === 'NoSuchKey' || code === 'NoSuchKey' || code === 'ENOENT' || name === 'NotFound') {
      return sendError(res, 404, 'ATTACHMENT_FILE_MISSING', 'This attachment is no longer stored')
    }
    throw error
  }

  res.setHeader(CACHE_CONTROL_HEADER, CACHE_CONTROL_PRIVATE)
  res.setHeader(CONTENT_TYPE_HEADER, attachment.mimeType)
  res.setHeader(CONTENT_LENGTH_HEADER, buffer.byteLength.toString())
  res.setHeader('X-Content-Type-Options', 'nosniff')
  const filename = encodeURIComponent(attachment.filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`)

  return res.send(buffer)
}
