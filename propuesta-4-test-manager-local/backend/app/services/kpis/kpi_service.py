from __future__ import annotations
"""
Calcula todos los KPIs de calidad para un proyecto.
Solo lectura — no modifica datos.
"""
import logging
from sqlalchemy.orm import Session
from sqlalchemy import func
from ...models import Bug, BugReport, UserStory, TestCase
from ...repositories.bug_repository import BugRepository

logger = logging.getLogger(__name__)


class KpiService:
    def __init__(self, db: Session, bug_repo: BugRepository) -> None:
        self._db = db
        self._bug_repo = bug_repo

    # ── Contadores base ───────────────────────────────────────────────────────

    def _stories_and_cases(self, project_id: int) -> tuple[int, int, int, int]:
        """Retorna (total_stories, total_cases, pass_cases, fail_cases)."""
        total_stories = (self._db.query(func.count(UserStory.id))
                         .filter(UserStory.project_id == project_id)
                         .scalar() or 0)
        totals = (self._db.query(TestCase.status, func.count(TestCase.id))
                  .join(UserStory, TestCase.story_id == UserStory.id)
                  .filter(UserStory.project_id == project_id)
                  .group_by(TestCase.status)
                  .all())
        counts = {row[0]: row[1] for row in totals}
        total_cases = sum(counts.values())
        pass_cases = counts.get("pass", 0)
        fail_cases = counts.get("fail", 0)
        return total_stories, total_cases, pass_cases, fail_cases

    # ── KPI: Resumen general ──────────────────────────────────────────────────

    def get_summary(self, project_id: int) -> dict:
        total_bugs = self._bug_repo.count_total(project_id)
        by_status = self._bug_repo.count_by_status(project_id)
        by_env = self._bug_repo.count_by_environment(project_id)

        # Conteo por severidad
        sev_rows = (self._db.query(Bug.severity, func.count(Bug.id))
                    .join(BugReport)
                    .filter(BugReport.project_id == project_id)
                    .group_by(Bug.severity)
                    .all())
        by_sev = {r[0]: r[1] for r in sev_rows}

        total_stories, total_cases, pass_cases, fail_cases = self._stories_and_cases(project_id)

        # FPY = casos aprobados / (aprobados + fallidos) * 100
        denominator = pass_cases + fail_cases
        fpy = round((pass_cases / denominator * 100), 1) if denominator > 0 else 0.0

        # TC Effectiveness = bugs vinculados a historias / total casos * 100
        linked_bugs = (self._db.query(func.count(Bug.id))
                       .join(BugReport)
                       .filter(BugReport.project_id == project_id, Bug.story_id.isnot(None))
                       .scalar() or 0)
        tc_effectiveness = round((linked_bugs / total_cases * 100), 1) if total_cases > 0 else 0.0

        # Rejected: status rejected + wont_fix
        rejected = (by_status.get("rejected", 0) + by_status.get("wont_fix", 0))

        return {
            "total_bugs": total_bugs,
            "open_bugs": by_status.get("open", 0),
            "resolved_bugs": by_status.get("resolved", 0),
            "rejected_bugs": rejected,
            "bugs_qa": by_env.get("qa", 0),
            "bugs_uat": by_env.get("uat", 0),
            "bugs_sit": by_env.get("sit", 0),
            "bugs_prod": by_env.get("prod", 0),
            "total_stories": total_stories,
            "total_test_cases": total_cases,
            "pass_test_cases": pass_cases,
            "fail_test_cases": fail_cases,
            "fpy_percent": fpy,
            "tc_effectiveness": tc_effectiveness,
            "critical_bugs": by_sev.get("critical", 0),
            "high_bugs": by_sev.get("high", 0),
            "medium_bugs": by_sev.get("medium", 0),
            "low_bugs": by_sev.get("low", 0),
        }

    # ── KPI: Severidad por sprint ─────────────────────────────────────────────

    def get_severity_by_sprint(self, project_id: int) -> list[dict]:
        return self._bug_repo.severity_by_sprint(project_id)

    # ── KPI: First Pass Yield por sprint ─────────────────────────────────────

    def get_fpy_by_sprint(self, project_id: int) -> list[dict]:
        """
        Para cada sprint: FPY = casos 'pass' / (pass + fail) de historias de ese sprint.
        Si una historia no tiene sprint asignado, se agrupa como "Sin sprint".
        """
        rows = (self._db.query(
                    UserStory.sprint,
                    TestCase.status,
                    func.count(TestCase.id)
                )
                .join(TestCase, TestCase.story_id == UserStory.id)
                .filter(UserStory.project_id == project_id)
                .group_by(UserStory.sprint, TestCase.status)
                .all())

        # Agrupar por sprint
        sprint_data: dict[str, dict[str, int]] = {}
        for sprint, status, count in rows:
            sprint_key = sprint or "Sin sprint"
            if sprint_key not in sprint_data:
                sprint_data[sprint_key] = {"pass": 0, "fail": 0, "total": 0}
            sprint_data[sprint_key][status] = sprint_data[sprint_key].get(status, 0) + count
            sprint_data[sprint_key]["total"] += count

        result = []
        for sprint_key, counts in sorted(sprint_data.items()):
            denominator = counts["pass"] + counts["fail"]
            fpy = round(counts["pass"] / denominator * 100, 1) if denominator > 0 else 0.0
            result.append({
                "sprint": sprint_key,
                "total": counts["total"],
                "passed": counts["pass"],
                "fpy_percent": fpy,
            })
        return result

    # ── KPI: TC Effectiveness por historia ───────────────────────────────────

    def get_effectiveness_by_story(self, project_id: int) -> list[dict]:
        """
        Por historia: cuántos bugs se encontraron vs cuántos casos de prueba tiene.
        Effectiveness = bugs_encontrados / total_casos * 100.
        """
        stories = (self._db.query(UserStory)
                   .filter(UserStory.project_id == project_id)
                   .all())

        result = []
        for story in stories:
            total_cases = len(story.test_cases) if story.test_cases else 0
            bug_count = (self._db.query(func.count(Bug.id))
                         .filter(Bug.story_id == story.id)
                         .scalar() or 0)
            criteria_count = len(story.acceptance_criteria.split("\n")) if story.acceptance_criteria else 0
            effectiveness = round(bug_count / total_cases * 100, 1) if total_cases > 0 else 0.0
            result.append({
                "story_id": story.id,
                "story_title": story.title,
                "sprint": story.sprint,
                "total_cases": total_cases,
                "bugs_found": bug_count,
                "acceptance_criteria_count": criteria_count,
                "effectiveness": effectiveness,
            })
        return result
