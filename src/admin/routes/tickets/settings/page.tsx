import { defineRouteConfig } from '@medusajs/admin-sdk'
import { Button, Input, Select, Switch, Text, Textarea, toast } from '@medusajs/ui'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '../../../components/ui/error-state'
import { InstallerCode, InstallerHint } from '../../../components/ui/installer-hint'
import { SaveBar, SavedAutomatically } from '../../../components/ui/save-bar'
import {
  HostSettingRow,
  SettingRow,
  SettingsPage,
  SettingsSection,
} from '../../../components/ui/settings-page'
import { formatList } from '../../../components/ui/format'
import { useUnsavedGuard } from '../../../components/ui/use-unsaved-guard'
import { saveProviderConfig } from '../lib/ai'
import {
  fetchSupportSettings,
  saveSupportSettings,
  type SupportSettings,
  type SupportSettingsPatch,
} from '../lib/settings'

const PROVIDER_OPTIONS = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)' },
]

const igm = (slug: string | null, command: string) =>
  `node cli/bin/igm.mjs shop ${command} --shop ${slug ?? '<slug>'}`

/**
 * A setting changed in the shop's .env on the host (no igm command of its own): the state,
 * then under Technical details the line to add and the command that applies it. Built
 * here because the kit's HostSettingRow takes a single command.
 */
function EnvFileRow({
  label,
  help,
  state,
  ok,
  line,
  slug,
}: {
  label: string
  help?: ReactNode
  state: ReactNode
  ok?: boolean
  line: string
  slug: string | null
}) {
  return (
    <SettingRow
      label={label}
      help={help}
      source="host"
      control={
        <Text
          size="small"
          className={ok === false ? 'text-ui-fg-error' : ok ? 'text-ui-fg-base' : 'text-ui-fg-subtle'}
        >
          {state}
        </Text>
      }
      technical={
        <div className="flex flex-col gap-2">
          <Text size="xsmall" className="text-ui-fg-subtle">
            Add or change this line in <code className="font-mono">shops/{slug ?? '<slug>'}/.env</code>:
          </Text>
          <InstallerCode>{line}</InstallerCode>
          <Text size="xsmall" className="text-ui-fg-subtle">
            Then apply it (restarts the backend):
          </Text>
          <InstallerCode>{igm(slug, 'up')}</InstallerCode>
        </div>
      }
    />
  )
}

/** A switch that saves on change (S6), with "Saved automatically" under it. */
function AutoSwitch({
  id,
  checked,
  disabled,
  onChange,
  resetToDefault,
}: {
  id: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  /** Shown when the value was set here: goes back to the default. */
  resetToDefault?: () => void
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
      <div className="flex flex-wrap items-center gap-x-3">
        <SavedAutomatically />
        {resetToDefault ? (
          <button
            type="button"
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover text-xs"
            onClick={resetToDefault}
            disabled={disabled}
          >
            Use the default
          </button>
        ) : null}
      </div>
    </div>
  )
}

type AiForm = {
  min_confidence: string
  provider: string
  model: string
  base_url: string
  api_key: string
  analysis_system_prompt: string
  response_system_prompt: string
  escalation_rules: string
}

function aiFormFrom(data: SupportSettings): AiForm | null {
  const ai = data.ai
  if (!ai) return null
  return {
    min_confidence:
      ai.auto_reply_min_confidence.source === 'admin'
        ? String(Math.round(ai.auto_reply_min_confidence.value * 100))
        : '',
    provider: ai.provider.provider,
    model: ai.provider.model,
    base_url: ai.provider.base_url,
    api_key: '',
    analysis_system_prompt: ai.prompts.analysis_system_prompt,
    response_system_prompt: ai.prompts.response_system_prompt,
    escalation_rules: ai.prompts.escalation_rules,
  }
}

const sameForm = (a: AiForm | null, b: AiForm | null) =>
  JSON.stringify(a) === JSON.stringify(b)

