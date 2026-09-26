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
  const text = await response.text()
  try {
    return { status: response.status, body: JSON.parse(text) }
  } catch {
    return { status: response.status, body: text.slice(0, 500) }
  }
}
