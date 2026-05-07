"""add kpis bugs tables

Revision ID: a1b2c3d4e5f6
Revises: c322b93716b1
Create Date: 2026-04-21 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'c322b93716b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Sprint field on user_stories
    op.add_column('user_stories', sa.Column('sprint', sa.String(100), nullable=True))

    op.create_table(
        'bug_reports',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('sprint_name', sa.String(100), nullable=True),
        sa.Column('source', sa.String(50), server_default='csv'),
        sa.Column('filename', sa.String(200), nullable=True),
        sa.Column('uploaded_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'bugs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('report_id', sa.Integer(), sa.ForeignKey('bug_reports.id'), nullable=False),
        sa.Column('bug_id', sa.String(100), nullable=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('severity', sa.String(20), server_default='medium'),
        sa.Column('status', sa.String(50), server_default='open'),
        sa.Column('environment', sa.String(20), server_default='qa'),
        sa.Column('sprint_name', sa.String(100), nullable=True),
        sa.Column('story_id', sa.Integer(), sa.ForeignKey('user_stories.id'), nullable=True),
        sa.Column('linked_case_id', sa.String(50), nullable=True),
        sa.Column('reporter', sa.String(100), nullable=True),
        sa.Column('assignee', sa.String(100), nullable=True),
        sa.Column('found_date', sa.Date(), nullable=True),
        sa.Column('resolved_date', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('bugs')
    op.drop_table('bug_reports')
    op.drop_column('user_stories', 'sprint')
