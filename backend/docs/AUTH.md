# Authentication (Auth0)

**Rule:** Auth0 owns identity. The backend never stores passwords and never
builds its own login. It only *validates* the access tokens Auth0 issues and
links each request to app data through the Auth0 `sub` claim (`auth0_id`).

```
Auth0  ->  Access Token (JWT)  ->  Flask backend validates  ->  app user
```

## Auth0 tenant setup

1. **Application** — create a Regular Web Application (or SPA for the frontend).
2. **API** — create an API, e.g. identifier `https://api.melodyrecorder.com`.
   The frontend must request this as the `audience` so Auth0 returns a JWT
   access token intended for this backend.
3. **Permissions (scopes)**: none are needed today. `/api/me` and the
   recordings endpoints accept any valid token for the API. `require_auth()`
   can still demand one, e.g. `require_auth("write:recordings")`.

## Backend configuration

In `backend/.env`:

```
AUTH0_DOMAIN=dev-xxxxxxxx.us.auth0.com
AUTH0_API_AUDIENCE=https://api.melodyrecorder.com
```

## How validation works

`app/auth/jwt.py` -> `verify_jwt()`:

```
JWT
 -> fetch tenant JWKS (cached ~1h) and match the token's `kid`
 -> validate RS256 signature
 -> validate issuer  (https://AUTH0_DOMAIN/)
 -> validate audience (AUTH0_API_AUDIENCE)
 -> return claims (contains `sub`)
```

`app/auth/dependencies.py`:

- `@require_auth("scope", ...)` — decorator that pulls the `Bearer` token,
  verifies it, checks required scopes/permissions, and stashes claims on
  `flask.g`. Missing/invalid token -> `401`; missing scope -> `403`.
- `get_current_user()` — resolves the app `User` for the request, **creating it
  on first sight** (maps the Auth0 identity to an application user).

## Protecting a route

```python
from app.auth import require_auth, get_current_user

@bp.route("/api/me")
@require_auth()               # any valid token
def me():
    user = get_current_user()  # auto-created on first login
    return {"auth0_id": user.auth0_id}

@bp.route("/api/admin/stats")
@require_auth("read:stats")   # also requires a scope (403 without it)
def stats():
    ...
```

## Calling protected endpoints

```
GET /api/me
Authorization: Bearer <access_token>
```

- No token  -> `401 Unauthorized`
- Valid token -> `{ "id": "<uuid>", "auth0_id": "auth0|abc123...", "created_at": "..." }`
