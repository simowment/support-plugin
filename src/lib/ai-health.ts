import { AiProviderError } from '../modules/ai/providers/openai-provider'
import { syncStoreProblem } from './store-problem'

/**
 * Store problem "AI ticket analysis is failing". Raised at once on a configuration error
 * (HTTP 401/402/403/404, connection refused, host not found, missing instructions), and after
 * `TRANSIENT_FAILURES_BEFORE_PROBLEM` consecutive other failures (timeouts, HTTP 429/5xx,
 * unusable replies). The next successful AI answer, or turning AI suggestions off, resolves it.
 */
export const TICKET_AI_PROBLEM = {
  type: 'ai_ticket_analysis_failing',
  resourceType: 'support_ticket_ai',
  resourceId: 'ai',
} as const

export const TRANSIENT_FAILURES_BEFORE_PROBLEM = 3

/** Where the fix is (Support inbox > Settings, AI tab). */
export const TICKET_AI_SETTINGS_PATH = '/tickets/settings#ai'

type Resolver = { resolve: (name: string) => unknown }
type Log = { warn: (message: string) => void }

// Per process: the server (manual analysis) and the worker (subscriber) count separately, and
// a restart starts again. Clearing always asks the Store problems list (one query), so a
// success in one process clears a problem the other raised.
let consecutiveFailures = 0

/**
 * Only provider failures count; a database or code error says nothing about the AI service.
 * Checked by shape as well as class, in case the module and the routes load separate copies.
 */
export function isAiProviderFailure(error: unknown): error is AiProviderError {
  if (error instanceof AiProviderError) return true
  if (!(error instanceof Error)) return false
  const candidate = error as Error & { kind?: unknown; label?: unknown }
  return (
    (candidate.name === 'AiProviderError' || candidate.name === 'ProviderAuthError') &&
    (candidate.kind === 'config' || candidate.kind === 'transient') &&
    typeof candidate.label === 'string'
  )
}

/**
 * Records one AI call: `error` undefined for a success, else the thrown error. Errors that are
 * not AI provider failures are ignored. Never throws.
 */
export async function recordTicketAiOutcome(
  container: Resolver,
  error: unknown,
  details: { model?: string | null; feature: 'analysis' | 'suggested reply' },
  log?: Log,
): Promise<void> {
  if (error === undefined) {
    consecutiveFailures = 0
    await clearTicketAiProblem(container, 'The AI provider answered again.', log)
    return
  }
  if (!isAiProviderFailure(error)) return

  consecutiveFailures += 1
  if (error.kind === 'transient' && consecutiveFailures < TRANSIENT_FAILURES_BEFORE_PROBLEM) return

  const reason =
    error.kind === 'config' ? error.label : `${error.label}, ${consecutiveFailures} times in a row`
  await syncStoreProblem(
    container,
    {
      ...TICKET_AI_PROBLEM,
      active: true,
      severity: 'medium',
      errorMessage:
        `AI ticket analysis is failing (${reason}). Tickets get no AI category or suggested reply. ` +
        'Fix: check the provider, model, address and API key on Support inbox > Settings > AI, or turn AI suggestions off there.',
      context: {
        service_label: 'AI ticket analysis',
        feature: details.feature,
        failure_kind: error.kind,
        failure: error.label,
        http_status: error.status ?? null,
        consecutive_failures: consecutiveFailures,
        // Provider messages can quote a key ("Incorrect API key provided: sk-..."): masked.
        last_error: error.message.replace(/\b(sk|rk|pk)-[\w-]{6,}/g, '[redacted]').slice(0, 300),
        model: details.model ?? null,
        settings_path: TICKET_AI_SETTINGS_PATH,
      },
      resolvedBy: 'support-tickets',
    },
    log,
  )
}

/** Resolves the problem (next success, or AI suggestions turned off). Never throws. */
export async function clearTicketAiProblem(
  container: Resolver,
  note: string,
  log?: Log,
): Promise<void> {
  consecutiveFailures = 0
  await syncStoreProblem(
    container,
    {
      ...TICKET_AI_PROBLEM,
      active: false,
      severity: 'low',
      errorMessage: '',
      resolvedBy: 'support-tickets',
      resolveNote: note,
    },
    log,
  )
}
