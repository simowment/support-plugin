type FetchOptions = {
  method?: string
  body?: unknown
}

export async function adminFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`

    try {
      const data = await response.json()
      if (typeof data?.message === 'string') {
        message = data.message
      }
    } catch {
      // Keep the status fallback when the response is not JSON.
    }

    throw new Error(message)
  }

  return response.json() as Promise<T>
}
