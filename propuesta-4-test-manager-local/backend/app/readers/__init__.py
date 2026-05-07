from .registry import DocumentReaderRegistry
from .txt_reader import TxtReader
from .docx_reader import DocxReader
from .pdf_reader import PdfReader

# Registry pre-cargado con todos los lectores disponibles
# OCP: para agregar un nuevo formato, solo agrega un reader y regístralo aquí
default_registry = DocumentReaderRegistry()
default_registry.register(TxtReader())
default_registry.register(DocxReader())
default_registry.register(PdfReader())

__all__ = ["default_registry", "DocumentReaderRegistry"]
