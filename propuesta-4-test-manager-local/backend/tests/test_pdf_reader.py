"""
Tests del post-procesamiento del PdfReader.

Escenarios cubiertos:
- Limpieza de markers de paginación (Jira/Confluence/Google Docs).
- Re-unión de palabras/frases partidas en bordes de página.
- Conservación de contenido literal (queries SQL, merge fields, listas
  numeradas separadas).
- Smoke con fragmentos reales tomados de los 2 PDFs que el QA reportó.

No invocamos pdfplumber: testeamos `_post_process` directamente con
`list[str]` como input. Eso aísla la lógica de cleanup del parsing PDF.
"""
from __future__ import annotations

from app.readers.pdf_reader import PdfReader, _PAGE_MARKER_RE


# ── Marker regex unitarios ───────────────────────────────────────────────────


class TestPageMarkerRegex:
    def test_matches_dashed_jira_style(self):
        assert _PAGE_MARKER_RE.match("-- 1 of 4 --")
        assert _PAGE_MARKER_RE.match("-- 12 of 100 --")

    def test_matches_simple_of(self):
        assert _PAGE_MARKER_RE.match("1 of 4")
        assert _PAGE_MARKER_RE.match("Page 1 of 4")
        assert _PAGE_MARKER_RE.match("page 5 of 10")

    def test_matches_slash_and_de(self):
        assert _PAGE_MARKER_RE.match("1 / 4")
        assert _PAGE_MARKER_RE.match("1 de 4")
        assert _PAGE_MARKER_RE.match("Página 2 de 6")
        assert _PAGE_MARKER_RE.match("pág. 3 de 5")

    def test_does_not_match_legitimate_content(self):
        assert not _PAGE_MARKER_RE.match("4. Debe tener completa la documentación")
        assert not _PAGE_MARKER_RE.match("Resolvió 3 de los 5 problemas reportados")
        assert not _PAGE_MARKER_RE.match("Sprint: PI1_2026 Postorder Sprint 3")
        assert not _PAGE_MARKER_RE.match("AGL99036-3776")


# ── Limpieza de markers ──────────────────────────────────────────────────────


class TestPageMarkerStripping:
    def test_empty_pages_returns_empty_string(self):
        assert PdfReader._post_process([]) == ""

    def test_strips_jira_dashed_markers(self):
        pages = [
            "Contenido página uno.\n-- 1 of 2 --",
            "-- 2 of 2 --\nContenido página dos.",
        ]
        out = PdfReader._post_process(pages)
        assert "-- 1 of 2 --" not in out
        assert "-- 2 of 2 --" not in out
        assert "Contenido página uno." in out
        assert "Contenido página dos." in out

    def test_strips_multiple_marker_formats(self):
        pages = [
            "Texto A\nPage 1 of 3",
            "1 / 3\nTexto B\npág. 2 de 3",
            "Texto C\nPágina 3 de 3",
        ]
        out = PdfReader._post_process(pages)
        for marker in ("Page 1 of 3", "1 / 3", "pág. 2 de 3", "Página 3 de 3"):
            assert marker not in out
        assert "Texto A" in out
        assert "Texto B" in out
        assert "Texto C" in out

    def test_preserves_legitimate_lines_with_numbers(self):
        pages = [
            "4. Debe tener completa la documentación descrita en los Criterios.\n"
            "5. Todos los Items (Hijos) deben estar terminados, incluyendo defectos."
        ]
        out = PdfReader._post_process(pages)
        assert "4. Debe tener completa la documentación" in out
        assert "5. Todos los Items" in out


# ── Re-unión de frases partidas ──────────────────────────────────────────────


class TestPageJoining:
    def test_joins_when_last_word_is_function_word_and_next_is_uppercase(self):
        pages = [
            "Bla bla.\n4. Debe tener completa la documentación descrita en los Criterios de",
            "Aceptación.\n5. Todos los Items deben estar terminados.",
        ]
        out = PdfReader._post_process(pages)
        assert "los Criterios de Aceptación." in out
        assert "Aceptación.\n5. Todos" in out  # no se mete con el siguiente ítem

    def test_joins_when_next_starts_lowercase(self):
        pages = [
            "El sistema deberá generar automáticamente el reporte y enviarlo",
            "por correo electrónico cada día.",
        ]
        out = PdfReader._post_process(pages)
        assert (
            "el reporte y enviarlo por correo electrónico cada día." in out
        )

    def test_does_not_join_when_previous_ends_with_period(self):
        pages = [
            "Total exitosos.",
            "Otros campos del archivo.",
        ]
        out = PdfReader._post_process(pages)
        assert "Total exitosos.\nOtros campos" in out
        assert "Total exitosos. Otros" not in out

    def test_does_not_join_separate_numbered_items_across_pages(self):
        pages = [
            "5. IdRegistroSalesforce / FolioProceso",
            "6. NombreNegocio",
        ]
        out = PdfReader._post_process(pages)
        assert "5. IdRegistroSalesforce / FolioProceso\n6. NombreNegocio" in out
        assert "FolioProceso 6." not in out

    def test_does_not_join_when_previous_ends_with_question_mark(self):
        pages = ["¿Qué pasa si el cliente no responde?", "El sistema reintenta."]
        out = PdfReader._post_process(pages)
        assert "?\nEl sistema" in out

    def test_handles_empty_page_in_middle(self):
        pages = [
            "Texto previo.",
            "",
            "Texto posterior.",
        ]
        out = PdfReader._post_process(pages)
        assert "Texto previo." in out
        assert "Texto posterior." in out


