from __future__ import annotations
"""SRP — acceso a datos de bug reports y bugs."""
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models import Bug, BugReport, UserStory


class BugRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    # ── BugReport ────────────────────────────────────────────────────────────

    def create_report(self, project_id: int, uploaded_by: int, **fields) -> BugReport:
        report = BugReport(project_id=project_id, uploaded_by=uploaded_by, **fields)
        self._db.add(report)
        self._db.commit()
        self._db.refresh(report)
        return report

    def list_reports(self, project_id: int) -> list[BugReport]:
        return (self._db.query(BugReport)
                .filter(BugReport.project_id == project_id)
                .order_by(BugReport.created_at.desc())
                .all())

    def get_report(self, report_id: int, project_id: int) -> BugReport | None:
        return (self._db.query(BugReport)
                .filter(BugReport.id == report_id, BugReport.project_id == project_id)
                .first())

    def delete_report(self, report: BugReport) -> None:
        self._db.delete(report)
        self._db.commit()

    # ── Bugs ─────────────────────────────────────────────────────────────────

    def create_many_bugs(self, bugs: list[Bug]) -> list[Bug]:
        self._db.add_all(bugs)
        self._db.commit()
        for b in bugs:
            self._db.refresh(b)
        return bugs

    def list_bugs(
        self,
        project_id: int,
        sprint_name: str | None = None,
        environment: str | None = None,
        severity: str | None = None,
        status: str | None = None,
    ) -> list[Bug]:
        q = (self._db.query(Bug)
             .join(BugReport, Bug.report_id == BugReport.id)
             .filter(BugReport.project_id == project_id))
        if sprint_name:
            q = q.filter(Bug.sprint_name == sprint_name)
        if environment:
            q = q.filter(Bug.environment == environment)
        if severity:
            q = q.filter(Bug.severity == severity)
        if status:
            q = q.filter(Bug.status == status)
        return q.order_by(Bug.created_at.desc()).all()

    def update_bug_link(self, bug: Bug, story_id: int | None, linked_case_id: str | None) -> Bug:
        bug.story_id = story_id
        bug.linked_case_id = linked_case_id
        self._db.commit()
        self._db.refresh(bug)
        return bug

    def get_bug(self, bug_id: int, project_id: int) -> Bug | None:
        return (self._db.query(Bug)
                .join(BugReport, Bug.report_id == BugReport.id)
                .filter(Bug.id == bug_id, BugReport.project_id == project_id)
                .first())

    # ── Aggregate queries for KPIs ───────────────────────────────────────────

    def count_total(self, project_id: int) -> int:
        return (self._db.query(func.count(Bug.id))
                .join(BugReport)
                .filter(BugReport.project_id == project_id)
                .scalar() or 0)

    def count_by_status(self, project_id: int) -> dict[str, int]:
        rows = (self._db.query(Bug.status, func.count(Bug.id))
                .join(BugReport)
                .filter(BugReport.project_id == project_id)
                .group_by(Bug.status)
                .all())
        return {row[0]: row[1] for row in rows}

    def count_by_environment(self, project_id: int) -> dict[str, int]:
        rows = (self._db.query(Bug.environment, func.count(Bug.id))
                .join(BugReport)
                .filter(BugReport.project_id == project_id)
                .group_by(Bug.environment)
                .all())
        return {(row[0] or "sin_ambiente"): row[1] for row in rows}

    def severity_by_sprint(self, project_id: int) -> list[dict]:
        """Retorna [{sprint, severity, count}] para gráficas."""
        rows = (self._db.query(Bug.sprint_name, Bug.severity, func.count(Bug.id))
                .join(BugReport)
                .filter(BugReport.project_id == project_id)
                .group_by(Bug.sprint_name, Bug.severity)
                .order_by(Bug.sprint_name)
                .all())
        return [{"sprint": r[0] or "Sin sprint", "severity": r[1], "count": r[2]} for r in rows]

    def list_sprints(self, project_id: int) -> list[str]:
        rows = (self._db.query(Bug.sprint_name)
                .join(BugReport)
                .filter(BugReport.project_id == project_id, Bug.sprint_name.isnot(None))
                .distinct()
                .order_by(Bug.sprint_name)
                .all())
        return [r[0] for r in rows if r[0]]

    def get_story_ids_in_project(self, project_id: int) -> list[UserStory]:
        return (self._db.query(UserStory)
                .filter(UserStory.project_id == project_id)
                .all())
