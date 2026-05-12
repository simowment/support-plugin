import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { MedusaError } from '@medusajs/framework/utils'
import { uploadFilesWorkflow } from '@medusajs/medusa/core-flows'
import { MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES } from './helpers'

type AttachmentResult = {
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

function validateFile(file: Express.Multer.File, index: number) {
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

export async function handleFileUpload(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<AttachmentResult[]> {
  const files = req.files as Express.Multer.File[]

  if (!files?.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, 'No files were uploaded')
  }

  for (let i = 0; i < files.length; i++) {
    validateFile(files[i], i)
  }

  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: files.map((file) => ({
        filename: file.originalname,
        mimeType: getMimeType(file),
        content: file.buffer.toString('base64'),
        access: 'public' as const,
      })),
    },
  })

  if (!result || (Array.isArray(result) && result.length === 0)) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, 'File upload did not return results')
  }

  const resultArray = Array.isArray(result) ? result : [result]

  return resultArray.map((file, index) => ({
    url: file.url,
    filename: files[index].originalname,
    mimeType: getMimeType(files[index]),
    size: files[index].size,
  }))
}
