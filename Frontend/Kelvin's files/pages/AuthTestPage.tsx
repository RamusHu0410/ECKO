import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import GlassButton from '../components/GlassButton/GlassButton'
import { AUTH_TEST_URL, auth0Config, missingAuth0Settings } from '../auth/auth0Config'
import { callApi, fetchFileUrl, type ApiResult } from '../api/authTestApi'

/**
 * The sign-in page, at /auth-test: log in and out with Auth0, and save, list and play back the
 * signed-in user's recordings (backend/src/app/routes/account.py). It shares no state with the
 * rest of the app: the Auth0 provider wraps this page only.
 */

/** A one-line message under the header saying how the last action went. */
interface Notice {
  tone: 'ok' | 'error'
  text: string
}
type OnNotice = (notice: Notice) => void

export default function AuthTestPage() {
  if (missingAuth0Settings.length > 0) return <AuthTest configured={false} />
  return (
    <Auth0Provider
      domain={auth0Config.domain}
      clientId={auth0Config.clientId}
      authorizationParams={{ redirect_uri: AUTH_TEST_URL, audience: auth0Config.audience }}
      // Keep the session across reloads. (Brave and Safari block the hidden iframe the SDK would
      // otherwise use to restore it.)
      cacheLocation="localstorage"
      // Once Auth0 sends the user back here and the login is complete, go on to the community page.
      // Auth0 still returns to /auth-test (the allowed callback URL); the app loads fresh from there.
      onRedirectCallback={() => window.location.replace('/community')}
    >
      <AuthTest configured />
    </Auth0Provider>
  )
}

function AuthTest({ configured }: { configured: boolean }) {
  const [notice, setNotice] = useState<Notice | null>(null)

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-10 text-ink">
      <header>
        <h1 className="font-display text-4xl tracking-wide">Profile</h1>
        <p className="mt-1 text-sm text-ink-muted">Your account and the songs you’ve saved.</p>
      </header>

      <p aria-live="polite" className={notice?.tone === 'error' ? 'text-sm text-red-700' : 'text-sm text-ink-muted'} hidden={!notice}>
        {notice?.text}
      </p>

      {configured ? (
        <>
          <Section title="Account">
            <Account onNotice={setNotice} />
          </Section>
          <Section title="My recordings">
            <Recordings onNotice={setNotice} />
          </Section>
        </>
      ) : (
        <p className="rounded-2xl bg-amber/15 p-4 text-sm">
          Sign-in isn’t set up yet. Set {missingAuth0Settings.join(', ')} in Frontend/.env (see .env.example), then restart the dev server.
        </p>
      )}
    </main>
  )
}

/** Who is signed in, and the button that changes it. Needs the Auth0 provider. */
function Account({ onNotice }: { onNotice: OnNotice }) {
  const { isLoading, isAuthenticated, user, error, loginWithRedirect, logout } = useAuth0()

  if (isLoading) return <p className="text-sm text-ink-muted">Checking…</p>

  return (
    <div className="flex flex-wrap items-center gap-4">
      {user?.picture && <img src={user.picture} alt="" className="size-14 rounded-full" referrerPolicy="no-referrer" />}
      <div className="flex flex-col text-sm">
        {isAuthenticated && user ? (
          <>
            <span className="text-base font-medium">{user.name ?? user.email ?? 'Signed in'}</span>
            {user.email && user.email !== user.name && <span className="text-ink-muted">{user.email}</span>}
          </>
        ) : (
          <span className="text-ink-muted">Not signed in</span>
        )}
        {error && <span className="text-red-700">{error.message}</span>}
      </div>
      <div className="ml-auto">
        {isAuthenticated ? (
          <GlassButton onClick={() => logout({ logoutParams: { returnTo: AUTH_TEST_URL } })}>Log out</GlassButton>
        ) : (
          <GlassButton onClick={() => loginWithRedirect().catch((failure: unknown) => onNotice({ tone: 'error', text: `Couldn’t start the login: ${String(failure)}` }))}>
            Log in
          </GlassButton>
        )}
      </div>
    </div>
  )
}

/** Runs a request with the access token Auth0 issued for our API. Never throws. */
function useWithToken() {
  const { getAccessTokenSilently } = useAuth0()
  return useCallback(
    async <R extends ApiResult>(request: (token: string) => Promise<R>): Promise<R | ApiResult> => {
      try {
        const token = await getAccessTokenSilently()
        return token ? await request(token) : { status: 0, body: { error: 'Auth0 returned no access token.' } }
      } catch (failure) {
        return { status: 0, body: { error: `Couldn’t get an access token: ${String(failure)}` } }
      }
    },
    [getAccessTokenSilently],
  )
}

