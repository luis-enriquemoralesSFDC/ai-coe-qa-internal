"""add project_chat_messages table

Revision ID: f3a72b8d4915
Revises: e8f4d3a9c521
Create Date: 2026-04-29 01:05:00.000000

Crea la tabla `project_chat_messages` para el Asistente de proyecto (chat
contextualizado por proyecto, accesible desde ProjectPage y StoryPage).

Aditiva: no toca columnas existentes ni datos previos. Cero impacto en migrar
hacia adelante o atrás. CASCADE delete con projects para que al borrar un
proyecto desaparezca su historial de chat (mismo patrón que stories y test_plans).

Compatible con SQLite (dev) y Postgres (Heroku):
- create_table funciona idéntico en ambos motores.
- server_default usa expresiones portátiles.
- El índice compuesto (project_id, turn_index) UNIQUE garantiza orden estable
  y previene duplicados accidentales.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'f3a72b8d4915'
down_revision: Union[str, None] = 'e8f4d3a9c521'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'project_chat_messages',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column(
            'project_id', sa.Integer(),
            sa.ForeignKey('projects.id', ondelete='CASCADE'),
            nullable=False, index=True,
        ),
        sa.Column('turn_index', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False, server_default=''),
        # story_id opcional, sin FK estricta: el chat puede sobrevivir aunque
        # la HU referida desaparezca (por borrado del QA o por error).
        sa.Column('story_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        'ix_project_chat_messages_project_turn',
        'project_chat_messages',
        ['project_id', 'turn_index'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index('ix_project_chat_messages_project_turn', table_name='project_chat_messages')
    op.drop_table('project_chat_messages')
