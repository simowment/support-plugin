import { adminFetch } from '../../../lib/api'
import type { SettingSourceKind } from '../../../components/ui/settings-page'

/** One value with where it comes from (Set here, Set on the host, Default). */
export type Sourced<T> = { value: T; source: SettingSourceKind }

export type SupportSettings = {
  email_customer_replies: Sourced<boolean>
  discord_notifications: Sourced<boolean>
  host: {
    inbound_email_enabled: boolean
    inbound_recipients: string[]
    reply_email_domain: string | null
    mailgun_signing_key_set: boolean
    support_email: string | null
    discord_webhook_set: boolean
    email_queue_module: string
    email_queue_registered: boolean
    shop_slug: string | null
  }
  setup_help: { text: string | null; url: string | null } | null
  ai: {
    enabled: Sourced<boolean>
    auto_reply_enabled: Sourced<boolean>
    auto_reply_min_confidence: Sourced<number> & { default: number; min: number }
    blocked_categories: string[]
    configured: boolean
    provider: {
      provider: string
      model: string
      base_url: string
      has_api_key: boolean
      sources: Record<'provider' | 'api_key' | 'model' | 'base_url', SettingSourceKind>
    }
    prompts: {
      analysis_system_prompt: string
      response_system_prompt: string
      escalation_rules: string
      sources: Record<
        'analysis_system_prompt' | 'response_system_prompt' | 'escalation_rules',
        SettingSourceKind
      >
    }
    host: {
      api_key_set: boolean
      model: string | null
      base_url: string | null
      provider: string | null
      extra_headers: number
      encryption_key_set: boolean
    }
  } | null
}

export type SupportSettingsPatch = {
  email_customer_replies?: boolean | null
  discord_notifications?: boolean | null
  ai_enabled?: boolean
  auto_reply_enabled?: boolean
  auto_reply_min_confidence?: number | null
}

const ENDPOINT = '/admin/tickets/settings'

export const fetchSupportSettings = () => adminFetch<SupportSettings>(ENDPOINT)

export const saveSupportSettings = (patch: SupportSettingsPatch) =>
  adminFetch<SupportSettings>(ENDPOINT, { method: 'POST', body: patch })
