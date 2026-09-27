/*
 * Calls to the Auth0-protected backend API for the /auth-test page. Every call resolves to what came
 * back (status code and body) instead of throwing, because showing failures is the page's job.
 * The dev server forwards /api/me, /api/recordings, ... to Flask unchanged (vite.config.ts).
 */

export interface ApiResult {
  /** 0 when the request never got an answer (the backend isn't running, the network is down). */
  status: number
  body: unknown
}

export async function callApi(path: string, { token, method = 'GET', body }: { token?: string; method?: string; body?: BodyInit } = {}): Promise<ApiResult> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      body,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
  } catch (error) {
    return { status: 0, body: { error: `No answer from the backend: ${String(error)}` } }
  }
  return { status: response.status, body: await readBody(response) }
}

/**
 * Downloads a protected file (an `<audio src>` can't send the token) and returns an object URL for
 * it, which the caller must revoke. On failure there's no URL and the body says why.
 */
export async function fetchFileUrl(path: string, token: string): Promise<ApiResult & { url?: string }> {
  let response: Response
  try {
    response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
  } catch (error) {
    return { status: 0, body: { error: `No answer from the backend: ${String(error)}` } }
  }
  if (!response.ok) return { status: response.status, body: await readBody(response) }
  const blob = await response.blob()
  return { status: response.status, body: { type: blob.type, bytes: blob.size }, url: URL.createObjectURL(blob) }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text.slice(0, 500)
  }
}