/** What went wrong, in the backend's words when it gave any. */
function reason(result: ApiResult): string {
  const body = result.body as { error?: unknown; description?: unknown } | null
  const said = body && typeof body === 'object' ? (body.error ?? body.description) : null
  if (typeof said === 'string') return said
  return result.status === 0 ? 'The server isn’t answering.' : `Something went wrong (${result.status}).`
}

/** A recording as the backend returns it. */
interface SavedRecording {
  id: string
  title: string | null
  style: string | null
  duration_seconds: number | null
  created_at: string
  file_url: string
}

/** Save an audio file as a recording, see mine, and play one back through its protected file URL. */
function Recordings({ onNotice }: { onNotice: OnNotice }) {
  const { isAuthenticated } = useAuth0()
  const withToken = useWithToken()
  const picker = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [style, setStyle] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<SavedRecording[] | null>(null)
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null)

  // An object URL holds the whole file in memory until it's revoked.
  useEffect(() => () => {
    if (playing) URL.revokeObjectURL(playing.url)
  }, [playing])

  const refresh = useCallback(async () => {
    const result = await withToken((token) => callApi('/api/recordings', { token }))
    if (result.status === 200 && Array.isArray(result.body)) setSaved(result.body as SavedRecording[])
    else onNotice({ tone: 'error', text: `Couldn’t load your recordings: ${reason(result)}` })
  }, [withToken, onNotice])

  useEffect(() => {
    if (isAuthenticated) void refresh()
  }, [isAuthenticated, refresh])

  const save = async () => {
    if (!file) return
    setSaving(true)
    const form = new FormData()
    form.append('file', file)
    if (title.trim()) form.append('title', title.trim())
    if (style.trim()) form.append('style', style.trim())
    const result = await withToken((token) => callApi('/api/recordings', { token, method: 'POST', body: form }))
    setSaving(false)
    if (result.status !== 201) {
      onNotice({ tone: 'error', text: `Couldn’t save it: ${reason(result)}` })
      return
    }
    onNotice({ tone: 'ok', text: `Saved “${title.trim() || file.name}”.` })
    setFile(null)
    setTitle('')
    setStyle('')
    if (picker.current) picker.current.value = '' // so the same file can be picked again
    await refresh()
  }

  const play = async (recording: SavedRecording) => {
    const result: ApiResult & { url?: string } = await withToken((token) => fetchFileUrl(recording.file_url, token))
    const { url } = result
    if (url) setPlaying({ id: recording.id, url })
    else onNotice({ tone: 'error', text: `Couldn’t play it: ${reason(result)}` })
  }

  if (!isAuthenticated) return <p className="text-sm text-ink-muted">Log in to save and play your songs.</p>

  const field = 'min-w-0 flex-1 rounded-xl bg-white/60 px-3 py-2 text-sm'
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={picker} type="file" accept="audio/*" hidden onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <GlassButton onClick={() => picker.current?.click()}>{file ? 'Change file' : 'Choose audio file'}</GlassButton>
        <span className="truncate text-sm text-ink-muted">{file ? file.name : 'No file chosen'}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title (optional)" aria-label="Title" className={field} />
        <input value={style} onChange={(event) => setStyle(event.target.value)} placeholder="Style (optional)" aria-label="Style" className={field} />
      </div>
      <div>
        <GlassButton disabled={!file || saving} className="disabled:cursor-default disabled:opacity-50" onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save recording'}
        </GlassButton>
      </div>

      {saved && (
        <ul className="flex flex-col gap-2 text-sm" aria-label="My recordings">
          {saved.length === 0 && <li className="text-ink-muted">No recordings yet.</li>}
          {saved.map((recording) => (
            <li key={recording.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/60 px-4 py-3">
              <div className="flex flex-col">
                <span className="font-medium">{recording.title ?? 'Untitled'}</span>
                <span className="text-ink-muted">
                  {[recording.style, recording.duration_seconds != null && `${recording.duration_seconds.toFixed(1)} s`, new Date(recording.created_at).toLocaleDateString()]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <button type="button" className="glass-surface glass-control ml-auto px-4 py-1.5 text-sm font-medium" onClick={() => void play(recording)}>
                <span className="glass-content">Play</span>
              </button>
              {playing?.id === recording.id && <audio src={playing.url} controls autoPlay className="w-full" />}
            </li>
          ))}
        </ul>
      )}
    </>
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
