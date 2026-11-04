import { sdk } from './sdk'

type FetchOptions = {
  method?: string
  body?: BodyInit | Record<string, unknown> | null
}

export async function adminFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method, body } = options
  // When body is FormData, delete the default application/json header
  // so the browser sets the correct multipart/form-data boundary.
  const headers = body instanceof FormData ? { 'content-type': null } : undefined
  return sdk.client.fetch<T>(path, { method, body, headers })
}
