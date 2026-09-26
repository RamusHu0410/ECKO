# API Reference

All `/api/*` endpoints require an Auth0 bearer token:

```
Authorization: Bearer <access_token>
```

Errors are JSON: `{ "error"/"code": ..., "description"/"details": ... }`.
`401` = missing/invalid token, `403` = insufficient scope or not the owner,
`404` = not found, `400` = bad input.

## Auth

### `GET /api/me`  — scope: any valid token
Returns the current user, auto-creating the app user on first call.
```json
{ "auth0_id": "auth0|abc123", "id": 1, "username": "ramus",
  "display_name": "Ramus", "avatar_url": null, "joined_at": "..." }
```

## Recordings

### `POST /api/recordings`  — scope: `write:recordings`
Generates an accompaniment (via the `accompanist` engine) and saves it.
```json
{ "title": "My first melody",
  "melody": [ {"hz": 60, "start": 0, "duration": 1} ],
  "key": "C", "mode": "major", "tempo": 100, "style": "piano",
  "is_public": true }
```
Returns `201` with the recording detail (incl. `audio_url`, `midi_url`).

### `GET /api/recordings/me`  — scope: `read:recordings`
List of the caller's recordings, newest first.

### `GET /api/recordings/{id}`  — scope: `read:recordings`
One recording. Private recordings are only visible to their owner (returns
`404` otherwise, so existence isn't leaked).

### `GET /api/recordings/{id}/audio` · `/midi`  — scope: `read:recordings`
Streams the generated WAV / MIDI file.

### `DELETE /api/recordings/{id}`  — scope: `delete:recordings`
Owner only. Also removes the generated files.

## Posts (discussion hub)

### `POST /api/posts`  — scope: `write:posts`
```json
{ "title": "My first cinematic melody",
  "content": "I was trying to make this sound emotional.",
  "recording_id": 42 }
```
`recording_id` is optional; if given, it **must belong to the caller**
(otherwise `403`). Returns `201`.

### `GET /api/posts`  — scope: `read:posts`
Feed, newest first. Query params: `page` (default 1), `per_page`
(default 20, max 50), `search` (matches title/content).
```json
{ "posts": [ { "id": 1, "title": "...", "author": {"username": "ramus"},
               "recording": {"id": 42, "audio_url": "..."},
               "like_count": 0, "comment_count": 0, "created_at": "..." } ],
  "page": 1, "per_page": 20, "total": 1, "pages": 1 }
```

### `GET /api/posts/{id}`  — scope: `read:posts`
One post with author, recording, and its comments.

### `DELETE /api/posts/{id}`  — scope: `delete:posts` (owner only)

## Comments

### `GET  /api/posts/{id}/comments`  — scope: `read:posts`
### `POST /api/posts/{id}/comments`  — scope: `write:comments`
```json
{ "content": "I really like the transition at the end." }
```
### `DELETE /api/posts/{id}/comments/{comment_id}`  — scope: `delete:comments` (owner only)

## Likes

### `POST   /api/posts/{id}/like`  — scope: `write:posts`
Idempotent; `UNIQUE(post_id, user_id)` means a user can't like twice.
### `DELETE /api/posts/{id}/like`  — scope: `write:posts`
Both return `{ "status": ..., "post_id": id, "like_count": n }`.

## User profiles

### `GET /api/users/{username}`  — scope: `read:profile`
```json
{ "username": "ramus", "display_name": "Ramus", "avatar_url": "...",
  "joined_at": "...", "recording_count": 12, "post_count": 7 }
```
Email is intentionally not exposed.
