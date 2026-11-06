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

/**
 * Posts an AI escalation to a Discord-compatible webhook. No-op when no webhook URL is
 * configured (`discord_webhook_url` option or DISCORD_WEBHOOK_URL).
 */
export async function sendEscalation(
  payload: EscalationPayload,
  logger: Logger | undefined,
  webhookUrl: string | undefined,
): Promise<void> {
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
