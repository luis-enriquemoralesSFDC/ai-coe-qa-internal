"""add story review columns (archetypes, edge_cases_baseline, last_review_at)

Revision ID: e8f4d3a9c521
Revises: d7e1c8a4f923
Create Date: 2026-04-28 21:10:00.000000

Migración aditiva. Todas las columnas son nullable para que las HUs existentes
sigan funcionando sin backfill. Las llena el StoryReviewService cuando el QA
ejecuta el flujo "Revisar con QA Agent".
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'e8f4d3a9c521'
down_revision: Union[str, None] = 'd7e1c8a4f923'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('user_stories') as batch:
        batch.add_column(sa.Column('archetypes', sa.JSON(), nullable=True))
        batch.add_column(sa.Column('edge_cases_baseline', sa.JSON(), nullable=True))
        batch.add_column(sa.Column('last_review_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('user_stories') as batch:
        batch.drop_column('last_review_at')
        batch.drop_column('edge_cases_baseline')
        batch.drop_column('archetypes')
