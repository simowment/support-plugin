import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { MedusaError } from '@medusajs/framework/utils'
import { uploadFilesWorkflow } from '@medusajs/medusa/core-flows'

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = req.auth_context?.actor_id
  if (!customerId) {
    return res.status(401).json({ success: false, error: 'Authentication required' })
  }

  const files = req.files as Express.Multer.File[]

  if (!files?.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, 'No files were uploaded')
  }

  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: files.map((file) => ({
        filename: file.originalname,
        mimeType: file.mimetype,
        content: file.buffer.toString('binary'),
        access: 'public' as const,
      })),
    },
  })

  const attachments = (Array.isArray(result) ? result : [result]).map((file, index) => ({
    url: file.url,
    filename: files[index].originalname,
    mimeType: files[index].mimetype,
    size: files[index].size,
  }))

  return res.status(201).json({ success: true, attachments })
}
