/**
 * One Store problem per ongoing condition, kept in step by a scheduled check. A
 * self-contained copy of the host contract (`backend/src/lib/condition-issues.ts`
 * syncConditionIssue) so the plugin keeps no host import:
 *
 * - condition true and no unresolved problem: one is created;
 * - condition true and one exists: its message and context are refreshed; a higher severity
 *   resolves the old one as superseded and creates a new one, so the escalation alerts once;
 * - condition false: unresolved problems for it are resolved with a note.
 *
 * A problem the owner ignored stays ignored while the condition lasts. The host's Store
 * problems service is optional (container key `operationalIssue`): without it this only
 * logs. Never throws.
 */

export const OPERATIONAL_ISSUE_MODULE = 'operationalIssue'

type Severity = 'critical' | 'high' | 'medium' | 'low'
type IssueRow = {
  id: string
  status: string
  severity: string
  context: Record<string, unknown> | null
}

type IssueService = {
  createIssue: (input: Record<string, unknown>) => Promise<unknown>
  updateIssue: (
    id: string,
    input: { status?: string; resolvedBy?: string; note?: string },
  ) => Promise<unknown>
  listOperationalIssues: (
    filters: Record<string, unknown>,
    config?: Record<string, unknown>,
  ) => Promise<unknown>
  updateOperationalIssues?: (data: Array<Record<string, unknown>>) => Promise<unknown>
}

type Resolver = { resolve: (name: string) => unknown }
type Log = { warn: (message: string) => void }

export type StoreProblem = {
  type: string
  resourceType: string
  resourceId: string
  active: boolean
  severity: Severity
  errorMessage: string
  context?: Record<string, unknown>
  resolvedBy: string
  resolveNote?: string
}

const UNRESOLVED = ['open', 'in_progress', 'ignored']
const RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 }

function serviceOf(container: Resolver): IssueService | null {
  try {
    const candidate = container.resolve(OPERATIONAL_ISSUE_MODULE) as IssueService | undefined
    return candidate &&
      typeof candidate.createIssue === 'function' &&
      typeof candidate.updateIssue === 'function' &&
      typeof candidate.listOperationalIssues === 'function'
      ? candidate
      : null
  } catch {
    return null
  }
}

export async function syncStoreProblem(
  container: Resolver,
  input: StoreProblem,
  log?: Log,
): Promise<void> {
  const issues = serviceOf(container)
  if (!issues) {
    if (input.active) log?.warn(`[support-tickets] ${input.type}: ${input.errorMessage}`)
    return
  }
  try {
    const existing = (await issues.listOperationalIssues(
      {
        type: input.type,
        resource_type: input.resourceType,
        resource_id: input.resourceId,
        status: UNRESOLVED,
      },
      { take: 10, order: { created_at: 'DESC' } },
    )) as IssueRow[]

    if (!input.active) {
      for (const row of existing.filter((entry) => entry.status !== 'ignored')) {
        await issues.updateIssue(row.id, {
          status: 'resolved',
          resolvedBy: input.resolvedBy,
          note:
            input.resolveNote ??
            'Cleared by itself: the automatic check no longer sees the problem.',
        })
      }
      return
    }

    const context = { ...(input.context ?? {}), last_checked_at: new Date().toISOString() }
    const create = () =>
      issues.createIssue({
        type: input.type,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        errorCode: null,
        errorMessage: input.errorMessage,
        severity: input.severity,
        context,
      })
    const current = existing[0]
    if (!current) {
      await create()
      return
    }
    if (
      current.status !== 'ignored' &&
      (RANK[input.severity] ?? 0) > (RANK[current.severity] ?? 0)
    ) {
      await issues.updateIssue(current.id, {
        status: 'resolved',
        resolvedBy: input.resolvedBy,
        note: 'Superseded by a more urgent problem for the same thing.',
      })
      await create()
      return
    }
    await issues.updateOperationalIssues?.([
      {
        id: current.id,
        error_message: input.errorMessage,
        context: { ...(current.context ?? {}), ...context },
      },
    ])
  } catch (error) {
    log?.warn(
      `[support-tickets] Could not update the Store problem ${input.type}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export type OpenStoreProblem = {
  id: string
  status: string
  severity: string
  error_message: string | null
  context: Record<string, unknown> | null
  created_at: string | null
}

/** The newest unresolved problem of one kind, for a settings page status line. Never throws. */
export async function findOpenStoreProblem(
  container: Resolver,
  problem: Pick<StoreProblem, 'type' | 'resourceType' | 'resourceId'>,
): Promise<OpenStoreProblem | null> {
  const issues = serviceOf(container)
  if (!issues) return null
  try {
    const rows = (await issues.listOperationalIssues(
      {
        type: problem.type,
        resource_type: problem.resourceType,
        resource_id: problem.resourceId,
        status: UNRESOLVED,
      },
      { take: 1, order: { created_at: 'DESC' } },
    )) as Array<Omit<OpenStoreProblem, 'created_at'> & { created_at?: string | Date | null }>
    const row = rows[0]
    if (!row) return null
    return {
      id: row.id,
      status: row.status,
      severity: row.severity,
      error_message: row.error_message ?? null,
      context: row.context ?? null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    }
  } catch {
    return null
  }
}
