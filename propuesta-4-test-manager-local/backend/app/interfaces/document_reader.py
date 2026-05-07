from __future__ import annotations
"""
OCP — Open/Closed Principle
LSP — Liskov Substitution Principle

Cada lector implementa este protocolo. Agregar un nuevo formato
= crear una nueva clase, sin modificar el código existente.
"""
from typing import Protocol


class IDocumentReader(Protocol):
    """Lee bytes de un archivo y retorna su contenido como texto plano."""

    def read(self, content: bytes) -> str:
        ...

    @property
    def supported_extensions(self) -> set[str]:
        ...
