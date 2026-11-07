import { createHmac, timingSafeEqual } from 'node:crypto'
import { AuthenticatedMedusaRequest, MedusaRequest } from '@medusajs/framework/http'
import type { ConfigModule } from '@medusajs/framework/types'
import { ContainerRegistrationKeys, MedusaError } from '@medusajs/framework/utils'
import { uploadFilesWorkflow } from '@medusajs/core-flows'
import { MAX_FILE_SIZE_BYTES, MAX_FILES_PER_MESSAGE, ALLOWED_MIME_TYPES } from './helpers'
import { buildPendingAttachmentUrl, type TicketAttachmentInput } from './attachments'

/**
 * Query parameter on an upload's pending `url` that proves who uploaded the file. A message
 * may only reference a file its sender uploaded: file IDs alone are not secret (they show up
 * in logs, admin screens and links), and the download route serves any file a ticket
 * message references.
 */
const UPLOAD_SIGNATURE_PARAM = 'upload_sig'
const UPLOAD_SIGNATURE_CONTEXT = 'support-ticket-upload'
const URL_PARSE_BASE = 'http://localhost'

type AttachmentResult = {
  id: string
  url: string
  filename: string
  mimeType: string
  size: number
}

function getMimeType(file: Express.Multer.File) {
  const header = file.buffer.subarray(0, 12)

  if (header[0] === 0x89 && header.subarray(1, 4).toString('ascii') === 'PNG') {
    return 'image/png'
  }

  if (header.subarray(0, 3).toString('ascii') === 'GIF') {
    return 'image/gif'
  }

  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }

  if (header.subarray(0, 4).toString('ascii') === '%PDF') {
    return 'application/pdf'
  }

  return file.mimetype
}

function validateFile(file: Express.Multer.File) {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const maxMB = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `File "${file.originalname}" exceeds the ${maxMB}MB size limit`,
    )
  }

  const mimeType = getMimeType(file)
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `File "${file.originalname}" has an unsupported type: ${mimeType}. Allowed: ${Array.from(ALLOWED_MIME_TYPES).join(', ')}`,
    )
  }
}

function resolveUploadSecret(req: MedusaRequest): string {
  const configModule = req.scope.resolve<ConfigModule>(ContainerRegistrationKeys.CONFIG_MODULE)
  const http = configModule.projectConfig.http
  const secret = typeof http.jwtSecret === 'string' && http.jwtSecret ? http.jwtSecret : http.cookieSecret
  if (!secret) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      'Attachments need projectConfig.http.jwtSecret or cookieSecret to be set',
    )
  }
  return secret
}

function uploadOwner(req: MedusaRequest): string | null {
  const auth = (req as Partial<AuthenticatedMedusaRequest>).auth_context
  return auth?.actor_id ? `${auth.actor_type}:${auth.actor_id}` : null
}

function signUpload(secret: string, owner: string, fileId: string): string {
  return createHmac('sha256', secret)
    .update(`${UPLOAD_SIGNATURE_CONTEXT}\n${owner}\n${fileId}`)
    .digest('base64url')
}

function readUploadSignature(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url, URL_PARSE_BASE).searchParams.get(UPLOAD_SIGNATURE_PARAM)
  } catch {
    return null
  }
}

/**
 * True when every attachment carries the upload signature issued to this request's actor
 * by `handleFileUpload` (inside the `url` it returned). Clients send back the attachment
 * objects the upload returned, `url` included.
 */
export function attachmentsUploadedBy(
  req: AuthenticatedMedusaRequest,
  attachments: TicketAttachmentInput[] | undefined,
): boolean {
  if (!attachments?.length) return true
  const owner = uploadOwner(req)
  if (!owner) return false
  const secret = resolveUploadSecret(req)
  return attachments.every((attachment) => {
    const given = readUploadSignature(attachment.url)
    if (!given) return false
    const expected = Buffer.from(signUpload(secret, owner, attachment.id))
    const actual = Buffer.from(given)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  })
}

export async function handleFileUpload(req: MedusaRequest): Promise<AttachmentResult[]> {
  const files = req.files as Express.Multer.File[]

  if (!files?.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, 'No files were uploaded')
  }

  if (files.length > MAX_FILES_PER_MESSAGE) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Maximum ${MAX_FILES_PER_MESSAGE} files allowed per message`,
    )
  }

  for (let i = 0; i < files.length; i++) {
    validateFile(files[i])
  }

  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: files.map((file) => ({
        filename: file.originalname,
        mimeType: getMimeType(file),
        content: file.buffer.toString('base64'),
        access: 'private' as const,
      })),
    },
  })

  if (!result || (Array.isArray(result) && result.length === 0)) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, 'File upload did not return results')
  }

  const resultArray = Array.isArray(result) ? result : [result]
  // Unauthenticated callers (the inbound email webhook) get no signature: they never post
  // the result back as a message attachment.
  const owner = uploadOwner(req)
  const secret = owner ? resolveUploadSecret(req) : null
  const pendingUrl = (fileId: string) =>
    owner && secret
      ? `${buildPendingAttachmentUrl(fileId)}?${UPLOAD_SIGNATURE_PARAM}=${signUpload(secret, owner, fileId)}`
      : buildPendingAttachmentUrl(fileId)

  return resultArray.map((file, index) => ({
    id: file.id,
    url: pendingUrl(file.id),
    filename: files[index].originalname,
    mimeType: getMimeType(files[index]),
    size: files[index].size,
  }))
}