# ── Smoke con fragmentos reales de los PDFs reportados ───────────────────────


class TestSmokeRealDocs:
    """Replica el patrón de paginación + corte de palabra que vimos en los
    PDFs reales del QA (AGL99036-3776 y Guías Journey Builder)."""

    def test_doc1_jira_export_pattern(self):
        pages = [
            (
                "DOD: 1. Cumple Criterios de Aceptación.\n"
                "2. Funcionalidad lista para ser liberada a Producción.\n"
                "3. Pruebas funcionales e integración aprobadas con evidencia.\n"
                "4. Debe tener completa la documentación descrita en los Criterios de\n"
                "-- 1 of 4 --"
            ),
            (
                "Aceptación.\n"
                "5. Todos los Items (Hijos) deben estar terminados, incluyendo defectos."
            ),
        ]
        out = PdfReader._post_process(pages)
        assert "-- 1 of 4 --" not in out
        assert "los Criterios de Aceptación." in out
        assert "5. Todos los Items" in out

    def test_doc1_layout_columns_not_merged_across_pages(self):
        """En el Layout del Archivo (33 columnas), columnas separadas por
        un page-break no deben fusionarse en una sola línea."""
        pages = [
            (
                "Layout del Archivo\n"
                "1. Columnas:\n"
                "1. FechaHoraInyeccion\n"
                "2. EstatusInyeccionSAP\n"
                "3. IDClienteSAP\n"
                "4. MotivoErrorSAP\n"
                "5. IdRegistroSalesforce / FolioProceso\n"
                "-- 2 of 4 --"
            ),
            (
                "6. NombreNegocio\n"
                "7. ZonaVentas\n"
                "8. CentroSuministro"
            ),
        ]
        out = PdfReader._post_process(pages)
        assert "-- 2 of 4 --" not in out
        assert "5. IdRegistroSalesforce / FolioProceso" in out
        assert "6. NombreNegocio" in out
        assert "FolioProceso\n6. NombreNegocio" in out
        assert "FolioProceso 6." not in out

    def test_doc2_journey_builder_with_sql_block(self):
        """Las queries SQL de SFMC NO deben perder ni tabular ni formato."""
        pages = [
            (
                "Automations:\n"
                "1.- Automation Query: Generación Link\n"
                "SELECT C.AccountId,C.ContactId,C.ID as\n"
                "CaseId,C.Status,C.ClosedDate,A.Id_SAP__c,A.Id AS Account_ID\n"
                "FROM ENT.Case_Salesforce_1 C\n"
                "JOIN ENT.Account_Salesforce_1 A\n"
                "ON C.AccountId=A.Id\n"
                "LEFT JOIN DEV_JOURNEY_CREACION_LINK_ENCUESTA_HIST H\n"
                "ON C.ID=H.CaseId\n"
                "-- 4 of 6 --"
            ),
            (
                "WHERE C.Status='Cerrado' AND A.Id_SAP__c IS NOT NULL\n"
                "AND (CAST (C.ClosedDate AS DATE) =CAST (GETDATE() AS DATE) )\n"
                "AND H.CaseId IS NULL"
            ),
        ]
        out = PdfReader._post_process(pages)
        assert "-- 4 of 6 --" not in out
        assert "ON C.ID=H.CaseId" in out
        assert "WHERE C.Status='Cerrado'" in out
        assert "Id_SAP__c IS NOT NULL" in out

    def test_doc2_preserves_merge_fields_and_urls(self):
        """Los merge fields %%FirstName%% y URLs no deben sufrir ninguna
        alteración en el cleanup."""
        pages = [
            (
                "SMS:\n"
                "¡Bienvenido a Juntos+, %%FirstName%%!, "
                "Tu número de cliente es: %%Id_SAP__c%%\n"
                "Ingresa: https://sw03-j4-qa-adfse4f5egbwdbhw.z01.azurefd.net/MX/login?id=120105572"
            )
        ]
        out = PdfReader._post_process(pages)
        assert "%%FirstName%%" in out
        assert "%%Id_SAP__c%%" in out
        assert "https://sw03-j4-qa-adfse4f5egbwdbhw.z01.azurefd.net/MX/login?id=120105572" in out
