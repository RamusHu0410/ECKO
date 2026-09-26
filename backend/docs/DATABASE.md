# Database (TigerData / PostgreSQL)

ECKO application data lives in a **TigerData / Tiger Cloud** PostgreSQL service.
Auth0 owns identity; the database only stores each user's Auth0 id
(`auth0_id`, the Auth0 `sub` claim) plus their app data. **No passwords are
ever stored here.**

Persistence uses Flask-SQLAlchemy for models and Flask-Migrate (Alembic) for
migrations. These are ordinary relational tables — posts/users are not
time-series data, so no hypertables are needed for the discussion hub.

## Tables

```
users
 ├── recordings   (a user's generated melodies + accompaniment files)
 ├── posts        (discussion hub; may showcase one recording)
 ├── comments
 └── post_likes   UNIQUE(post_id, user_id)  -> can't like the same post twice

recordings ──can be attached to──> posts
posts ── comments, post_likes
```

| Table        | Key columns                                                                 |
|--------------|------------------------------------------------------------------------------|
| `users`      | `id`, `auth0_id` (unique), `username` (unique), `display_name`, `avatar_url`, `created_at` |
| `recordings` | `id`, `user_id`, `title`, `original_melody_json`, `melody_midi_path`, `audio_path`, `key`, `mode`, `tempo`, `style`, `is_public`, `created_at` |
| `posts`      | `id`, `user_id`, `recording_id` (nullable), `title`, `content`, `created_at`, `updated_at` |
| `comments`   | `id`, `post_id`, `user_id`, `content`, `created_at`                          |
| `post_likes` | `id`, `post_id`, `user_id`, `created_at`, `UNIQUE(post_id, user_id)`         |

## Configuration

Set `DATABASE_URL` in `backend/.env` to the connection string from your Tiger
Cloud service:

```
DATABASE_URL=postgresql://tsdbadmin:PASSWORD@HOST.tsdb.cloud.timescale.com:PORT/tsdb?sslmode=require
```

The app rewrites this to the psycopg (v3) driver internally
(`postgresql+psycopg://...`), so paste the string exactly as Tiger Cloud gives
it. In development, if `DATABASE_URL` is unset, it falls back to a local SQLite
file (`dev.db`).

## Verify the connection

```bash
cd backend/src
uv run python -m app.db_utils
# -> Database connection successful
```

## Migrations

All migration commands run from `backend/src` with `FLASK_APP` set:

```bash
cd backend/src
export FLASK_APP="app:create_app"

# One-time (already done): scaffold the migrations/ directory
uv run flask db init

# Generate a migration after changing models
uv run flask db migrate -m "describe your change"

# Apply migrations to the database in DATABASE_URL
uv run flask db upgrade
```

To create the schema on your Tiger Cloud service, ensure `DATABASE_URL` points
at it in `.env`, then run `flask db upgrade`.
