#!/usr/bin/env python3
"""
CLI para crear el PRIMER admin o promover a un user existente.

Uso (desde propuesta-2-test-manager/backend con venv activo):

    python scripts/create_admin.py --email lau@salesforce.com --password 'algoSeguro' --name "Lau"

Si el email ya existe:
- valida la password contra el hash actual
- pone is_admin=True
Si no existe:
- crea el user con is_admin=True (valida @salesforce.com)

Nota: este script aplica las migraciones primero — corré también la app al menos una vez
para que la BD esté en el último schema (también lo intentamos acá por seguridad).
"""
from __future__ import annotations
import argparse
import getpass
import os
import sys

# Asegura que el paquete `app` sea importable cuando se corre desde backend/
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig

from app.auth.utils import hash_password, verify_password
from app.database import SessionLocal
from app.models import User
from app.schemas import _ALLOWED_EMAIL_DOMAIN  # type: ignore[attr-defined]


def _run_migrations() -> None:
    cfg = AlembicConfig(os.path.join(ROOT, "alembic.ini"))
    alembic_command.upgrade(cfg, "head")


def _validate_email(email: str) -> str:
    domain = email.rsplit("@", 1)[-1].lower() if "@" in email else ""
    if domain != _ALLOWED_EMAIL_DOMAIN:
        raise SystemExit(
            f"Email inválido: solo se permiten direcciones @{_ALLOWED_EMAIL_DOMAIN}"
        )
    return email.lower().strip()


def main() -> None:
    parser = argparse.ArgumentParser(description="Crear/promover admin en QA Test Manager")
    parser.add_argument("--email", required=True, help="Email del admin (debe ser @salesforce.com)")
    parser.add_argument("--name", default=None, help="Nombre (solo si crea user nuevo)")
    parser.add_argument("--password", default=None, help="Password (si se omite, prompt)")
    args = parser.parse_args()

    email = _validate_email(args.email)
    password = args.password or getpass.getpass("Password: ")
    if not password or len(password) < 8:
        raise SystemExit("La password debe tener al menos 8 caracteres")

    _run_migrations()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            name = args.name or email.split("@")[0]
            user = User(
                name=name,
                email=email,
                password_hash=hash_password(password),
                is_admin=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"OK creado admin nuevo id={user.id} email={user.email}")
        else:
            if not verify_password(password, user.password_hash):
                raise SystemExit(
                    "Email ya existe pero la password no coincide. "
                    "Pasá la password correcta para promover, o resetéa la password manualmente en la BD."
                )
            user.is_admin = True
            db.commit()
            db.refresh(user)
            print(f"OK promovido a admin id={user.id} email={user.email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
