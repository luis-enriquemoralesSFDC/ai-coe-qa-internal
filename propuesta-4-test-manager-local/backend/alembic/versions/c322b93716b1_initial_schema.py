"""initial_schema

Revision ID: c322b93716b1
Revises: 
Create Date: 2026-04-22 10:11:20.491636

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c322b93716b1'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(150), unique=True, index=True, nullable=False),
        sa.Column("password_hash", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_table(
        "user_stories",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("external_id", sa.String(100)),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("acceptance_criteria", sa.Text()),
        sa.Column("source", sa.String(50), server_default="manual"),
        sa.Column("invest_score", sa.Float(), server_default="0.0"),
        sa.Column("invest_analysis", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_table(
        "test_cases",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("story_id", sa.Integer(), sa.ForeignKey("user_stories.id"), nullable=False),
        sa.Column("case_id", sa.String(50)),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("precondition", sa.Text()),
        sa.Column("steps", sa.JSON()),
        sa.Column("expected_result", sa.Text()),
        sa.Column("actual_result", sa.Text()),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("priority", sa.String(20), server_default="medium"),
        sa.Column("test_type", sa.String(50), server_default="functional"),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("test_cases")
    op.drop_table("user_stories")
    op.drop_table("projects")
    op.drop_table("users")
