import csv
import io
from datetime import date, datetime, timedelta

from flask import Blueprint, Response, current_app, g, request
from sqlalchemy import or_, select

from .. import catalog
from ..analysis import active_documents, evidence_graph, latest_runs
from ..auth import require
from ..errors import ApiError, ok
from ..models import Application, AuditLog, Institution, ReviewAction, db, utcnow
from ..services import (
    application_summary,
    audit,
    checklist,
    document_json,
    event,
    event_json,
    institution_json,
    iso,
    open_clarification,
    set_status,
    timeline_stages,
)

bp = Blueprint("official", __name__)
ANY_OFFICIAL = catalog.OFFICIAL_ROLES

INSTITUTION_MESSAGES = {
    "mark_field_verification": "Your application has been marked for field verification. Officials may contact you to schedule a visit.",
    "forward_review": "Your application has been forwarded for final review.",
    "record_escalation": "Your application has been escalated for further review. No automatic suspension has been applied.",
}
EVENT_TYPES = {
    "request_clarification": "clarification_requested",
    "mark_field_verification": "field_verification_marked",
    "forward_review": "forwarded_final_review",
    "record_approval": "decision_recorded",
    "record_escalation": "decision_recorded",
}


def _period():
    def parse(name, default):
        raw = request.args.get(name)
        if not raw:
            return default
        try:
            return date.fromisoformat(raw)
        except ValueError:
            raise ApiError(422, "validation_failed", f"Invalid {name} date.")

    start = parse("from", date.fromisoformat(current_app.config["REPORTING_PERIOD_START"]))
    end = parse("to", date.today())
    if end < start:
        raise ApiError(422, "validation_failed", "Period end precedes start.")
    return start, end


def scoped_query(start, end):
    """The one dataset behind both the dashboard and the review queue."""
    return Application.query.join(Institution).filter(
        Application.status != "draft",
        Application.submitted_at >= datetime.combine(start, datetime.min.time()),
        Application.submitted_at < datetime.combine(end + timedelta(days=1), datetime.min.time()),
    )


def period_json(start, end):
    return {"from": start.isoformat(), "to": end.isoformat(), "basis": "submission date"}


@bp.get("/api/official/dashboard")
@require("official", ANY_OFFICIAL)
def dashboard():
    start, end = _period()
    apps = scoped_query(start, end).all()
    by_status = {s: 0 for s in catalog.STATUS_BUCKETS}
    for a in apps:
        by_status[a.status] += 1
    buckets = {b: 0 for b in catalog.BUCKET_LABELS}
    for status, count in by_status.items():
        buckets[catalog.STATUS_BUCKETS[status]] += count
    assert sum(buckets.values()) == len(apps)
    recent = sorted(apps, key=lambda a: a.status_changed_at, reverse=True)[:5]
    return ok({
        "period": period_json(start, end),
        "role": g.user.role,
        "user": g.user.display_name,
        "totals": {
            "institutions": len({a.institution_id for a in apps}),
            "applications": len(apps),
            "documents": sum(len(active_documents(a)) for a in apps),
            "pending_review": buckets["pending_review"],
            "under_verification": buckets["under_verification"],
            "needs_clarification": buckets["needs_clarification"],
            "approved": buckets["approved"],
            "escalated": buckets["escalated"],
        },
        "buckets": [{"key": k, "label": catalog.BUCKET_LABELS[k], "count": v} for k, v in buckets.items()],
        "by_status": [{"status": s, "label": catalog.STATUS_LABELS[s], "count": c} for s, c in by_status.items()],
        "recent": [application_summary(a) for a in recent],
    })


