type ErrorLike = {
  message?: unknown
  name?: unknown
  type?: unknown
  code?: unknown
  cause?: unknown
  error?: unknown
  details?: unknown
}

const MESSAGE_CANDIDATE_KEYS = ['message', 'error', 'details', 'cause'] as const
const MAX_SERIALIZED_ERROR_LENGTH = 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed || trimmed === '[object Object]') return null

  return trimmed
}

function trySerialize(value: unknown): string | null {
  if (!isRecord(value) && !Array.isArray(value)) {
    return asNonEmptyString(value)
  }

  try {
    const serialized = JSON.stringify(value)
    if (!serialized || serialized === '{}' || serialized === '[]') {
      return null
    }

    return serialized.length > MAX_SERIALIZED_ERROR_LENGTH
      ? `${serialized.slice(0, MAX_SERIALIZED_ERROR_LENGTH)}...`
      : serialized
  } catch {
    return null
  }
}

function extractNestedMessage(value: unknown, visited = new Set<unknown>()): string | null {
  if (visited.has(value)) {
    return null
  }

  const directString = asNonEmptyString(value)
  if (directString) {
    return directString
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return null
  }

  visited.add(value)

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = extractNestedMessage(item, visited)
      if (message) {
        return message
      }
    }
    return null
  }

  for (const key of MESSAGE_CANDIDATE_KEYS) {
    const message = extractNestedMessage(value[key], visited)
    if (message) {
      return message
    }
  }

  if ('event' in value) {
    const eventMessage = extractNestedMessage(value.event, visited)
    if (eventMessage) {
      return eventMessage
    }
  }

  return null
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  const nestedMessage = extractNestedMessage(error)
  if (nestedMessage) {
    return nestedMessage
  }

  const serialized = trySerialize(error)
  if (serialized) {
    return serialized
  }

  return 'Unknown error'
}

/**
 * Type guard for plain objects (excludes arrays and null).
 */
export function isRecordValue(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
}

export function getErrorDetails(error: unknown): string | null {
  if (error instanceof Error) {
    if (error.stack?.trim()) {
      return error.stack
    }

    const serializedError = trySerialize(error as ErrorLike)
    if (serializedError && serializedError !== error.message) {
      return serializedError
    }
  }

  const serialized = trySerialize(error)
  if (serialized && serialized !== getErrorMessage(error)) {
    return serialized
  }

  return null
}
