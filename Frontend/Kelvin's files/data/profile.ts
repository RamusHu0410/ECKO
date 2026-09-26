/*
 * Who is using ECKO. There are no accounts yet, so everyone is the same placeholder person and
 * their records are kept in their own browser.
 *
 * TODO(backend): `me()` becomes the signed-in user from the session (GET /api/users/me), and
 * `signedIn()` gates the profile and social pages. The shape below is what the pages already
 * read, so only this file changes.
 */

export interface Person {
  id: string
  name: string
  handle: string
  /** A short line under the name on the profile page. */
  bio: string
  /** Two letters for the placeholder avatar; a real avatar image would replace it. */
  initials: string
}

const PLACEHOLDER: Person = {
  id: 'local',
  name: 'You',
  handle: '@you',
  bio: 'Everything you hum lands here.',
  initials: 'Y',
}

/** The person whose records are shown. */
export function me(): Person {
  // TODO(backend): read the signed-in user instead of this placeholder.
  return PLACEHOLDER
}

/** Whether anyone is signed in. Always true for now, so the pages are reachable. */
export function signedIn(): boolean {
  // TODO(backend): false until a session exists, and the pages offer to sign in.
  return true
}
