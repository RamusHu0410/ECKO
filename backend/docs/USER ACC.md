# ECKO API — Frontend Guide

Short reference for calling the backend from the frontend.

## Basics
- Base URL (dev): `http://127.0.0.1:8000`
- All `/api/*` endpoints need an Auth0 access token:
  `Authorization: Bearer <token>`
- Responses are JSON. Saving a recording is a multipart upload.
- Errors: `401` no/invalid token · `403` not the author · `404` not found (or not yours) · `400` bad input · `413` file too large.

## Auth (Auth0)
- The backend does NOT do signup/login. **Auth0 owns identity.**
- Log the user in with the Auth0 SPA SDK, requesting:
  - `audience`: `https://api.ecko.app`
- Get the token via `getAccessTokenSilently()` and send it as the Bearer header.
- No separate "create account" call — the first authenticated request auto-creates the user row.

## Auth config values
- Domain: `dev-p6rbszi5rn6xk1d6.us.auth0.com`
- Audience: `https://api.ecko.app`

## Quick fetch pattern
```js
const token = await getAccessTokenSilently();
const res = await fetch(`${BASE}/api/me`, {
  headers: { Authorization: `Bearer ${token}` },
});
const me = await res.json();
```

## Endpoints
Full details: `docs/API.md`.

- `GET /api/me` → `{ id, auth0_id, created_at, username, display_name, avatar_url }` (auto-created on first call)
- `POST /api/recordings` → multipart: `file` (the finished song's audio, never the hum) + optional `title`, `style`; returns the recording
- `GET /api/recordings` → my recordings (newest first)
- `GET /api/recordings/{id}/file` → the audio file (`404` if it isn't mine)
- `POST /api/posts` → `{ "title", "content", "recording_id"? }` (only YOUR recording; attaching shares it)
- `GET /api/posts?page=1&per_page=20&search=` → feed (newest first)
- `GET /api/posts/{id}` → post + author + recording + comments · `DELETE` → author only
- `GET /api/posts/{id}/audio` → the attached recording's audio (anyone signed in)
- `GET|POST /api/posts/{id}/comments` · `DELETE /api/posts/{id}/comments/{comment_id}` → author only
- `POST|DELETE /api/posts/{id}/like` → like / unlike (no double-likes)
- `GET /api/users/{username}` → public profile + `recording_count`, `post_count`

## Notes for the frontend
- Playing audio: an `<audio src>` can't send the Bearer header, so fetch `file_url` as a blob and use `URL.createObjectURL`.
- CORS is enabled on the backend.
