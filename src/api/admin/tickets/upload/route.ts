import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { requireAdminAuth } from '../../../shared/helpers'
import { handleFileUpload } from '../../../shared/upload'

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const adminId = requireAdminAuth(req, res)
  if (!adminId) return

  const attachments = await handleFileUpload(req)
  return res.status(201).json({ success: true, attachments })
}
