from __future__ import annotations
class TxtReader:
    """Lee archivos de texto plano y Markdown."""

    @property
    def supported_extensions(self) -> set[str]:
        return {".txt", ".md"}

    def read(self, content: bytes) -> str:
        try:
            return content.decode("utf-8")
        except UnicodeDecodeError:
            return content.decode("latin-1", errors="ignore")
