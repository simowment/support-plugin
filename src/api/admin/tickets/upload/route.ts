import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { handleFileUpload } from '../../../shared/upload'

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const attachments = await handleFileUpload(req, res)
  return res.status(201).json({ success: true, attachments })
}
