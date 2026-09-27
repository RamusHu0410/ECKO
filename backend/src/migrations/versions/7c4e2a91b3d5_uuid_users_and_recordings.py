"""uuid ids for every table; recordings keep their audio as a stored file

Rebuilds the schema with UUID primary keys: `users` (+ profile fields),
`recordings` (file_path, title, style, duration_seconds), and the discussion
hub `posts`, `comments`, `post_likes`. DELETES any rows in the old
integer-id tables.

Revision ID: 7c4e2a91b3d5
Revises: 330716e1a9f9
Create Date: 2026-09-26 21:30:00.000000

"""
import importlib.util
from pathlib import Path

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7c4e2a91b3d5'
down_revision = '330716e1a9f9'
branch_labels = None
depends_on = None

# Children first, so no foreign key points at a table that's gone.
TABLES_CHILDREN_FIRST = ('post_likes', 'comments', 'posts', 'recordings', 'users')


def upgrade():
    for table in TABLES_CHILDREN_FIRST:
        op.drop_table(table)

    op.create_table('users',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('auth0_id', sa.String(length=255), nullable=False),
    sa.Column('username', sa.String(length=80), nullable=False),
    sa.Column('display_name', sa.String(length=120), nullable=True),
    sa.Column('avatar_url', sa.String(length=512), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_auth0_id'), ['auth0_id'], unique=True)
        batch_op.create_index(batch_op.f('ix_users_username'), ['username'], unique=True)

    op.create_table('recordings',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('file_path', sa.String(length=1024), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=True),
    sa.Column('style', sa.String(length=32), nullable=True),
    sa.Column('duration_seconds', sa.Float(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('recordings', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_recordings_user_id'), ['user_id'], unique=False)

    op.create_table('posts',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('recording_id', sa.Uuid(), nullable=True),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['recording_id'], ['recordings.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('posts', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_posts_user_id'), ['user_id'], unique=False)

    op.create_table('comments',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('post_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('comments', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_comments_post_id'), ['post_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_comments_user_id'), ['user_id'], unique=False)

    op.create_table('post_likes',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('post_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('post_id', 'user_id', name='uq_post_like')
    )
    with op.batch_alter_table('post_likes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_post_likes_post_id'), ['post_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_post_likes_user_id'), ['user_id'], unique=False)


def downgrade():
    for table in TABLES_CHILDREN_FIRST:
        op.drop_table(table)
    # Back to the empty integer-id schema, exactly as the initial migration builds it.
    initial = Path(__file__).with_name('330716e1a9f9_initial_schema_users_recordings_posts_.py')
    spec = importlib.util.spec_from_file_location('initial_schema', initial)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.upgrade()
