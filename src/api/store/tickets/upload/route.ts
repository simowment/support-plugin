import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { requireAuth } from '../../../shared/helpers'
import { handleFileUpload } from '../../../shared/upload'

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const customerId = requireAuth(req, res)
  if (!customerId) return

  const attachments = await handleFileUpload(req, res)
  return res.status(201).json({ success: true, attachments })
}
