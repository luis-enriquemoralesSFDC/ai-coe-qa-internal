"""add test_runs table

Revision ID: g4h5i6j7k8l9
Revises: f3a72b8d4915
Create Date: 2026-05-13 16:30:00.000000

Crea la tabla `test_runs` para orquestar ejecuciones automáticas de casos de
prueba via Cursor SDK + Playwright MCP.

Modelo de coordinación:
- El frontend hace POST y crea una row con status=queued.
- Un worker Node externo (carpeta qa-worker/) polea la tabla, toma la fila,
  ejecuta el agente, y va escribiendo status (running -> waiting_login ->
  finished/error) y el resultado.
- Para "ya me logué, continúa", el frontend hace POST /continue, lo cual setea
  continue_signal=true en la row. El worker lo detecta en su poll y manda el
  follow-up al agente.
- Para cancelar, el frontend hace POST /cancel, que setea cancel_signal=true.

CASCADE delete con users y projects para que al eliminar un proyecto/usuario
desaparezcan sus runs históricos. status indexado para la query del worker
(`WHERE status='queued' ORDER BY created_at LIMIT 1`).

Aditiva: no toca columnas existentes ni datos previos.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'g4h5i6j7k8l9'
down_revision: Union[str, None] = 'f3a72b8d4915'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'test_runs',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column(
            'user_id', sa.Integer(),
            sa.ForeignKey('users.id', ondelete='CASCADE'),
            nullable=False, index=True,
        ),
        sa.Column(
            'project_id', sa.Integer(),
            sa.ForeignKey('projects.id', ondelete='CASCADE'),
            nullable=False, index=True,
        ),

        # Casos a ejecutar — lista de IDs de test_cases.
        # No se usa FK porque queremos preservar el run aunque alguno de los
        # casos sea borrado más tarde (auditoría histórica).
        sa.Column('case_ids', sa.JSON(), nullable=False),

        # Configuración del run.
        sa.Column('env', sa.String(20), nullable=False),
        sa.Column('base_url', sa.String(500), nullable=False),
        sa.Column('model_id', sa.String(100), nullable=False, server_default='claude-haiku-4-5'),
        sa.Column('prompt', sa.Text(), nullable=False),

        # Estado del run.
        # queued | running | waiting_login | finished | error | cancelled
        sa.Column('status', sa.String(20), nullable=False, server_default='queued', index=True),

        # Señales de control. El frontend las prende, el worker las consume.
        sa.Column('continue_signal', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('cancel_signal', sa.Boolean(), nullable=False, server_default='0'),

        # Trazabilidad del SDK.
        sa.Column('agent_id', sa.String(200), nullable=True),
        sa.Column('result', sa.Text(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),

        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('test_runs')
