from __future__ import annotations
"""
OCP — el registry permite agregar nuevos lectores sin modificar código existente.
"""
from ..interfaces.document_reader import IDocumentReader


class DocumentReaderRegistry:
    def __init__(self) -> None:
        self._readers: dict[str, IDocumentReader] = {}

    def register(self, reader: IDocumentReader) -> None:
        for ext in reader.supported_extensions:
            self._readers[ext] = reader

    def get(self, extension: str) -> IDocumentReader:
        reader = self._readers.get(extension.lower())
        if reader is None:
            supported = ", ".join(sorted(self._readers.keys()))
            raise ValueError(f"Formato '{extension}' no soportado. Formatos disponibles: {supported}")
        return reader

    @property
    def supported_extensions(self) -> set[str]:
        return set(self._readers.keys())
