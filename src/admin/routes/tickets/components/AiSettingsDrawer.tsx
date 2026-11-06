import {
  Button,
  Drawer,
  Heading,
  Input,
  Label,
  Select,
  Switch,
  Text,
  Textarea,
  toast,
} from '@medusajs/ui'
import { useEffect, useState } from 'react'
import { CONFIDENCE_THRESHOLD_LABEL, BLOCKED_CATEGORIES_LABEL } from '../lib/ai-policy'
import {
  fetchAISettings,
  saveAIEnabled,
  saveAutoReplyEnabled,
  saveProviderConfig,
  type ProviderSettings,
  type PromptSettings,
} from '../lib/ai'

const PROVIDER_OPTIONS = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)' },
]

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSettingsChanged?: () => void
}

const initialProvider: ProviderSettings = {
  provider: '',
  model: '',
  base_url: '',
  has_api_key: false,
  api_key_preview: '',
}

const initialPrompts: PromptSettings = {
  analysis_system_prompt: '',
  response_system_prompt: '',
  escalation_rules: '',
}

export const AiSettingsDrawer = ({ open, onOpenChange, onSettingsChanged }: Props) => {
  const [aiEnabled, setAiEnabled] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const [loadingToggle, setLoadingToggle] = useState(false)
  const [loadingAutoReplyToggle, setLoadingAutoReplyToggle] = useState(false)

  const [provider, setProvider] = useState<ProviderSettings>(initialProvider)
  const [prompts, setPrompts] = useState<PromptSettings>(initialPrompts)
  const [editingApiKey, setEditingApiKey] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingSettings, setLoadingSettings] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingSettings(true)
    fetchAISettings()
      .then((data) => {
        if (cancelled) return
        setAiEnabled(data.enabled)
        setConfigured(Boolean(data.configured))
        setAutoReplyEnabled(data.auto_reply_enabled)
        setProvider(data.provider)
        setPrompts(data.prompts)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[ai-settings-drawer] fetchAISettings failed', error)
        toast.error('Could not load AI settings', {
          description: error instanceof Error ? error.message : undefined,
        })
      })
      .finally(() => {
        if (!cancelled) setLoadingSettings(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const handleProviderChange = (next: string) => {
    setProvider((prev) => ({
      ...prev,
      provider: next,
    }))
  }

  const handleToggleAI = async (checked: boolean) => {
    setLoadingToggle(true)
    try {
      const data = await saveAIEnabled(checked)
      setAiEnabled(data.enabled)
      toast.success(checked ? 'AI suggestions turned on' : 'AI suggestions turned off')
      onSettingsChanged?.()
    } catch (error) {
      console.error('[ai-settings-drawer] saveAIEnabled failed', error)
      toast.error('Could not update AI settings', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setLoadingToggle(false)
    }
  }

  const handleToggleAutoReply = async (checked: boolean) => {
    setLoadingAutoReplyToggle(true)
    try {
      const data = await saveAutoReplyEnabled(checked)
      setAutoReplyEnabled(data.auto_reply_enabled)
      toast.success(checked ? 'Auto-reply turned on' : 'Auto-reply turned off')
      onSettingsChanged?.()
    } catch (error) {
      console.error('[ai-settings-drawer] saveAutoReplyEnabled failed', error)
      toast.error('Could not update auto-reply', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setLoadingAutoReplyToggle(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: Parameters<typeof saveProviderConfig>[0] = {
        provider: provider.provider,
        model: provider.model,
        base_url: provider.base_url,
        analysis_system_prompt: prompts.analysis_system_prompt,
        response_system_prompt: prompts.response_system_prompt,
        escalation_rules: prompts.escalation_rules,
      }
      if (editingApiKey && apiKeyInput) {
        payload.api_key = apiKeyInput
      }
      const data = (await saveProviderConfig(payload)) as Awaited<
        ReturnType<typeof saveProviderConfig>
      > & { configured?: boolean }
      setProvider(data.provider)
      setPrompts(data.prompts)
      setConfigured(Boolean(data.configured))
      setEditingApiKey(false)
      setApiKeyInput('')
      toast.success('Settings saved')
      onSettingsChanged?.()
      onOpenChange(false)
    } catch (error) {
      console.error('[ai-settings-drawer] saveProviderConfig failed', error)
      toast.error('Could not save AI settings', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content className="!max-w-[640px]">
        <Drawer.Header>
          <Drawer.Title>AI settings</Drawer.Title>
          <Drawer.Description>
            The AI reads new tickets and suggests a category, a priority and a reply.
          </Drawer.Description>
        </Drawer.Header>

        <Drawer.Body className="space-y-8 overflow-y-auto">
          {loadingSettings ? (
            <Text className="text-ui-fg-subtle">Loading settings…</Text>
          ) : (
            <>
              <div
                className={`rounded-lg border p-4 ${configured ? 'bg-ui-bg-subtle' : 'bg-ui-tag-orange-bg border-ui-tag-orange-border'}`}
              >
                <Text size="small" weight="plus">
                  {!configured
                    ? 'Not set up: AI suggestions cannot run'
                    : aiEnabled
                      ? 'Set up and on'
                      : 'Set up, but turned off'}
                </Text>
                <Text size="small" className="text-ui-fg-subtle mt-1">
                  {!configured
                    ? 'No AI provider key is configured for this shop, so tickets are not analyzed even when the switch below is on.'
                    : 'New tickets are analyzed when they arrive.'}{' '}
                  Each analysis or suggestion is a paid request to the AI provider.
                </Text>
              </div>

              <section className="bg-ui-bg-base space-y-4 rounded-xl border p-6 shadow-sm">
                <Heading level="h3">Provider</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  Usually filled from the shop's AI gateway settings. Change only if you know the
                  provider details.
                </Text>
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="ai-provider">Model Provider</Label>
                    <Select value={provider.provider} onValueChange={handleProviderChange}>
                      <Select.Trigger id="ai-provider" className="mt-1">
                        <Select.Value placeholder="Select provider" />
                      </Select.Trigger>
                      <Select.Content>
                        {PROVIDER_OPTIONS.map((o) => (
                          <Select.Item key={o.value} value={o.value}>
                            {o.label}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="ai-model">Model Name</Label>
                    <Input
                      id="ai-model"
                      className="mt-1"
                      value={provider.model}
                      onChange={(e) => setProvider((p) => ({ ...p, model: e.target.value }))}
                      placeholder="Enter model name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ai-base-url">Base URL</Label>
                    <Input
                      id="ai-base-url"
                      className="mt-1"
                      value={provider.base_url}
                      onChange={(e) => setProvider((p) => ({ ...p, base_url: e.target.value }))}
                      placeholder="https://provider.example/v1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="ai-api-key">API Key</Label>
                    <div className="mt-1 flex gap-2">
                      <Input
                        id="ai-api-key"
                        type="password"
                        value={editingApiKey ? apiKeyInput : provider.api_key_preview}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        disabled={!editingApiKey}
                        placeholder={provider.has_api_key ? '••••••••' : 'Enter API key'}
                      />
                      {!editingApiKey ? (
                        <Button variant="secondary" onClick={() => setEditingApiKey(true)}>
                          Edit
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditingApiKey(false)
                            setApiKeyInput('')
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="bg-ui-bg-base space-y-4 rounded-xl border p-6 shadow-sm">
                <Heading level="h3">Automation</Heading>
                <div className="flex items-start justify-between">
                  <div>
                    <Text weight="plus">AI suggestions</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      Analyze new tickets and suggest replies. Nothing is sent to customers.
                    </Text>
                  </div>
                  <Switch
                    checked={aiEnabled}
                    onCheckedChange={handleToggleAI}
                    disabled={loadingToggle}
                  />
                </div>
                <div className="flex items-start justify-between">
                  <div>
                    <Text weight="plus">Auto-reply</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      Send the suggested reply to the customer without a human, when the rules below
                      allow it. Off by default.
                    </Text>
                  </div>
                  <Switch
                    checked={autoReplyEnabled}
                    onCheckedChange={handleToggleAutoReply}
                    disabled={loadingAutoReplyToggle}
                  />
                </div>
                <div className="bg-ui-bg-subtle text-ui-fg-subtle border-ui-border-base rounded-lg border p-4 text-xs">
                  <Text size="xsmall" weight="plus" className="mb-1">
                    When auto-reply sends
                  </Text>
                  <Text size="xsmall">
                    Only when the AI is at least {CONFIDENCE_THRESHOLD_LABEL} confident in its reply
                    and the ticket is not about {BLOCKED_CATEGORIES_LABEL}. Everything else waits
                    for a human.
                  </Text>
                </div>
              </section>

              <section className="bg-ui-bg-base space-y-4 rounded-xl border p-6 shadow-sm">
                <Heading level="h3">Instructions for the AI</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  Optional. Leave empty to use the built-in instructions.
                </Text>
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="ai-analysis-prompt">How to classify tickets</Label>
                    <Textarea
                      id="ai-analysis-prompt"
                      className="mt-1 font-mono text-xs leading-relaxed"
                      rows={4}
                      value={prompts.analysis_system_prompt}
                      onChange={(e) =>
                        setPrompts((p) => ({
                          ...p,
                          analysis_system_prompt: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="ai-escalation-prompt">When to alert a human</Label>
                    <Textarea
                      id="ai-escalation-prompt"
                      className="mt-1 font-mono text-xs leading-relaxed"
                      rows={3}
                      value={prompts.escalation_rules}
                      onChange={(e) =>
                        setPrompts((p) => ({
                          ...p,
                          escalation_rules: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="ai-response-prompt">Tone of suggested replies</Label>
                    <Textarea
                      id="ai-response-prompt"
                      className="mt-1 font-mono text-xs leading-relaxed"
                      rows={4}
                      value={prompts.response_system_prompt}
                      onChange={(e) =>
                        setPrompts((p) => ({
                          ...p,
                          response_system_prompt: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </section>
            </>
          )}
        </Drawer.Body>

        <Drawer.Footer>
          <Drawer.Close asChild>
            <Button variant="secondary">Close</Button>
          </Drawer.Close>
          <Button onClick={handleSave} isLoading={saving} disabled={loadingSettings}>
            Save settings
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}