/** Percent text to a 0..1 confidence; null = use the default; undefined = invalid. */
function parseConfidence(text: string, min: number): number | null | undefined {
  const trimmed = text.trim()
  if (!trimmed) return null
  const percent = Number(trimmed)
  if (!Number.isFinite(percent) || percent < min * 100 || percent > 100) return undefined
  return Math.round(percent) / 100
}

/**
 * S12. Support inbox settings: every option the support plugin reads. Switches save at
 * once; the AI form saves with the bar at the bottom. Mail intake, the Discord webhook
 * and the AI keys are set on the host and shown with the exact command.
 */
const SupportSettingsPage = () => {
  const [data, setData] = useState<SupportSettings | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [savingSwitch, setSavingSwitch] = useState<string | null>(null)
  const [form, setForm] = useState<AiForm | null>(null)
  const [savedForm, setSavedForm] = useState<AiForm | null>(null)
  const [editingKey, setEditingKey] = useState(false)
  const [savingForm, setSavingForm] = useState(false)

  const apply = useCallback((next: SupportSettings, resetForm: boolean) => {
    setData(next)
    if (resetForm) {
      const nextForm = aiFormFrom(next)
      setForm(nextForm)
      setSavedForm(nextForm)
      setEditingKey(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      apply(await fetchSupportSettings(), true)
      setError(null)
    } catch (loadError) {
      setError(loadError)
    } finally {
      setLoading(false)
    }
  }, [apply])

  useEffect(() => {
    void load()
  }, [load])

  const dirty = !sameForm(form, savedForm)
  useUnsavedGuard(dirty)

  const saveSwitch = async (key: string, patch: SupportSettingsPatch, done: string) => {
    setSavingSwitch(key)
    try {
      apply(await saveSupportSettings(patch), false)
      toast.success(done)
    } catch (saveError) {
      toast.error('Could not save the setting', {
        description: saveError instanceof Error ? saveError.message : undefined,
      })
    } finally {
      setSavingSwitch(null)
    }
  }

  const ai = data?.ai ?? null
  const confidence = ai && form ? parseConfidence(form.min_confidence, ai.auto_reply_min_confidence.min) : null
  const providerChanged = Boolean(
    form &&
      savedForm &&
      (form.provider !== savedForm.provider ||
        form.model !== savedForm.model ||
        form.base_url !== savedForm.base_url ||
        form.api_key.trim()),
  )
  // Model and base URL can be replaced but not emptied (the API refuses an empty value).
  const providerInvalid = Boolean(
    form && providerChanged && (!form.model.trim() || !form.base_url.trim()),
  )
  const formInvalid = confidence === undefined || providerInvalid

  const saveForm = async () => {
    if (!form || !savedForm || !ai || confidence === undefined) return
    setSavingForm(true)
    try {
      if (form.min_confidence !== savedForm.min_confidence) {
        await saveSupportSettings({ auto_reply_min_confidence: confidence })
      }
      const promptsChanged =
        form.analysis_system_prompt !== savedForm.analysis_system_prompt ||
        form.response_system_prompt !== savedForm.response_system_prompt ||
        form.escalation_rules !== savedForm.escalation_rules
      if (providerChanged || promptsChanged) {
        await saveProviderConfig({
          ...(providerChanged
            ? {
                provider: form.provider || undefined,
                model: form.model.trim(),
                base_url: form.base_url.trim(),
                ...(form.api_key.trim() ? { api_key: form.api_key.trim() } : {}),
              }
            : {}),
          ...(promptsChanged
            ? {
                analysis_system_prompt: form.analysis_system_prompt,
                response_system_prompt: form.response_system_prompt,
                escalation_rules: form.escalation_rules,
              }
            : {}),
        })
      }
      apply(await fetchSupportSettings(), true)
      toast.success('AI settings saved')
    } catch (saveError) {
      toast.error('Could not save the AI settings', {
        description: saveError instanceof Error ? saveError.message : undefined,
      })
    } finally {
      setSavingForm(false)
    }
  }

  const slug = data?.host.shop_slug ?? null
  const setField = (key: keyof AiForm) => (value: string) =>
    setForm((current) => (current ? { ...current, [key]: value } : current))

  const aiStatus = useMemo(() => {
    if (!ai) return null
    if (!ai.configured) return { ok: false, text: 'Not set up: tickets are not analyzed' }
    return ai.enabled.value
      ? { ok: true, text: 'Set up and on' }
      : { ok: undefined, text: 'Set up, but turned off' }
  }, [ai])

  return (
    <SettingsPage
      title="Support inbox settings"
      subtitle="How tickets arrive, how replies reach customers, alerts and AI suggestions."
      back={{ to: '/tickets', label: 'Support inbox' }}
    >
      {loading && !data ? (
        <Text size="small" className="text-ui-fg-subtle px-1">
          Checking…
        </Text>
      ) : null}
      {error ? (
        <ErrorState what="the support settings" error={error} onRetry={load} retrying={loading} />
      ) : null}

      {data ? (
        <>
          <SettingsSection
            id="replies"
            title="Replies to customers"
            description="What happens when you answer a ticket."
          >
            <SettingRow
              label="Email replies to signed-in customers"
              htmlFor="email-customer-replies"
              source={data.email_customer_replies.source}
              help={
                data.email_customer_replies.value
                  ? 'Your reply on a signed-in customer’s ticket is also emailed to them. People who wrote by email always get a reviewed draft instead (Save draft, then Send email).'
                  : 'Off: replies are only saved on the ticket. The customer sees them in their account.'
              }
              control={
                <AutoSwitch
                  id="email-customer-replies"
                  checked={data.email_customer_replies.value}
                  disabled={savingSwitch !== null}
                  onChange={(checked) =>
                    void saveSwitch(
                      'email_customer_replies',
                      { email_customer_replies: checked },
                      checked ? 'Replies are emailed' : 'Replies are no longer emailed',
                    )
                  }
                  resetToDefault={
                    data.email_customer_replies.source === 'admin'
                      ? () =>
                          void saveSwitch(
                            'email_customer_replies',
                            { email_customer_replies: null },
                            'Back to the default',
                          )
                      : undefined
                  }
                />
              }
              technical={
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Default from the module option <code className="font-mono">email_customer_replies</code>{' '}
                  (true when not set). Saved here in the <code className="font-mono">support_ticket_setting</code>{' '}
                  table.
                </Text>
              }
            />
            <SettingRow
              label="Email sending"
              source="host"
              help="The shop’s email service sends the replies. Its account and sender address are on the Email settings page."
              control={
                <div className="flex flex-col items-start gap-1">
                  <Text
                    size="small"
                    className={data.host.email_queue_registered ? 'text-ui-fg-base' : 'text-ui-fg-error'}
                  >
                    {data.host.email_queue_registered
                      ? 'Ready'
                      : 'Not available: replies cannot be emailed'}
                  </Text>
                  <Link
                    to="/settings/email"
                    className="txt-compact-small-plus text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                  >
                    Email settings
                  </Link>
                </div>
              }
              technical={
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Email queue container key: <code className="font-mono">{data.host.email_queue_module}</code>{' '}
                  (module option <code className="font-mono">email_queue_module</code>).
                </Text>
              }
            />
            <HostSettingRow
              label="Support mailbox"
              help="Reply-To of emailed replies when customer answers cannot come back to the ticket (no email intake)."
              state={data.host.support_email ?? 'Not set: answers go to the store’s sender address'}
              variable="SUPPORT_EMAIL (module option support_email)"
              command={`${igm(slug, 'configure mail')} < mail.json`}
            />
          </SettingsSection>

          <SettingsSection
            id="email-intake"
            title="Email intake"
            description="Emails to the support address become tickets, and guests can answer your emailed replies. Set on the host together with the shop’s Mailgun account."
          >
            <HostSettingRow
              label="Emails become tickets"
              state={data.host.inbound_email_enabled ? 'On' : 'Off: only the storefront contact form creates tickets'}
              ok={data.host.inbound_email_enabled ? true : undefined}
              variable="SUPPORT_MAILGUN_INBOUND_ENABLED (module option mailgun_inbound_enabled)"
              command={igm(slug, 'provision mail')}
            />
            <HostSettingRow
              label="Support addresses"
              help="Emails sent to these addresses open a ticket."
              state={
                data.host.inbound_recipients.length
                  ? formatList(data.host.inbound_recipients)
                  : 'None'
              }
              ok={data.host.inbound_email_enabled && !data.host.inbound_recipients.length ? false : undefined}
              variable="SUPPORT_INBOUND_RECIPIENTS (module option inbound_recipients, comma separated)"
              command={`${igm(slug, 'configure mail')} < mail.json`}
            />
            <HostSettingRow
              label="Reply domain"
              help="Your emailed replies carry a reply+code address at this domain, so the customer’s answer lands on the ticket."
              state={data.host.reply_email_domain ?? 'Not set: guests cannot get an email reply'}
              ok={data.host.inbound_email_enabled && !data.host.reply_email_domain ? false : undefined}
              variable="SUPPORT_REPLY_EMAIL_DOMAIN (module option reply_email_domain)"
              command={`${igm(slug, 'configure mail')} < mail.json`}
            />
            <HostSettingRow
              label="Mailgun webhook signing key"
              help="Proves that incoming emails really come from Mailgun. Without it, incoming emails are refused."
              state={data.host.mailgun_signing_key_set ? 'Set' : 'Not set'}
              ok={
                data.host.mailgun_signing_key_set
                  ? true
                  : data.host.inbound_email_enabled
                    ? false
                    : undefined
              }
              variable="MAILGUN_WEBHOOK_SIGNING_KEY (module option mailgun_webhook_signing_key)"
              command={`${igm(slug, 'configure mail')} < mail.json`}
            />
            <div className="px-6 py-4">
              <InstallerHint>
                <div className="flex flex-col gap-2">
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    New Mailgun setup with support replies (creates the routes and webhooks):
                  </Text>
                  <InstallerCode>{igm(slug, 'provision mail')}</InstallerCode>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Existing Mailgun account: pipe the mail settings as JSON on stdin, with the support
                    part in <code className="font-mono">support_inbound</code>:
                  </Text>
                  <InstallerCode>{`{"provider":"mailgun","api_key":"<key>","domain":"<mg.domain>","from":"<from>","region":"eu","webhook_signing_key":"<key>","support_inbound":{"enabled":true,"recipients":["support@<domain>"],"reply_domain":"<mg.domain>"}}`}</InstallerCode>
                  <InstallerCode>{`${igm(slug, 'configure mail')} < mail.json`}</InstallerCode>
                  {data.setup_help?.text ? (
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {data.setup_help.text}
                    </Text>
                  ) : null}
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Incoming emails arrive at <code className="font-mono">POST /hooks/mailgun/inbound</code>.
                  </Text>
                </div>
              </InstallerHint>
            </div>
          </SettingsSection>

          <SettingsSection
            id="notifications"
            title="Notifications"
            description={
              <>
                Ticket alerts in a Discord channel. Alerts for you about the store (approvals,
                critical alerts) are on{' '}
                <Link
                  to="/settings/notifications"
                  className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                >
                  Settings &gt; Notifications
                </Link>
                .
              </>
            }
          >
            <SettingRow
              label="Send ticket alerts to Discord"
              htmlFor="discord-notifications"
              source={data.discord_notifications.source}
              help={
                !data.host.discord_webhook_set
                  ? 'No Discord webhook is set on the host, so nothing is sent yet.'
                  : data.discord_notifications.value
                    ? 'A message for each new ticket, each customer reply and each ticket the AI flags for a human.'
                    : 'Off: nothing is sent to Discord.'
              }
              control={
                <AutoSwitch
                  id="discord-notifications"
                  checked={data.discord_notifications.value}
                  disabled={savingSwitch !== null}
                  onChange={(checked) =>
                    void saveSwitch(
                      'discord_notifications',
                      { discord_notifications: checked },
                      checked ? 'Discord alerts turned on' : 'Discord alerts turned off',
                    )
                  }
                  resetToDefault={
                    data.discord_notifications.source === 'admin'
                      ? () =>
                          void saveSwitch(
                            'discord_notifications',
                            { discord_notifications: null },
                            'Back to the default',
                          )
                      : undefined
                  }
                />
              }
            />
            <EnvFileRow
              label="Discord webhook"
              help="The address of the Discord channel that receives the alerts."
              state={data.host.discord_webhook_set ? 'Set' : 'Not set'}
              ok={data.host.discord_webhook_set ? true : undefined}
              line="DISCORD_WEBHOOK_URL=<Discord webhook URL>"
              slug={slug}
            />
          </SettingsSection>

          {ai && form ? (
            <SettingsSection
              id="ai"
              title="AI suggestions"
              description="The AI reads new tickets and suggests a category, a priority and a reply. Each analysis or suggestion is a paid request to the AI provider."
            >
              <SettingRow
                label="Status"
                control={
                  <Text
                    size="small"
                    className={
                      aiStatus?.ok === false
                        ? 'text-ui-fg-error'
                        : aiStatus?.ok
                          ? 'text-ui-fg-base'
                          : 'text-ui-fg-subtle'
                    }
                  >
                    {aiStatus?.text}
                  </Text>
                }
                help={
                  ai.configured
                    ? undefined
                    : 'Provider, model, address and API key must all be set (below, or on the host).'
                }
              />
              <SettingRow
                label="AI suggestions"
                htmlFor="ai-enabled"
                source={ai.enabled.source}
                help="Analyze new tickets and suggest replies. Nothing is sent to customers."
                control={
                  <AutoSwitch
                    id="ai-enabled"
                    checked={ai.enabled.value}
                    disabled={savingSwitch !== null}
                    onChange={(checked) =>
                      void saveSwitch(
                        'ai_enabled',
                        { ai_enabled: checked },
                        checked ? 'AI suggestions turned on' : 'AI suggestions turned off',
                      )
                    }
                  />
                }
              />
              <SettingRow
                label="Auto-reply"
                htmlFor="ai-auto-reply"
                source={ai.auto_reply_enabled.source}
                help={`Send the suggested reply to the customer without a human, when the AI is at least ${Math.round(ai.auto_reply_min_confidence.value * 100)}% confident and the ticket is not about ${ai.blocked_categories.map((category) => category.replace(/_/g, ' ')).join(', ')}. Everything else waits for a human.`}
                control={
                  <AutoSwitch
                    id="ai-auto-reply"
                    checked={ai.auto_reply_enabled.value}
                    disabled={savingSwitch !== null}
                    onChange={(checked) =>
                      void saveSwitch(
                        'auto_reply_enabled',
                        { auto_reply_enabled: checked },
                        checked ? 'Auto-reply turned on' : 'Auto-reply turned off',
                      )
                    }
                  />
                }
              />
              <SettingRow
                label="Minimum confidence for auto-reply"
                htmlFor="ai-min-confidence"
                source={ai.auto_reply_min_confidence.source}
                help={`From ${Math.round(ai.auto_reply_min_confidence.min * 100)}% to 100%. Leave empty for the default (${Math.round(ai.auto_reply_min_confidence.default * 100)}%).`}
                control={
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Input
                        id="ai-min-confidence"
                        type="number"
                        inputMode="numeric"
                        min={Math.round(ai.auto_reply_min_confidence.min * 100)}
                        max={100}
                        className="w-28"
                        placeholder={String(Math.round(ai.auto_reply_min_confidence.default * 100))}
                        value={form.min_confidence}
                        onChange={(event) => setField('min_confidence')(event.target.value)}
                        aria-invalid={confidence === undefined}
                      />
                      <Text size="small">%</Text>
                    </div>
                    {confidence === undefined ? (
                      <Text size="xsmall" className="text-ui-fg-error">
                        Enter a number from {Math.round(ai.auto_reply_min_confidence.min * 100)} to 100.
                      </Text>
                    ) : null}
                  </div>
                }
              />
              <SettingRow
                label="Topics never answered automatically"
                source="default"
                help="Tickets in these categories always wait for a human."
                control={
                  <Text size="small">
                    {ai.blocked_categories.map((category) => category.replace(/_/g, ' ')).join(', ')}
                  </Text>
                }
              />
              <SettingRow
                label="Provider"
                htmlFor="ai-provider"
                source={ai.provider.sources.provider}
                help="Usually filled from the shop’s AI gateway on the host. Change only if you know the provider details."
                control={
                  <Select value={form.provider} onValueChange={setField('provider')}>
                    <Select.Trigger id="ai-provider">
                      <Select.Value placeholder="Choose a provider" />
                    </Select.Trigger>
                    <Select.Content>
                      {PROVIDER_OPTIONS.map((option) => (
                        <Select.Item key={option.value} value={option.value}>
                          {option.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                }
              />
              <SettingRow
                label="Model"
                htmlFor="ai-model"
                source={ai.provider.sources.model}
                control={
                  <Input
                    id="ai-model"
                    value={form.model}
                    onChange={(event) => setField('model')(event.target.value)}
                    placeholder="Model id, for example openai/gpt-4o-mini"
                    aria-invalid={providerInvalid && !form.model.trim()}
                  />
                }
              />
              <SettingRow
                label="Base URL"
                htmlFor="ai-base-url"
                source={ai.provider.sources.base_url}
                help="The OpenAI-compatible API address of the provider or gateway."
                control={
                  <Input
                    id="ai-base-url"
                    value={form.base_url}
                    onChange={(event) => setField('base_url')(event.target.value)}
                    placeholder="https://provider.example/v1"
                    aria-invalid={providerInvalid && !form.base_url.trim()}
                  />
                }
              />
              <SettingRow
                label="API key"
                htmlFor="ai-api-key"
                source={ai.provider.sources.api_key}
                help={
                  !ai.host.encryption_key_set
                    ? 'A key can only be saved here once the host has an encryption key for it (see below).'
                    : ai.provider.has_api_key
                      ? 'A key is set. It is never shown; enter a new one to replace it.'
                      : 'No key is set.'
                }
                control={
                  editingKey ? (
                    <div className="flex gap-2">
                      <Input
                        id="ai-api-key"
                        type="password"
                        autoComplete="off"
                        value={form.api_key}
                        onChange={(event) => setField('api_key')(event.target.value)}
                        placeholder="New API key"
                      />
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => {
                          setEditingKey(false)
                          setField('api_key')('')
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Text size="small">{ai.provider.has_api_key ? 'Set' : 'Not set'}</Text>
                      <Button
                        variant="secondary"
                        size="small"
                        disabled={!ai.host.encryption_key_set}
                        onClick={() => setEditingKey(true)}
                      >
                        {ai.provider.has_api_key ? 'Replace' : 'Add a key'}
                      </Button>
                    </div>
                  )
                }
                technical={
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Saved encrypted (AES-256-GCM) in the <code className="font-mono">ai_setting</code> table.
                    A key saved here wins over the host’s gateway key.
                  </Text>
                }
              />
              <SettingRow
                label="How to classify tickets"
                htmlFor="ai-analysis-prompt"
                source={ai.prompts.sources.analysis_system_prompt}
                help="Optional instructions. Leave empty to use the built-in ones."
                control={
                  <Textarea
                    id="ai-analysis-prompt"
                    rows={4}
                    value={form.analysis_system_prompt}
                    onChange={(event) => setField('analysis_system_prompt')(event.target.value)}
                  />
                }
              />
              <SettingRow
                label="When to alert a human"
                htmlFor="ai-escalation-prompt"
                source={ai.prompts.sources.escalation_rules}
                help="Optional. A flagged ticket is also sent to Discord when ticket alerts are on."
                control={
                  <Textarea
                    id="ai-escalation-prompt"
                    rows={3}
                    value={form.escalation_rules}
                    onChange={(event) => setField('escalation_rules')(event.target.value)}
                  />
                }
              />
              <SettingRow
                label="Tone of suggested replies"
                htmlFor="ai-response-prompt"
                source={ai.prompts.sources.response_system_prompt}
                help="Optional. Leave empty to use the built-in instructions."
                control={
                  <Textarea
                    id="ai-response-prompt"
                    rows={4}
                    value={form.response_system_prompt}
                    onChange={(event) => setField('response_system_prompt')(event.target.value)}
                  />
                }
              />
              <EnvFileRow
                label="AI gateway key on the host"
                help="Used when no key is saved here."
                state={ai.host.api_key_set ? 'Set' : 'Not set'}
                ok={ai.host.api_key_set ? true : undefined}
                line="AI_GATEWAY_API_KEY=<key>"
                slug={slug}
              />
              <SettingRow
                label="AI gateway on the host"
                source="host"
                help="Model and address used when none is saved here."
                control={
                  <Text size="small" className="text-ui-fg-subtle break-all">
                    {[ai.host.model, ai.host.base_url].filter(Boolean).join(' · ') || 'Not set'}
                  </Text>
                }
                technical={
                  <div className="flex flex-col gap-2">
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Variables: <code className="font-mono">AI_GATEWAY_URL</code> or{' '}
                      <code className="font-mono">OPENAI_BASE_URL</code>;{' '}
                      <code className="font-mono">OPENAI_MODEL</code> or{' '}
                      <code className="font-mono">AI_MODEL</code>;{' '}
                      <code className="font-mono">AI_GATEWAY_PROVIDER</code>. Key:{' '}
                      <code className="font-mono">AI_GATEWAY_API_KEY</code>,{' '}
                      <code className="font-mono">OPENROUTER_API_KEY</code>,{' '}
                      <code className="font-mono">KILOCODE_API_KEY</code> or{' '}
                      <code className="font-mono">OPENAI_API_KEY</code> (first set wins). Extra
                      request headers: {ai.host.extra_headers}. Module options{' '}
                      <code className="font-mono">openai_base_url</code>,{' '}
                      <code className="font-mono">openai_model</code>,{' '}
                      <code className="font-mono">openai_api_key</code>,{' '}
                      <code className="font-mono">openai_headers</code>.
                    </Text>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Change them in <code className="font-mono">shops/{slug ?? '<slug>'}/.env</code>, then:
                    </Text>
                    <InstallerCode>{igm(slug, 'up')}</InstallerCode>
                  </div>
                }
              />
              <EnvFileRow
                label="Encryption key for saved API keys"
                help="Needed to save an API key here. Changing it makes a saved key unreadable; save the key again afterwards."
                state={ai.host.encryption_key_set ? 'Set' : 'Not set'}
                ok={ai.host.encryption_key_set ? true : undefined}
                line="SUPPORT_TICKET_AI_KEY_ENCRYPTION_KEY=<32 random bytes, hex>"
                slug={slug}
              />
            </SettingsSection>
          ) : null}

          <SaveBar
            dirty={dirty}
            saving={savingForm}
            disabled={formInvalid}
            onSave={saveForm}
            onDiscard={() => {
              setForm(savedForm)
              setEditingKey(false)
            }}
          />
        </>
      ) : null}
    </SettingsPage>
  )
}

export const config = defineRouteConfig({
  label: 'Settings',
  rank: 99,
})

export default SupportSettingsPage
