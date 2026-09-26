# ECKO API — Frontend Guide

Short reference for calling the backend from the frontend.

## Basics
- Base URL (dev): `http://127.0.0.1:8000`
- All `/api/*` endpoints need an Auth0 access token:
  `Authorization: Bearer <token>`
- Request/response bodies are JSON (`Content-Type: application/json`).
- Errors: `401` no/invalid token · `403` missing scope or not owner · `404` not found · `400` bad input.

## Auth (Auth0)
- The backend does NOT do signup/login. **Auth0 owns identity.**
- Log the user in with the Auth0 SPA SDK, requesting:
  - `audience`: `https://api.ecko.app`
  - `scope`: the permissions you need (see below)
- Get the token via `getAccessTokenSilently()` and send it as the Bearer header.
- No separate "create account" call — the first authenticated request auto-creates the user row.

## Scopes to request
- `read:profile write:profile`
- `read:recordings write:recordings delete:recordings`
- `read:posts write:posts delete:posts`
- `write:comments delete:comments`

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

### Me
- `GET /api/me` → current user (auto-created on first call)

### Recordings
- `POST /api/recordings` → generate + save a melody
  ```json
  { "title": "My first melody",
    "melody": [ {"hz": 60, "start": 0, "duration": 1} ],
    "key": "C", "mode": "major", "tempo": 100, "style": "piano",
    "is_public": true }
  ```
  - `hz` = MIDI pitch (60 = middle C), `start`/`duration` in beats
  - `style`: `piano | pop | cinematic | classical`
  - returns the recording incl. `audio_url`, `midi_url`
- `GET /api/recordings/me` → my recordings (newest first)
- `GET /api/recordings/{id}` → one recording
- `GET /api/recordings/{id}/audio` → WAV stream (use in `<audio>`)
- `GET /api/recordings/{id}/midi` → MIDI file
- `DELETE /api/recordings/{id}` → owner only

### Posts (discussion hub)
- `POST /api/posts` → `{ "title", "content", "recording_id"? }`
  - `recording_id` optional; must be YOUR own recording
- `GET /api/posts?page=1&per_page=20&search=` → feed (newest first)
- `GET /api/posts/{id}` → post + author + recording + comments
- `DELETE /api/posts/{id}` → owner only

### Comments
- `GET /api/posts/{id}/comments`
- `POST /api/posts/{id}/comments` → `{ "content": "..." }`
- `DELETE /api/posts/{id}/comments/{comment_id}` → owner only

### Likes
- `POST /api/posts/{id}/like` → like (idempotent, no double-likes)
- `DELETE /api/posts/{id}/like` → unlike
- both return `{ status, post_id, like_count }`

### Profiles
- `GET /api/users/{username}` → public profile + `recording_count`, `post_count`

## Notes for the frontend
- Playing audio: `new Audio(`${BASE}/api/recordings/${id}/audio`)` — but the request needs the Bearer header, so fetch the WAV as a blob and use `URL.createObjectURL`.
- CORS is enabled on the backend.
- Media endpoints (`/audio`, `/midi`) require `read:recordings`.
