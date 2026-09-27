# Database (TigerData / PostgreSQL)

ECKO application data lives in a **TigerData / Tiger Cloud** PostgreSQL service.
Auth0 owns identity; the database only stores each user's Auth0 id
(`auth0_id`, the Auth0 `sub` claim) plus their app data. **No passwords are
ever stored here.**

Persistence uses Flask-SQLAlchemy for models and Flask-Migrate (Alembic) for
migrations. These are ordinary relational tables, so no hypertables are needed.

Audio files are **not** stored in the database: they're saved under
`STORAGE_DIR` (default `backend/storage/`) at
`recordings/<user_id>/<recording_id>.<ext>`, and the row keeps only that path.
All file access goes through `src/app/storage.py`, so it can be swapped for
S3/R2 later.

## Tables

```
users
 ├── recordings   (a user's saved songs; the audio files are in STORAGE_DIR)
 ├── posts        (discussion hub; may showcase one of the author's recordings)
 ├── comments
 └── post_likes   UNIQUE(post_id, user_id) -> can't like the same post twice

recordings ──can be attached to──> posts
posts ── comments, post_likes
```

Every id is a UUID the app generates. Deleting a user deletes everything of theirs.

| Table        | Columns |
|--------------|---------|
| `users`      | `id` (UUID PK, made by the app), `auth0_id` (unique, not null: the Auth0 `sub`), `username` (unique), `display_name`, `avatar_url`, `created_at` |
| `recordings` | `id` (UUID PK), `user_id` (FK → `users.id`, indexed, `ON DELETE CASCADE`), `file_path` (the FINAL output audio, never the hum), `title`, `style`, `duration_seconds` (all nullable), `created_at` |
| `posts`      | `id`, `user_id`, `recording_id` (nullable, `ON DELETE SET NULL`), `title`, `content`, `created_at`, `updated_at` |
| `comments`   | `id`, `post_id`, `user_id`, `content`, `created_at` |
| `post_likes` | `id`, `post_id`, `user_id`, `created_at`, `UNIQUE(post_id, user_id)` |

Every recordings query is filtered by the signed-in user. The one way to share
a recording is to attach it to a post.

## Configuration

The app runs on TigerData only: it refuses to start without `DATABASE_URL`
(there is no SQLite fallback). Set it in `backend/.env` to the connection
string from your Tiger Cloud service:

```
DATABASE_URL=postgresql://tsdbadmin:PASSWORD@HOST.tsdb.cloud.timescale.com:PORT/tsdb?sslmode=require
```

The app rewrites this to the psycopg (v3) driver internally
(`postgresql+psycopg://...`), so paste the string exactly as Tiger Cloud gives
it. The automated tests don't touch it: they use in-memory SQLite (or
`TEST_DATABASE_URL`).

## Verify the connection

```bash
cd backend/src
uv run python -m app.db_utils
# -> Database connection successful
#    TigerData (TimescaleDB): 2.x.x
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

Migration `7c4e2a91b3d5` rebuilds the first schema (integer ids) as the tables
above, with UUID ids and recordings stored as files. It **drops the old tables and
their rows**. `flask db downgrade 330716e1a9f9` puts the old, empty tables back.
