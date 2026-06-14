import {
  authenticate,
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
  validateAndTransformBody,
  validateAndTransformQuery,
} from '@medusajs/framework/http'
import { z } from '@medusajs/framework/zod'
import multer from 'multer'
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_MESSAGE,
  MESSAGE_MAX_LENGTH,
} from './shared/helpers'
import type { TicketAttachmentInput } from './shared/attachments'

const SUBJECT_MAX_LENGTH = 200
const PROMPT_MAX_LENGTH = 10_000
const MAX_BULK_TICKETS = 50

const ticketStatusSchema = z.enum([
  'open',
  'in_progress',
  'waiting_customer',
  'waiting_admin',
  'closed',
])

const ticketCategorySchema = z.enum([
  'order_issue',
  'return_request',
  'fulfillment_issue',
  'product_inquiry',
  'payment_issue',
  'general',
])

const AttachmentSchema = z
  .object({
    id: z.string().trim().min(1),
    url: z.string().optional(),
    filename: z.string().trim().min(1),
    mimeType: z.string().refine((value) => ALLOWED_MIME_TYPES.has(value), {
      message: 'Unsupported attachment MIME type',
    }),
    size: z.number().int().min(0).max(MAX_FILE_SIZE_BYTES),
  })
  .strict()

const paginationQuerySchema = z.object({
  limit: z.preprocess((value) => Number(value), z.number().int().min(1).max(100)).optional(),
  offset: z.preprocess((value) => Number(value), z.number().int().min(0)).optional(),
})

export const ListAdminTicketsQuerySchema = paginationQuerySchema.extend({
  status: ticketStatusSchema.optional(),
  category: ticketCategorySchema.optional(),
  customer_id: z.string().min(1).optional(),
  assigned_to: z.string().min(1).optional(),
})

export const ListStoreTicketsQuerySchema = paginationQuerySchema.extend({
  status: ticketStatusSchema.optional(),
})

export const CreateTicketSchema = z.object({
  subject: z.string().trim().min(1).max(SUBJECT_MAX_LENGTH),
  category: ticketCategorySchema,
  message: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
  order_id: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const MessageSchema = z
  .object({
    message: z.string().max(MESSAGE_MAX_LENGTH).optional(),
    attachments: z.array(AttachmentSchema).max(MAX_FILES_PER_MESSAGE).optional(),
  })
  .refine((value) => Boolean(value.message?.trim()) || Boolean(value.attachments?.length), {
    message: 'Message or attachments are required.',
  })

export const UpdateTicketSchema = z.object({
  status: ticketStatusSchema.optional(),
  assigned_to: z.string().min(1).nullable().optional(),
})

export const TicketNoteSchema = z.object({
  content: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH),
})

export const MergeTicketSchema = z.object({
  source_ticket_id: z.string().trim().min(1),
})

export const BulkTicketSchema = z
  .object({
    ticket_ids: z.array(z.string().trim().min(1)).min(1).max(MAX_BULK_TICKETS),
    status: ticketStatusSchema.optional(),
    assigned_to: z.string().min(1).nullable().optional(),
  })
  .refine((value) => value.status !== undefined || value.assigned_to !== undefined, {
    message: 'Provide status or assigned_to',
  })

export const AISettingsSchema = z.object({
  enabled: z.boolean().optional(),
  auto_reply_enabled: z.boolean().optional(),
  provider: z.enum(['openrouter', 'openai', 'custom']).optional(),
  api_key: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  base_url: z.string().trim().min(1).optional(),
  analysis_system_prompt: z.string().max(PROMPT_MAX_LENGTH).optional(),
  response_system_prompt: z.string().max(PROMPT_MAX_LENGTH).optional(),
  escalation_rules: z.string().max(PROMPT_MAX_LENGTH).optional(),
})

export type CreateTicketBody = z.infer<typeof CreateTicketSchema>
export type MessageBody = Omit<z.infer<typeof MessageSchema>, 'attachments'> & {
  attachments?: TicketAttachmentInput[]
}
export type UpdateTicketBody = z.infer<typeof UpdateTicketSchema>
export type TicketNoteBody = z.infer<typeof TicketNoteSchema>
export type MergeTicketBody = z.infer<typeof MergeTicketSchema>
export type BulkTicketBody = z.infer<typeof BulkTicketSchema>
export type AISettingsBody = z.infer<typeof AISettingsSchema>

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

const multerUploadTicketFiles = upload.array('files', MAX_FILES_PER_MESSAGE)
const uploadTicketFiles = <Req extends MedusaRequest>(
  req: Req,
  res: MedusaResponse,
  next: MedusaNextFunction,
) => multerUploadTicketFiles(req as never, res as never, next)

export default defineMiddlewares({
  routes: [
    {
      matcher: '/admin/tickets*',
      method: ['GET', 'POST', 'DELETE'],
      middlewares: [authenticate('user', ['session', 'bearer', 'api-key'])],
    },
    {
      matcher: '/store/tickets*',
      method: ['GET', 'POST', 'DELETE'],
      middlewares: [authenticate('customer', ['session', 'bearer'])],
    },
    {
      matcher: '/support-tickets/tickets/:ticket_id/attachments/:file_id',
      method: 'GET',
      middlewares: [authenticate(['user', 'customer'], ['session', 'bearer', 'api-key'])],
    },
    {
      matcher: '/admin/tickets',
      method: 'GET',
      middlewares: [validateAndTransformQuery(ListAdminTicketsQuerySchema, {})],
    },
    {
      matcher: '/admin/tickets/:id/messages',
      method: 'POST',
      middlewares: [validateAndTransformBody(MessageSchema)],
    },
    {
      matcher: '/admin/tickets/:id/notes',
      method: 'POST',
      middlewares: [validateAndTransformBody(TicketNoteSchema)],
    },
    {
      matcher: '/admin/tickets/:id/merge',
      method: 'POST',
      middlewares: [validateAndTransformBody(MergeTicketSchema)],
    },
    {
      matcher: '/admin/tickets/bulk',
      method: 'POST',
      middlewares: [validateAndTransformBody(BulkTicketSchema)],
    },
    {
      matcher: '/admin/tickets/ai-settings',
      method: 'POST',
      middlewares: [validateAndTransformBody(AISettingsSchema)],
    },
    {
      matcher: '/store/tickets',
      method: 'GET',
      middlewares: [validateAndTransformQuery(ListStoreTicketsQuerySchema, {})],
    },
    {
      matcher: '/store/tickets',
      method: 'POST',
      middlewares: [validateAndTransformBody(CreateTicketSchema)],
    },
    {
      matcher: '/store/tickets/:id/messages',
      method: 'POST',
      middlewares: [validateAndTransformBody(MessageSchema)],
    },
    {
      method: ['POST'],
      matcher: '/admin/tickets/upload',
      middlewares: [uploadTicketFiles],
    },
    {
      method: ['POST'],
      matcher: '/store/tickets/upload',
      middlewares: [uploadTicketFiles],
    },
  ],
})
