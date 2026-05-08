type FetchOptions = {
  method?: string
  body?: unknown
}

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

export async function adminFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = {}

  if (options.body) {
    headers['Content-Type'] = 'application/json'
  }

  if (method !== 'GET' && method !== 'HEAD') {
    const csrfToken = getCsrfToken()
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }
  }

  const response = await fetch(path, {
    method,
    credentials: 'include',
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`

    try {
      const data = await response.json()
      if (typeof data?.message === 'string') {
        message = data.message
      } else if (typeof data?.error === 'string') {
        message = data.error
      }
    } catch {
      // Keep the status fallback when the response is not JSON.
    }

    throw new Error(message)
  }

  return response.json() as Promise<T>
}
