/**
 * Single place where the support-tickets plugin resolves its configuration.
 *
 * Every tunable is a module option. Environment variables are read here only, as a
 * backward-compatible fallback when the matching option is not set.
 */

type Env = Record<string, string | undefined>

function getEnv(): Env {
  return (globalThis.process?.env ?? {}) as Env
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return undefined
}

function stringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Support ticket module (`modules/support-ticket`)
// ---------------------------------------------------------------------------

export type SupportTicketModuleOptions = {
  /** Enables POST /hooks/mailgun/inbound. Env fallback: SUPPORT_MAILGUN_INBOUND_ENABLED ("true"). Default: false. */
  mailgun_inbound_enabled?: boolean
  /** Mailgun HTTP webhook signing key. Env fallback: MAILGUN_WEBHOOK_SIGNING_KEY. */
  mailgun_webhook_signing_key?: string
  /** Mailbox addresses that open new tickets. Env fallback: SUPPORT_INBOUND_RECIPIENTS (comma separated). */
  inbound_recipients?: string[] | string
  /** Domain used for `reply+<token>@<domain>` guest reply addresses. Env fallback: SUPPORT_REPLY_EMAIL_DOMAIN. */
  reply_email_domain?: string
  /** Discord-compatible webhook for ticket notifications and AI escalations. Env fallback: DISCORD_WEBHOOK_URL. */
  discord_webhook_url?: string
  /**
   * Container key of the email queue used to send guest email replies. The service must
   * implement `enqueue`, `getJob` and `getJobByIdempotencyKey`. Default: "emailQueue".
   */
  email_queue_module?: string
  [key: string]: unknown
}

export const DEFAULT_EMAIL_QUEUE_MODULE = 'emailQueue'

export type ResolvedSupportTicketConfig = {
  mailgunInboundEnabled: boolean
  mailgunWebhookSigningKey?: string
  inboundRecipients: string[]
  replyEmailDomain?: string
  discordWebhookUrl?: string
  emailQueueModule: string
}

export function resolveSupportTicketConfig(
  options: SupportTicketModuleOptions = {},
  env: Env = getEnv(),
): ResolvedSupportTicketConfig {
  return {
    mailgunInboundEnabled:
      optionalBoolean(options.mailgun_inbound_enabled) ??
      env.SUPPORT_MAILGUN_INBOUND_ENABLED === 'true',
    mailgunWebhookSigningKey:
      optionalString(options.mailgun_webhook_signing_key) ??
      optionalString(env.MAILGUN_WEBHOOK_SIGNING_KEY),
    inboundRecipients:
      stringList(options.inbound_recipients) ?? stringList(env.SUPPORT_INBOUND_RECIPIENTS) ?? [],
    replyEmailDomain: (
      optionalString(options.reply_email_domain) ?? optionalString(env.SUPPORT_REPLY_EMAIL_DOMAIN)
    )?.toLowerCase(),
    discordWebhookUrl:
      optionalString(options.discord_webhook_url) ?? optionalString(env.DISCORD_WEBHOOK_URL),
    emailQueueModule: optionalString(options.email_queue_module) ?? DEFAULT_EMAIL_QUEUE_MODULE,
  }
}

// ---------------------------------------------------------------------------
// Support ticket AI module (`modules/ai`)
// ---------------------------------------------------------------------------

/** Provider label used when neither the admin settings nor `default_provider` set one. */
export const DEFAULT_AI_PROVIDER = 'openrouter'

/**
 * Base URL fragments that identify a Portkey-compatible gateway. When the configured
 * base URL matches one of these and no routing header is present, the plugin adds an
 * `x-portkey-provider` header with the provider name.
 */
export const DEFAULT_PORTKEY_GATEWAY_MARKERS = [
  'ai-gateway:',
  'host.docker.internal:8787',
  'localhost:8787',
  '127.0.0.1:8787',
  'api.portkey.ai',
]

export const AI_KEY_ENCRYPTION_KEY_ENV = 'SUPPORT_TICKET_AI_KEY_ENCRYPTION_KEY'

export type SupportTicketAiModuleOptions = {
  /** Fallback API key for an OpenAI-compatible endpoint when none is saved in the admin. */
  openai_api_key?: string
  /** Fallback model id. */
  openai_model?: string
  /** Fallback OpenAI-compatible base URL. */
  openai_base_url?: string
  /** Extra HTTP headers sent with every AI request. */
  openai_headers?: Record<string, string>
  /** Provider label used when none is saved in the admin. Default: "openrouter". */
  default_provider?: string
  /** Secret used to encrypt API keys saved from the admin. Env fallback: SUPPORT_TICKET_AI_KEY_ENCRYPTION_KEY. */
  api_key_encryption_key?: string
  /** Base URL fragments treated as a Portkey gateway. Default: DEFAULT_PORTKEY_GATEWAY_MARKERS. */
  portkey_gateway_markers?: string[]
  [key: string]: unknown
}

export function resolveAiKeyEncryptionSecret(
  options: Pick<SupportTicketAiModuleOptions, 'api_key_encryption_key'> = {},
  env: Env = getEnv(),
): string | undefined {
  return (
    optionalString(options.api_key_encryption_key) ?? optionalString(env[AI_KEY_ENCRYPTION_KEY_ENV])
  )
}

const PORTKEY_PROVIDER_HEADER = 'x-portkey-provider'
const PORTKEY_CONFIG_HEADER = 'x-portkey-config'

/** Adds the Portkey provider routing header when the base URL points at a Portkey gateway. */
export function resolveGatewayHeaders(input: {
  baseUrl?: string
  headers?: Record<string, string>
  provider?: string
  markers?: string[]
}): Record<string, string> {
  const headers = input.headers ?? {}
  const baseUrl = input.baseUrl?.trim().toLowerCase()
  const markers = input.markers ?? DEFAULT_PORTKEY_GATEWAY_MARKERS
  if (!baseUrl || !markers.some((marker) => baseUrl.includes(marker.toLowerCase()))) {
    return headers
  }

  const headerNames = new Set(Object.keys(headers).map((name) => name.trim().toLowerCase()))
  if (headerNames.has(PORTKEY_PROVIDER_HEADER) || headerNames.has(PORTKEY_CONFIG_HEADER)) {
    return headers
  }

  return {
    ...headers,
    [PORTKEY_PROVIDER_HEADER]: optionalString(input.provider) ?? DEFAULT_AI_PROVIDER,
  }
}
