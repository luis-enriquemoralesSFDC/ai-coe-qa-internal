"""add test_plans table

Revision ID: c9f5a3b21d04
Revises: b7d2e1f4a890
Create Date: 2026-04-25 03:05:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'c9f5a3b21d04'
down_revision: Union[str, None] = 'b7d2e1f4a890'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'test_plans',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('client_name', sa.String(200), nullable=False),
        sa.Column('doc_version', sa.String(20), nullable=False, server_default='1.0'),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('wizard_data', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('markdown_content', sa.Text()),
        sa.Column('pending_fields', sa.JSON(), server_default='[]'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.Column('generated_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('test_plans')