@bp.get("/api/official/applications")
@require("official", ANY_OFFICIAL)
def list_applications():
    start, end = _period()
    q = scoped_query(start, end)
    search = (request.args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        q = q.filter(or_(Application.application_number.ilike(like), Institution.name.ilike(like)))
    app_type = request.args.get("type")
    if app_type:
        if app_type not in catalog.APP_TYPE_CODES:
            raise ApiError(422, "validation_failed", "Unknown application type.")
        q = q.filter(Application.app_type == app_type)
    status = request.args.get("status")
    if status:
        if status.startswith("bucket:"):
            statuses = [s for s, b in catalog.STATUS_BUCKETS.items() if b == status[7:]]
            q = q.filter(Application.status.in_(statuses))
        elif status in catalog.STATUS_BUCKETS:
            q = q.filter(Application.status == status)
        else:
            raise ApiError(422, "validation_failed", "Unknown status.")
    order = Application.submitted_at.asc() if request.args.get("sort") == "oldest" else Application.submitted_at.desc()
    total = q.count()
    page_size = min(max(request.args.get("page_size", 10, type=int), 1), 50)
    pages = max(1, -(-total // page_size))
    page = min(max(request.args.get("page", 1, type=int), 1), pages)
    rows = q.order_by(order, Application.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return ok({
        "period": period_json(start, end),
        "applications": [application_summary(a) for a in rows],
        "pagination": {"page": page, "page_size": page_size, "total": total, "pages": pages},
        "statuses": [{"value": s, "label": catalog.STATUS_LABELS[s]} for s in catalog.STATUS_BUCKETS],
        "types": [{"value": t["code"], "label": t["short"]} for t in catalog.APPLICATION_TYPES],
    })


def _case(app_id, lock=False):
    stmt = select(Application).where(Application.id == app_id, Application.status != "draft")
    if lock:
        stmt = stmt.with_for_update()
    app = db.session.execute(stmt).scalar_one_or_none()
    if not app:
        raise ApiError(404, "not_found", "Case not found.")
    return app


def allowed_actions(app, role):
    out = []
    cl = checklist(app)
    for key, spec in catalog.ACTIONS.items():
        reason = None
        if role not in spec["roles"]:
            reason = "Not permitted for your role"
        elif app.status not in spec["from"]:
            reason = f"Not available while the case is '{catalog.STATUS_LABELS[app.status]}'"
        elif key == "record_approval" and not cl["ready"]:
            reason = "Required documents are missing or failed quality checks"
        out.append({"action": key, "label": spec["label"], "enabled": reason is None, "reason": reason})
    return out


def run_json(run):
    if not run:
        return None
    return {
        "engine": run.engine,
        "mode": run.mode,
        "created_at": iso(run.created_at),
        "summary": run.summary,
        "findings": [{
            "id": f.id, "code": f.code, "severity": f.severity, "title": f.title, "detail": f.detail,
            "document_id": f.document_id, "field": f.field, "expected": f.expected, "observed": f.observed, "evidence": f.evidence,
        } for f in run.findings],
    }


def case_detail(app, role):
    runs = latest_runs(app)
    data = application_summary(app)
    data.update({
        "institution_profile": institution_json(app.institution),
        "form_data": (app.form.data if app.form else {}) or {},
        "handbook_version": app.handbook_version,
        "checklist": checklist(app),
        "documents": [document_json(d) for d in active_documents(app)],
        "document_history": [document_json(d) for d in app.documents if d.status == "superseded"],
        "verification": {k: run_json(runs.get(k)) for k in ("glimpse", "tracex", "rules")},
        "evidence_graph": evidence_graph(app, runs),
        "review_actions": [{
            "id": r.id, "action": r.action, "label": catalog.ACTIONS[r.action]["label"], "user": r.user.display_name,
            "role": catalog.ROLE_LABELS[r.role], "comment": r.comment, "deadline": iso(r.deadline),
            "from_status": r.from_status, "to_status": r.to_status, "created_at": iso(r.created_at),
        } for r in reversed(app.review_actions)],
        "events": [event_json(e, include_internal=True) for e in reversed(app.events)],
        "stages": timeline_stages(app),
        "clarification": open_clarification(app),
        "allowed_actions": allowed_actions(app, role),
        "simulated": app.is_synthetic,
    })
    return data


@bp.get("/api/official/applications/<int:app_id>")
@require("official", ANY_OFFICIAL)
def get_case(app_id):
    return ok(case_detail(_case(app_id), g.user.role))


@bp.post("/api/official/applications/<int:app_id>/open")
@require("official", ANY_OFFICIAL)
def open_case(app_id):
    """Idempotent: the first scrutiny member or reviewer to open a submitted case starts scrutiny."""
    app = _case(app_id, lock=True)
    if app.status == "submitted" and g.user.role in ("scrutiny_member", "reviewer"):
        now = utcnow()
        set_status(app, "under_scrutiny", now)
        event(app, "scrutiny_started", "Your application is under scrutiny by an official.", g.user, "submitted", "under_scrutiny", created_at=now)
        audit("case_review_started", "Case opened for scrutiny", g.user, app)
        db.session.commit()
    return ok(case_detail(app, g.user.role))


@bp.post("/api/official/applications/<int:app_id>/actions")
@require("official", ANY_OFFICIAL)
def take_action(app_id):
    body = request.get_json(silent=True) or {}
    action = body.get("action")
    spec = catalog.ACTIONS.get(action)
    if not spec:
        raise ApiError(422, "validation_failed", "Unknown action.")
    if g.user.role not in spec["roles"]:
        raise ApiError(403, "forbidden_role", f"{catalog.ROLE_LABELS[g.user.role]} cannot perform '{spec['label']}'.")
    app = _case(app_id, lock=True)
    if app.status not in spec["from"]:
        raise ApiError(409, "invalid_transition", f"'{spec['label']}' is not allowed while the case is {catalog.STATUS_LABELS[app.status]}.")
    comment = (body.get("comment") or "").strip()
    if spec["comment_required"] and len(comment) < 10:
        raise ApiError(422, "validation_failed", "Add a comment of at least 10 characters.", {"fields": {"comment": "Required"}})
    if len(comment) > 500:
        raise ApiError(422, "validation_failed", "Comment must be 500 characters or fewer.", {"fields": {"comment": "Too long"}})
    deadline = None
    if action == "request_clarification" and body.get("deadline"):
        try:
            deadline = date.fromisoformat(body["deadline"])
        except ValueError:
            raise ApiError(422, "validation_failed", "Invalid deadline.", {"fields": {"deadline": "Invalid date"}})
        if deadline <= date.today() or deadline > date.today() + timedelta(days=90):
            raise ApiError(422, "validation_failed", "Deadline must be within the next 90 days.", {"fields": {"deadline": "Out of range"}})
    if action == "record_approval":
        if not checklist(app)["ready"]:
            raise ApiError(409, "checklist_incomplete", "Cannot record approval: required documents are missing or failed quality checks.")
        if body.get("confirm") is not True:
            raise ApiError(422, "confirmation_required", "Confirm that this is a demonstration decision based on your review of the evidence.")

    now = utcnow()
    prev = app.status
    set_status(app, spec["to"], now)
    db.session.add(ReviewAction(application=app, user_id=g.user.id, role=g.user.role, action=action, comment=comment,
                                deadline=deadline, from_status=prev, to_status=spec["to"], created_at=now))
    if action == "request_clarification":
        app.clarification_deadline = deadline
        event(app, "clarification_requested", comment, g.user, prev, spec["to"],
              data={"deadline": deadline.isoformat() if deadline else None}, created_at=now)
    elif action == "record_approval":
        app.decision_outcome = "approved"
        event(app, "decision_recorded", f"Demonstration approval decision recorded. Reviewer remarks: {comment}", g.user, prev, spec["to"],
              data={"outcome": "approved"}, created_at=now)
    else:
        if action == "record_escalation":
            app.decision_outcome = "escalated"
        event(app, EVENT_TYPES[action], INSTITUTION_MESSAGES[action], g.user, prev, spec["to"], data={"internal_comment": comment}, created_at=now)
    audit(action, f"{spec['label']}: {comment}" + (f" (deadline {deadline.isoformat()})" if deadline else ""), g.user, app,
          {"from": prev, "to": spec["to"]})
    db.session.commit()
    return ok({"case": case_detail(app, g.user.role), "message": f"{spec['label']} recorded. Case status: {catalog.STATUS_LABELS[app.status]}."})


def _audit_query():
    q = AuditLog.query
    search = (request.args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        q = q.filter(or_(AuditLog.actor_label.ilike(like), AuditLog.application_number.ilike(like),
                         AuditLog.institution_name.ilike(like), AuditLog.details.ilike(like)))
    if request.args.get("action"):
        q = q.filter(AuditLog.action == request.args["action"])
    if request.args.get("role"):
        q = q.filter(AuditLog.role == request.args["role"])
    if request.args.get("application"):
        q = q.filter(AuditLog.application_number == request.args["application"])
    for name, op in (("from", "ge"), ("to", "lt")):
        raw = request.args.get(name)
        if raw:
            try:
                d = date.fromisoformat(raw)
            except ValueError:
                raise ApiError(422, "validation_failed", f"Invalid {name} date.")
            bound = datetime.combine(d if op == "ge" else d + timedelta(days=1), datetime.min.time())
            q = q.filter(AuditLog.created_at >= bound if op == "ge" else AuditLog.created_at < bound)
    return q.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())


def audit_json(a):
    return {
        "id": a.id, "created_at": iso(a.created_at), "user": a.actor_label, "role": a.role,
        "role_label": catalog.ROLE_LABELS.get(a.role, a.role), "action": a.action,
        "application_id": a.application_id, "application_number": a.application_number,
        "institution": a.institution_name, "details": a.details, "data": a.data, "seeded": a.is_seeded,
    }


@bp.get("/api/official/audit")
@require("official", ANY_OFFICIAL)
def audit_list():
    q = _audit_query()
    total = q.count()
    page_size = min(max(request.args.get("page_size", 15, type=int), 1), 100)
    pages = max(1, -(-total // page_size))
    page = min(max(request.args.get("page", 1, type=int), 1), pages)
    rows = q.offset((page - 1) * page_size).limit(page_size).all()
    actions = [r[0] for r in db.session.query(AuditLog.action).distinct().order_by(AuditLog.action).all()]
    return ok({
        "entries": [audit_json(a) for a in rows],
        "pagination": {"page": page, "page_size": page_size, "total": total, "pages": pages},
        "actions": actions,
        "roles": [{"value": r, "label": catalog.ROLE_LABELS[r]} for r in ("system", "institution_admin", *catalog.OFFICIAL_ROLES)],
        "can_export": g.user.role in ("administrator", "reviewer"),
    })


@bp.get("/api/official/audit/export")
@require("official", ("administrator", "reviewer"))
def audit_export():
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["timestamp_utc", "user", "role", "action", "application_id", "institution", "details", "seeded_demo_record"])
    for a in _audit_query().limit(10000):
        writer.writerow([iso(a.created_at), a.actor_label, catalog.ROLE_LABELS.get(a.role, a.role), a.action,
                         a.application_number or "", a.institution_name or "", a.details or "", "yes" if a.is_seeded else "no"])
    audit("audit_exported", "Audit log exported to CSV", g.user)
    db.session.commit()
    return Response(buf.getvalue(), mimetype="text/csv", headers={
        "Content-Disposition": f'attachment; filename="neyamnetra-audit-{date.today().isoformat()}.csv"',
    })
