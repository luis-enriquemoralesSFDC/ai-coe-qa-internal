from __future__ import annotations
"""
SRP — orquesta la importación de documentos: leer + extraer + guardar.
DIP — depende de IDocumentExtractor y del registry de readers (abstracciones).
OCP — agregar un formato nuevo no requiere tocar este servicio.
"""
from ..interfaces.ai_provider import IDocumentExtractor
from ..models import User, UserStory
from ..readers.registry import DocumentReaderRegistry
from ..repositories.story_repository import StoryRepository
from .usage_service import UsageService

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


class DocumentService:
    def __init__(
        self,
        story_repo: StoryRepository,
        reader_registry: DocumentReaderRegistry,
        extractor: IDocumentExtractor,
        usage_service: UsageService,
    ) -> None:
        self._repo = story_repo
        self._registry = reader_registry
        self._extractor = extractor
        self._usage = usage_service

    @property
    def supported_extensions(self) -> set[str]:
        return self._registry.supported_extensions

    async def import_from_file(
        self, project_id: int, filename: str, content: bytes, user: User,
    ) -> UserStory:
        self._usage.ensure_within_budget(user)
        if len(content) > MAX_FILE_SIZE:
            raise ValueError("El archivo no puede superar 10 MB")

        ext = self._get_extension(filename)
        reader = self._registry.get(ext)
        raw_text = reader.read(content)

        if not raw_text.strip():
            raise ValueError("El documento está vacío o no se pudo leer su contenido")

        data, usage = await self._extractor.extract(raw_text, filename)
        self._usage.record(user.id, usage)
        return self._repo.create(
            project_id=project_id,
            source="documento",
            title=data["title"],
            description=data["description"],
            acceptance_criteria=data["acceptance_criteria"],
            external_id=data["external_id"] or None,
        )

    @staticmethod
    def _get_extension(filename: str) -> str:
        return ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
