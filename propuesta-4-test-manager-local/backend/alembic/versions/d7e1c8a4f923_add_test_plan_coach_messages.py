"""add test_plan_coach_messages table

Revision ID: d7e1c8a4f923
Revises: c9f5a3b21d04
Create Date: 2026-04-25 03:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'd7e1c8a4f923'
down_revision: Union[str, None] = 'c9f5a3b21d04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'test_plan_coach_messages',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column(
            'plan_id', sa.Integer(),
            sa.ForeignKey('test_plans.id', ondelete='CASCADE'),
            nullable=False, index=True,
        ),
        sa.Column('turn_index', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False, server_default=''),
        sa.Column('actions', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        'ix_test_plan_coach_messages_plan_turn',
        'test_plan_coach_messages',
        ['plan_id', 'turn_index'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index('ix_test_plan_coach_messages_plan_turn', table_name='test_plan_coach_messages')
    op.drop_table('test_plan_coach_messages')
