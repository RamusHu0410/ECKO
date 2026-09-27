# API Reference

All `/api/*` endpoints require an Auth0 access token for the API
(`audience` = `AUTH0_API_AUDIENCE`). No scopes are needed:

```
Authorization: Bearer <access_token>
```

Errors are JSON. `401` = missing/invalid token (`{ "code", "description" }`),
`403` = not the author (deleting a post or comment), `404` = not found,
`400` = bad input, `413` = file too large (`{ "error" }`). Every id is a UUID string.

The code is in `src/app/routes/account.py`, `posts.py` and `users.py`; files are stored by
`src/app/storage.py`.

## `GET /api/me`
The current user. The first call for an Auth0 identity creates the user.
```json
{ "id": "3f0c…-uuid", "auth0_id": "auth0|abc123", "created_at": "2026-09-26T21:30:00+00:00",
  "username": "ramus", "display_name": "Ramus", "avatar_url": null }
```

## `POST /api/recordings`
Saves a finished song (the final generated audio, **never the raw hum**).
`multipart/form-data`:

| field   | required | notes |
|---------|----------|-------|
| `file`  | yes      | `.wav`, `.mp3`, `.ogg`, `.webm`, `.m4a` or `.flac`, non-empty, at most 50 MB |
| `title` | no       | at most 200 characters |
| `style` | no       | at most 32 characters |

Returns `201` with the recording:
```json
{ "id": "9a1e…-uuid", "title": "First song", "style": "jazz",
  "duration_seconds": 12.5, "created_at": "…",
  "file_url": "/api/recordings/9a1e…-uuid/file" }
```
`duration_seconds` is `null` for formats the server can't read the length of (webm, m4a).

## `GET /api/recordings`
The caller's recordings, newest first: a JSON array of the objects above.

## `GET /api/recordings/{id}/file`
Streams the audio file, with its audio `Content-Type`. Someone else's recording
answers `404`, the same as one that doesn't exist. An `<audio src>` can't send
the Bearer header, so fetch it and play it through `URL.createObjectURL(blob)`.

## Posts (discussion hub)

### `POST /api/posts`
```json
{ "title": "Cinematic", "content": "emotional", "recording_id": "9a1e…-uuid" }
```
`title` is required. `recording_id` is optional and must be one of YOUR recordings
(`404` otherwise). Attaching a recording shares it: anyone signed in can play it
through the post's `recording.audio_url`. Returns `201` with the post.

### `GET /api/posts?page=1&per_page=20&search=`
The feed, newest first. `search` matches the title and content.
```json
{ "posts": [ { "id": "…", "title": "...", "content": "...",
               "author": { "username": "ramus", "display_name": "Ramus", "avatar_url": null, "joined_at": "…" },
               "recording": { "id": "…", "title": "...", "style": "piano", "duration_seconds": 12.5,
                              "audio_url": "/api/posts/…/audio" },
               "like_count": 3, "comment_count": 1, "created_at": "…", "updated_at": "…" } ],
  "page": 1, "per_page": 20, "total": 1, "pages": 1 }
```

### `GET /api/posts/{id}`
One post, with its `comments` (oldest first).

### `GET /api/posts/{id}/audio`
Streams the recording the post showcases (`404` if it has none).

### `DELETE /api/posts/{id}`
Author only (`403` otherwise).

## Comments

### `GET  /api/posts/{id}/comments`
### `POST /api/posts/{id}/comments`
```json
{ "content": "great transition" }
```
### `DELETE /api/posts/{id}/comments/{comment_id}`
Author only (`403` otherwise).

## Likes

### `POST   /api/posts/{id}/like`
Idempotent: liking twice still counts once.
### `DELETE /api/posts/{id}/like`
Both return `{ "status", "post_id", "like_count" }`.

## Profiles

### `GET /api/users/{username}`
A public profile: `username`, `display_name`, `avatar_url`, `joined_at`,
`recording_count`, `post_count`. Never the email or Auth0 id.
