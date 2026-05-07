from __future__ import annotations
"""
Lector de PDFs.

Etapas:
1. pdfplumber extrae el texto página por página.
2. Post-procesamos para:
   - Quitar markers de paginación tipo "-- 1 of 4 --", "Page 1 of 4", "1 / 4"
     que exports de Jira/Confluence dejan entre páginas. El LLM los lee como
     ruido y a veces los interpreta como separadores lógicos de secciones.
   - Re-unir palabras o frases partidas en el borde de página
     (ej: "Criterios de" \n [break] \n "Aceptación.") usando heurísticas
     conservadoras para no introducir falsos positivos.

El contrato público (`IDocumentReader`) no cambia: sigue siendo
`read(content: bytes) -> str` y `supported_extensions -> {'.pdf'}`.
"""
import io
import re

# Markers de paginación habituales en exports de Jira / Confluence / Google Docs.
# Cubrimos las variantes más comunes (case-insensitive, anclado a la línea entera
# tras strip). Falsos positivos posibles solo si una línea legítima del doc es
# literalmente "1 of 4" o "Page 5 of 10", caso extremadamente raro en HUs.
_PAGE_MARKER_RE = re.compile(
    r"^\s*"
    r"(?:--\s*)?"
    r"(?:page\s+|pág\.?\s*|página\s+)?"
    r"\d+\s*(?:of|/|de)\s*\d+"
    r"(?:\s*--)?\s*$",
    re.IGNORECASE,
)

# Palabras-función (artículos, preposiciones, conjunciones cortas) que casi nunca
# terminan legítimamente una oración. Si una página termina con una de estas y la
# siguiente empieza con otra palabra (incluso en mayúscula porque suele ser
# nombre propio compuesto, ej: "los Criterios de" + "Aceptación."), unimos.
_LIKELY_CONTINUATION_WORDS = frozenset({
    "a", "al", "ante", "bajo", "con", "contra",
    "de", "del", "desde", "durante",
    "en", "entre",
    "hacia", "hasta",
    "mediante",
    "para", "por",
    "según", "segun",
    "sin", "sobre",
    "tras",
    "y", "o", "u", "e",
    "que",
    "el", "la", "los", "las",
    "un", "una", "unos", "unas",
    "lo", "le", "les", "se",
})

# Caracteres de cierre que indican que la línea terminó "limpia" — si la línea
# de borde de página termina con uno de estos, NO unimos con la siguiente.
_CLOSING_PUNCT = frozenset(".!?:;)]}\"'”»…")


class PdfReader:
    """Lee documentos PDF y limpia ruido típico de paginación."""

    @property
    def supported_extensions(self) -> set[str]:
        return {".pdf"}

    def read(self, content: bytes) -> str:
        import pdfplumber

        pages: list[str] = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    pages.append(text)

        return self._post_process(pages)

    @classmethod
    def _post_process(cls, pages: list[str]) -> str:
        if not pages:
            return ""

        page_lines: list[list[str]] = []
        for page in pages:
            lines: list[str] = []
            for raw_line in page.splitlines():
                stripped = raw_line.strip()
                if not stripped:
                    continue
                if _PAGE_MARKER_RE.match(stripped):
                    continue
                lines.append(raw_line)
            page_lines.append(lines)

        for i in range(len(page_lines) - 1):
            cur = page_lines[i]
            nxt = page_lines[i + 1]
            if not cur or not nxt:
                continue
            last = cur[-1].rstrip()
            first = nxt[0].lstrip()
            if cls._should_join_across_pages(last, first):
                cur[-1] = f"{last} {first}"
                nxt.pop(0)

        flat: list[str] = []
        for lines in page_lines:
            flat.extend(lines)
        return "\n".join(flat)

    @staticmethod
    def _should_join_across_pages(last: str, first: str) -> bool:
        """Heurística conservadora para decidir si dos líneas en el borde de
        página son en realidad una sola frase partida.

        Disparamos la unión solo si:
        - La línea anterior NO termina con puntuación de cierre, Y
        - (a) la siguiente empieza con minúscula (claramente continuación), o
        - (b) la línea anterior termina con palabra-función gramatical
              (de, en, los, para, …) — caso típico de "los Criterios de" +
              "Aceptación." donde la siguiente arranca con mayúscula porque
              es un nombre propio compuesto.

        Ejemplos que SÍ disparan unión:
          "los Criterios de"   +   "Aceptación."   → join (palabra-función)
          "El sistema deberá generar"   +   "el reporte..."   → join (minúscula)

        Ejemplos que NO disparan unión:
          "MotivoErrorSAP con valor"   +   "3. IDClienteSAP vacío"   → no join
          "5. IdRegistroSalesforce"   +   "6. NombreNegocio"   → no join
          "Total exitosos."   +   "Otros campos..."   → no join (puntuación cierre)
        """
        if not last or not first:
            return False
        if last[-1] in _CLOSING_PUNCT:
            return False
        if first[0].islower():
            return True
        last_word = last.split()[-1].lower().strip(",;:()[]{}\"'“”«»")
        return last_word in _LIKELY_CONTINUATION_WORDS
