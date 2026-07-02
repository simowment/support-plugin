import { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { handleFileUpload } from '../../../shared/upload'

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const attachments = await handleFileUpload(req)
  return res.status(201).json({ success: true, attachments })
}
