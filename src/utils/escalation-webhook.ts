import type { Logger } from '@medusajs/framework/types'

type EscalationPayload = {
  ticketId: string
  subject: string
  reason: string
  message: string
}

const MAX_DESCRIPTION_LENGTH = 500

function truncateAtWord(description: string, maxLength: number): string {
  if (description.length <= maxLength) return description

  let truncated = description.slice(0, maxLength)
  const lastSpace = truncated.lastIndexOf(' ')
  if (lastSpace > maxLength * 0.8) {
    truncated = truncated.slice(0, lastSpace)
  }
  return truncated + '…'
}

export async function sendEscalation(payload: EscalationPayload, logger?: Logger): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (!webhookUrl) {
    return
  }

  const fields = [
    { name: 'Ticket', value: payload.ticketId, inline: true },
    { name: 'Reason', value: payload.reason, inline: true },
  ]

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `⚠️ **Ticket Escalation** — ${payload.subject}`,
        embeds: [
          {
            color: 0xff0000,
            title: payload.subject,
            description: truncateAtWord(payload.message, MAX_DESCRIPTION_LENGTH),
            fields,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    })
  } catch (error) {
    logger?.warn(`[support-ticket-ai] Failed to send escalation webhook: ${error}`)
  }
}
