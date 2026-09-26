import { useState, type ReactNode } from 'react'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import GlassButton from '../components/GlassButton/GlassButton'
import { AUTH_TEST_URL, auth0Config, missingAuth0Settings } from '../auth/auth0Config'
import { callApi, type ApiResult } from '../api/authTestApi'

/**
 * A standalone page for testing sign-in and the user's saved recordings against the backend, at
 * /auth-test. It isn't linked from anywhere and shares no state with the rest of the app: the
 * Auth0 provider wraps this page only.
 *
 * Stage 2: Auth0 login/logout and GET /api/me with and without a token. The recording buttons
 * are wired up in stage 3.
 */

/** What the last request answered, as shown in the response panel. */
interface PanelResponse extends ApiResult {
  label: string
}

export default function AuthTestPage() {
  if (missingAuth0Settings.length > 0) return <AuthTest configured={false} />
  return (
    <Auth0Provider
      domain={auth0Config.domain}
      clientId={auth0Config.clientId}
      authorizationParams={{ redirect_uri: AUTH_TEST_URL, audience: auth0Config.audience }}
      // A test page: keep the session across reloads. (Brave and Safari block the hidden iframe
      // the SDK would otherwise use to restore it.)
      cacheLocation="localstorage"
    >
      <AuthTest configured />
    </Auth0Provider>
  )
}

function AuthTest({ configured }: { configured: boolean }) {
  const [response, setResponse] = useState<PanelResponse | null>(null)
  const [file, setFile] = useState<File | null>(null)

  const show = (label: string) => (result: ApiResult) => setResponse({ label, ...result })
  const placeholder = (label: string) => () => show(label)({ status: 0, body: { placeholder: 'Not wired up yet (stage 3).' } })

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-5 py-10 text-ink">
      <header>
        <h1 className="font-display text-4xl tracking-wide">Sign-in test</h1>
        <p className="mt-1 text-sm text-ink-muted">A developer page for Auth0 and the recordings API. Not part of the app.</p>
      </header>

      <Section title="Account">
        {configured ? (
          <Account onResult={show} />
        ) : (
          <p className="rounded-2xl bg-amber/15 p-4 text-sm">
            Auth0 isn’t configured. Set {missingAuth0Settings.join(', ')} in Frontend/.env (see .env.example), then restart the dev server.
          </p>
        )}
      </Section>

      <Section title="API">
        <div className="flex flex-wrap gap-2">
          {configured && <CallMe onResult={show} />}
          <GlassButton onClick={() => callApi('/api/me').then(show('GET /api/me (no token)'))}>Call /api/me without a token</GlassButton>
        </div>
      </Section>

      <Section title="Recordings">
        <label className="text-sm">
          <span className="text-ink-muted">Audio file to save </span>
          <input type="file" accept="audio/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="text-sm" />
        </label>
        <div className="flex flex-wrap gap-2">
          <GlassButton onClick={placeholder(`POST /api/recordings${file ? ` (${file.name})` : ''}`)}>Save test recording</GlassButton>
          <GlassButton onClick={placeholder('GET /api/recordings')}>List my recordings</GlassButton>
        </div>
      </Section>

      <Section title="Response">
        <div aria-live="polite" className="rounded-2xl bg-white/60 p-4 font-mono text-xs">
          {response ? (
            <>
              <p className="mb-2 font-semibold">
                {response.label} → {response.status || 'no response'}
              </p>
              <pre className="overflow-x-auto break-words whitespace-pre-wrap">{JSON.stringify(response.body, null, 2)}</pre>
            </>
          ) : (
            <p className="text-ink-muted">Press a button to see its status code and JSON here.</p>
          )}
        </div>
      </Section>
    </main>
  )
}

type OnResult = (label: string) => (result: ApiResult) => void

/** Login state, the buttons that change it, and who is signed in. Needs the Auth0 provider. */
function Account({ onResult }: { onResult: OnResult }) {
  const { isLoading, isAuthenticated, user, error, loginWithRedirect, logout } = useAuth0()
  const status = isLoading ? 'Checking…' : isAuthenticated ? 'Signed in' : 'Not signed in'

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <GlassButton
          disabled={isLoading || isAuthenticated}
          onClick={() => loginWithRedirect().catch((failure: unknown) => onResult('Log in')({ status: 0, body: { error: String(failure) } }))}
        >
          Log in
        </GlassButton>
        <GlassButton disabled={isLoading || !isAuthenticated} onClick={() => logout({ logoutParams: { returnTo: AUTH_TEST_URL } })}>
          Log out
        </GlassButton>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm" aria-label="User info">
        <dt className="text-ink-muted">Status</dt>
        <dd>{status}</dd>
        {error && (
          <>
            <dt className="text-ink-muted">Auth0 error</dt>
            <dd className="text-red-700">{error.message}</dd>
          </>
        )}
        {user && (
          <>
            <dt className="text-ink-muted">Name</dt>
            <dd>{user.name ?? '—'}</dd>
            <dt className="text-ink-muted">Email</dt>
            <dd>{user.email ?? '—'}</dd>
            <dt className="text-ink-muted">Auth0 id (sub)</dt>
            <dd className="font-mono text-xs">{user.sub}</dd>
          </>
        )}
      </dl>
      {user?.picture && <img src={user.picture} alt="" className="size-12 rounded-full" referrerPolicy="no-referrer" />}
    </>
  )
}

/** GET /api/me with the access token Auth0 issued for our API. Needs the Auth0 provider. */
function CallMe({ onResult }: { onResult: OnResult }) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const label = 'GET /api/me (Bearer token)'

  const call = async () => {
    let token: string | undefined
    try {
      token = await getAccessTokenSilently()
    } catch (failure) {
      onResult(label)({ status: 0, body: { error: `Couldn’t get an access token: ${String(failure)}` } })
      return
    }
    if (!token) {
      onResult(label)({ status: 0, body: { error: 'Auth0 returned no access token.' } })
      return
    }
    onResult(label)(await callApi('/api/me', { token }))
  }

  return (
    <GlassButton disabled={!isAuthenticated} onClick={() => void call()}>
      Call /api/me
    </GlassButton>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-lg font-medium">{title}</h2>
      {children}
    </section>
  )
}
