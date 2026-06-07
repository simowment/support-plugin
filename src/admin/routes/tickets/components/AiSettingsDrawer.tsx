import { Button, Drawer, Heading, Input, Label, Select, Switch, Text, Textarea, toast } from '@medusajs/ui'
import { useEffect, useState } from 'react'
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

const PROVIDER_BASE_URLS: Record<string, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  custom: '',
}

const DEFAULT_MODEL = 'gpt-4o'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSettingsChanged?: () => void
}

const initialProvider: ProviderSettings = {
  provider: 'openrouter',
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
        setAutoReplyEnabled(data.auto_reply_enabled)
        setProvider(data.provider)
        setPrompts(data.prompts)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[ai-settings-drawer] fetchAISettings failed', error)
        setAiEnabled(true)
        setAutoReplyEnabled(false)
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
      base_url: PROVIDER_BASE_URLS[next] ?? prev.base_url,
    }))
  }

  const handleToggleAI = async (checked: boolean) => {
    setLoadingToggle(true)
    try {
      const data = await saveAIEnabled(checked)
      setAiEnabled(data.enabled)
      toast.success(checked ? 'AI analysis enabled' : 'AI analysis disabled')
      onSettingsChanged?.()
    } catch (error) {
      console.error('[ai-settings-drawer] saveAIEnabled failed', error)
      toast.error('Failed to update AI settings')
    } finally {
      setLoadingToggle(false)
    }
  }

  const handleToggleAutoReply = async (checked: boolean) => {
    setLoadingAutoReplyToggle(true)
    try {
      const data = await saveAutoReplyEnabled(checked)
      setAutoReplyEnabled(data.auto_reply_enabled)
      toast.success(checked ? 'Auto-reply enabled' : 'Auto-reply disabled')
      onSettingsChanged?.()
    } catch (error) {
      console.error('[ai-settings-drawer] saveAutoReplyEnabled failed', error)
      toast.error('Failed to update auto-reply setting')
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
      const data = await saveProviderConfig(payload)
      setProvider(data.provider)
      setPrompts(data.prompts)
      setEditingApiKey(false)
      setApiKeyInput('')
      toast.success('Settings saved')
      onSettingsChanged?.()
      onOpenChange(false)
    } catch (error) {
      console.error('[ai-settings-drawer] saveProviderConfig failed', error)
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content className="!max-w-[640px]">
        <Drawer.Header>
          <Drawer.Title>AI Assistant Settings</Drawer.Title>
          <Drawer.Description>
            Provider, prompts, and automation policy used by the AI engine.
          </Drawer.Description>
        </Drawer.Header>

        <Drawer.Body className="space-y-8">
          {loadingSettings ? (
            <Text className="text-ui-fg-subtle">Loading settings…</Text>
          ) : (
            <>
              <section className="rounded-xl border bg-ui-bg-base p-6 shadow-sm space-y-4">
                <Heading level="h3">Provider</Heading>
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="ai-provider">Model Provider</Label>
                    <Select value={provider.provider} onValueChange={handleProviderChange}>
                      <Select.Trigger id="ai-provider" className="mt-1">
                        <Select.Value />
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
                      onChange={(e) =>
                        setProvider((p) => ({ ...p, model: e.target.value }))
                      }
                      placeholder={DEFAULT_MODEL}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ai-base-url">Base URL</Label>
                    <Input
                      id="ai-base-url"
                      className="mt-1"
                      value={provider.base_url}
                      onChange={(e) =>
                        setProvider((p) => ({ ...p, base_url: e.target.value }))
                      }
                      placeholder="https://api.openai.com/v1"
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
                        placeholder={
                          provider.has_api_key ? '••••••••' : 'Enter API key'
                        }
                      />
                      {!editingApiKey ? (
                        <Button
                          variant="secondary"
                          onClick={() => setEditingApiKey(true)}
                        >
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

              <section className="rounded-xl border bg-ui-bg-base p-6 shadow-sm space-y-4">
                <Heading level="h3">Automation</Heading>
                <div className="flex items-start justify-between">
                  <div>
                    <Text weight="plus">AI Analysis</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      Run the AI engine on new and updated tickets.
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
                    <Text weight="plus">Direct Automation</Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      Auto-reply when confidence is high and no sensitive keywords are
                      detected.
                    </Text>
                  </div>
                  <Switch
                    checked={autoReplyEnabled}
                    onCheckedChange={handleToggleAutoReply}
                    disabled={loadingAutoReplyToggle}
                  />
                </div>
                <div className="p-4 rounded-lg bg-ui-bg-subtle text-ui-fg-subtle text-xs border border-ui-border-base">
                  <Text size="xsmall" weight="plus" className="mb-1 uppercase tracking-tight">
                    Safety Protocol
                  </Text>
                  <Text size="xsmall">
                    AI only replies automatically when confidence &gt; 90% and no sensitive
                    keywords (refund, legal, fraud) are detected.
                  </Text>
                </div>
              </section>

              <section className="rounded-xl border bg-ui-bg-base p-6 shadow-sm space-y-4">
                <Heading level="h3">System Prompts</Heading>
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="ai-analysis-prompt">Triage &amp; Analysis Logic</Label>
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
                    <Label htmlFor="ai-escalation-prompt">Strict Escalation Rules</Label>
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
                    <Label htmlFor="ai-response-prompt">Voice &amp; Tone Profile</Label>
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
            Save All Settings
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}
