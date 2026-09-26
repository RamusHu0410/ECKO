/*
 * Auth0 settings for the /auth-test page, from Frontend/.env (see .env.example; Vite exposes only
 * VITE_-prefixed variables). The audience must equal the backend's AUTH0_API_AUDIENCE, so Auth0
 * issues an access token meant for our API (a JWT the backend can verify).
 */

export const auth0Config = {
  domain: (import.meta.env.VITE_AUTH0_DOMAIN as string | undefined) ?? '',
  clientId: (import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined) ?? '',
  audience: (import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined) ?? '',
}

/** The page Auth0 sends the browser back to after logging in and out. */
export const AUTH_TEST_URL = `${window.location.origin}/auth-test`

/** The env variables still missing, so the page can say what to set instead of failing at login. */
export const missingAuth0Settings = [
  ['VITE_AUTH0_DOMAIN', auth0Config.domain],
  ['VITE_AUTH0_CLIENT_ID', auth0Config.clientId],
  ['VITE_AUTH0_AUDIENCE', auth0Config.audience],
]
  .filter(([, value]) => !value)
  .map(([name]) => name)
