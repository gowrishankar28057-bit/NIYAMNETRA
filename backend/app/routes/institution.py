from datetime import date

from flask import Blueprint, Response, current_app, g, request
from sqlalchemy import select
from werkzeug.utils import secure_filename

from .. import catalog
from ..ack import acknowledgement_pdf
from ..analysis import active_documents, run_analysis
from ..auth import load_session, require
from ..errors import ApiError, ok
from ..models import Application, ApplicationFormData, Document, DocumentBlob, User, db, utcnow
from ..quality import FileRejected, document_status_for, run_quality_check, sha256, validate_upload
from ..services import (
    application_number,
    application_summary,
    audit,
    checklist,
    document_json,
    event,
    event_json,
    institution_json,
    iso,
    next_steps,
    open_clarification,
    requirement_list,
    set_status,
    timeline_stages,
)
from ..validators import known_fields, validate_form

bp = Blueprint("institution", __name__)
INST = ("institution_admin",)


def own_application(app_id, lock=False):
    stmt = select(Application).where(Application.id == app_id, Application.institution_id == g.user.institution_id)
    if lock:
        stmt = stmt.with_for_update()
    app = db.session.execute(stmt).scalar_one_or_none()
    if not app:
        raise ApiError(404, "not_found", "Application not found.")
    return app


def application_detail(app):
    data = application_summary(app)
    visible = [e for e in app.events if e.visible_to_institution]
    data.update({
        "form_data": (app.form.data if app.form else {}) or {},
        "handbook_version": app.handbook_version,
        "checklist": checklist(app),
        "documents": [document_json(d) for d in active_documents(app)],
        "document_history": [document_json(d) for d in app.documents if d.status in ("superseded",)],
        "events": [event_json(e) for e in reversed(visible)],
        "stages": timeline_stages(app),
        "clarification": open_clarification(app),
        "next_steps": next_steps(app),
        "last_updated": iso(max([app.updated_at] + [e.created_at for e in app.events])),
        "institution_profile": institution_json(app.institution),
    })
    return data


@bp.get("/api/institution/profile")
@require("institution", INST)
def profile():
    return ok(institution_json(g.user.institution))


@bp.get("/api/institution/dashboard")
@require("institution", INST)
def dashboard():
    inst = g.user.institution
    apps = (Application.query.filter_by(institution_id=inst.id)
            .order_by(Application.updated_at.desc()).all())
    return ok({
        "institution": institution_json(inst),
        "next_cycle": {
            "academic_year": catalog.DEMO_ACADEMIC_YEAR,
            "label": "Demonstration scenario",
            "schedule": "Application schedule to be announced",
        },
        "counts": {
            "total": len([a for a in apps if a.status != "draft"]),
            "drafts": len([a for a in apps if a.status == "draft"]),
            "action_required": len([a for a in apps if a.status == "clarification_requested"]),
        },
        "applications": [application_summary(a) for a in apps[:8]],
    })


@bp.post("/api/applications")
@require("institution", INST)
def create_application():
    body = request.get_json(silent=True) or {}
    app_type = body.get("app_type")
    academic_year = body.get("academic_year") or catalog.DEMO_ACADEMIC_YEAR
    if app_type not in catalog.APP_TYPE_CODES:
        raise ApiError(422, "validation_failed", "Select an application purpose.", {"fields": {"app_type": "Required"}})
    if academic_year not in catalog.ACADEMIC_YEARS:
        raise ApiError(422, "validation_failed", "Unsupported academic year.", {"fields": {"academic_year": "Invalid"}})
    inst_id = g.user.institution_id
    draft = Application.query.filter_by(institution_id=inst_id, app_type=app_type, academic_year=academic_year, status="draft").first()
    if draft:
        return ok({"application": application_detail(draft), "resumed": True})
    if app_type == "eoa":
        active = Application.query.filter(
            Application.institution_id == inst_id, Application.app_type == "eoa",
            Application.academic_year == academic_year, Application.status.notin_(["draft", "escalated"]),
        ).first()
        if active:
            raise ApiError(409, "duplicate_eoa", f"An EoA application for {academic_year} already exists ({active.application_number}). Track it instead of filing again.",
                           {"application_id": active.id})
    app = Application(
        institution_id=inst_id, app_type=app_type, academic_year=academic_year, status="draft",
        handbook_version=catalog.HANDBOOK_VERSION, created_by_id=g.user.id,
    )
    app.form = ApplicationFormData(data={})
    db.session.add(app)
    db.session.flush()
    event(app, "application_created", f"Draft created: {catalog.APP_TYPE_SHORT[app_type]} for {academic_year}", g.user, to_status="draft")
    audit("application_created", f"Draft {catalog.APP_TYPE_SHORT[app_type]} application created for {academic_year}", g.user, app)
    db.session.commit()
    return ok({"application": application_detail(app), "resumed": False}, 201)


@bp.get("/api/applications")
@require("institution", INST)
def list_applications():
    apps = (Application.query.filter_by(institution_id=g.user.institution_id)
            .order_by(Application.updated_at.desc()).all())
    return ok({"applications": [application_summary(a) for a in apps]})


@bp.get("/api/applications/<int:app_id>")
@require("institution", INST)
def get_application(app_id):
    return ok(application_detail(own_application(app_id)))


@bp.patch("/api/applications/<int:app_id>")
@require("institution", INST)
def update_application(app_id):
    app = own_application(app_id, lock=True)
    if app.status != "draft":
        raise ApiError(409, "not_editable", "Only draft applications can be edited.")
    body = request.get_json(silent=True) or {}
    full = bool(body.get("validate"))
    if "academic_year" in body:
        if body["academic_year"] not in catalog.ACADEMIC_YEARS:
            raise ApiError(422, "validation_failed", "Unsupported academic year.", {"fields": {"academic_year": "Invalid"}})
        app.academic_year = body["academic_year"]
    if "form_data" in body:
        raw = body.get("form_data") or {}
        if not isinstance(raw, dict):
            raise ApiError(422, "validation_failed", "form_data must be an object.")
        cleaned, errors = validate_form(app.app_type, raw, partial=not full)
        if errors:
            # Persist exactly what was typed so a refresh never loses work, then report problems.
            app.form.data = {k: (v.strip() if isinstance(v, str) else v) for k, v in raw.items() if k in known_fields(app.app_type, raw)}
            app.updated_at = utcnow()
            db.session.commit()
            if full:
                raise ApiError(422, "validation_failed", "Please correct the highlighted fields.", {"fields": errors})
            return ok({**application_detail(app), "field_warnings": errors})
        app.form.data = cleaned
    app.updated_at = utcnow()
    if full:
        audit("draft_saved", "Application form completed and saved", g.user, app)
    db.session.commit()
    return ok(application_detail(app))


@bp.delete("/api/applications/<int:app_id>")
@require("institution", INST)
def discard_draft(app_id):
    app = own_application(app_id, lock=True)
    if app.status != "draft":
        raise ApiError(409, "not_editable", "Only drafts can be discarded.")
    audit("draft_discarded", f"Draft {catalog.APP_TYPE_SHORT[app.app_type]} discarded", g.user, None, {"draft_id": app.id})
    db.session.delete(app)
    db.session.commit()
    return ok({"deleted": True})


@bp.post("/api/applications/<int:app_id>/documents")
@require("institution", INST)
def upload_document(app_id):
    app = own_application(app_id, lock=True)
    if app.status not in ("draft", "clarification_requested"):
        raise ApiError(409, "uploads_closed", "Documents can only be added to drafts or in response to a clarification request.")
    code = request.form.get("requirement_code", "")
    valid_codes = {r["code"] for r in requirement_list(app)}
    if app.status == "clarification_requested":
        valid_codes.add("additional_evidence")
    if code not in valid_codes:
        raise ApiError(422, "validation_failed", "Unknown document category for this application.")
    upload = request.files.get("file")
    if not upload or not upload.filename:
        raise ApiError(422, "validation_failed", "Choose a file to upload.")
    original = upload.filename[-200:]
    max_bytes = current_app.config["MAX_UPLOAD_MB"] * 1024 * 1024
    data = upload.read(max_bytes + 1)
    try:
        kind, content_type = validate_upload(original, data, max_bytes)
        result = run_quality_check(kind, data, current_app.config)
    except FileRejected as exc:
        audit("upload_rejected", f"{original}: {exc.message}", g.user, app, {"code": exc.code, "requirement": code})
        db.session.commit()
        raise ApiError(422, exc.code, exc.message)

    phase = "initial" if app.status == "draft" else "clarification"
    replaced = None
    if code != "additional_evidence":
        for existing in active_documents(app):
            if existing.requirement_code == code:
                existing.status = "superseded"
                replaced = existing
    safe = secure_filename(original) or f"document.{kind}"
    doc = Document(
        application=app, requirement_code=code, original_filename=original, safe_filename=safe,
        content_type=content_type, size_bytes=len(data), sha256=sha256(data), page_count=result.get("page_count"),
        status=document_status_for(result["verdict"]), quality=result, phase=phase,
        replaces_id=replaced.id if replaced else None, uploaded_by_id=g.user.id,
    )
    doc.blob = DocumentBlob(data=data)
    db.session.add(doc)
    app.updated_at = utcnow()
    db.session.flush()
    action = "document_replaced" if replaced else "document_uploaded"
    audit(action, f"{original} ({len(data) // 1024} KB) for {code}" + (f", replacing {replaced.original_filename}" if replaced else ""), g.user, app,
          {"document_id": doc.id, "requirement": code, "phase": phase})
    verdict = result["verdict"]
    reasons = "; ".join(r["message"] for r in result["reasons"]) or "No readability issues detected"
    audit("quality_check", f"{original}: {verdict.upper()} — {reasons}", None, app, {"document_id": doc.id, "metrics": result.get("metrics")})
    db.session.commit()
    return ok({"document": document_json(doc), "checklist": checklist(app)}, 201)


@bp.delete("/api/documents/<int:doc_id>")
@require("institution", INST)
def delete_document(doc_id):
    doc = db.session.get(Document, doc_id)
    if not doc or doc.application.institution_id != g.user.institution_id or doc.status in ("removed", "superseded"):
        raise ApiError(404, "not_found", "Document not found.")
    app = doc.application
    removable = app.status == "draft" or (app.status == "clarification_requested" and doc.phase == "clarification")
    if not removable:
        raise ApiError(409, "not_removable", "Submitted documents cannot be removed.")
    # A clarification-phase replacement restores the file it replaced.
    if doc.replaces_id and doc.phase == "clarification":
        prior = db.session.get(Document, doc.replaces_id)
        if prior and prior.status == "superseded":
            prior.status = document_status_for(prior.quality.get("verdict", "accepted"))
    doc.status = "removed"
    doc.blob = None
    app.updated_at = utcnow()
    audit("document_removed", f"{doc.original_filename} removed from {doc.requirement_code}", g.user, app, {"document_id": doc.id})
    db.session.commit()
    return ok({"checklist": checklist(app)})


def _document_for_viewer(doc_id):
    doc = db.session.get(Document, doc_id)
    if not doc or doc.status == "removed" or doc.blob is None:
        raise ApiError(404, "not_found", "Document not found.")
    inst_sess = load_session("institution")
    if inst_sess:
        user = db.session.get(User, inst_sess.user_id)
        if user.institution_id == doc.application.institution_id:
            return doc
    if load_session("official") and doc.application.status != "draft":
        return doc
    raise ApiError(404, "not_found", "Document not found.")


@bp.get("/api/documents/<int:doc_id>/file")
def document_file(doc_id):
    doc = _document_for_viewer(doc_id)
    disposition = "attachment" if request.args.get("download") else "inline"
    return Response(doc.blob.data, mimetype=doc.content_type, headers={
        "Content-Disposition": f'{disposition}; filename="{doc.safe_filename}"',
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    })


@bp.get("/api/documents/<int:doc_id>/preview")
def document_preview(doc_id):
    """PNG render of one page; PDFs are rasterised server-side with PyMuPDF."""
    import pymupdf

    doc = _document_for_viewer(doc_id)
    if doc.content_type != "application/pdf":
        return Response(doc.blob.data, mimetype=doc.content_type, headers={"Cache-Control": "private, max-age=300"})
    page_no = max(1, request.args.get("page", 1, type=int))
    scale = min(max(request.args.get("scale", 1.5, type=float), 0.5), 3.0)
    with pymupdf.open(stream=doc.blob.data, filetype="pdf") as pdf:
        if page_no > pdf.page_count:
            raise ApiError(404, "not_found", "Page out of range.")
        pix = pdf[page_no - 1].get_pixmap(matrix=pymupdf.Matrix(scale, scale))
        png = pix.tobytes("png")
    return Response(png, mimetype="image/png", headers={"Cache-Control": "private, max-age=300"})


@bp.post("/api/applications/<int:app_id>/submit")
@require("institution", INST)
def submit_application(app_id):
    app = own_application(app_id, lock=True)
    if app.status != "draft":
        raise ApiError(409, "already_submitted", "This application has already been submitted.",
                       {"application_number": app.application_number, "application_id": app.id})
    body = request.get_json(silent=True) or {}
    if body.get("confirm") is not True:
        raise ApiError(422, "confirmation_required", "Confirm the declaration before submitting.")
    cleaned, errors = validate_form(app.app_type, (app.form.data if app.form else {}) or {}, partial=False)
    if errors:
        raise ApiError(422, "form_incomplete", "The application form is incomplete.", {"fields": errors})
    cl = checklist(app)
    if not cl["ready"]:
        raise ApiError(422, "checklist_incomplete", "Upload all required documents and replace any rejected files before submitting.")
    now = utcnow()
    app.application_number = application_number(app)
    app.submitted_at = now
    set_status(app, "submitted", now)
    event(app, "submitted", "Application submitted by the institution", g.user, "draft", "submitted", created_at=now)
    docs = active_documents(app)
    summary = {s: len([d for d in docs if d.status == s]) for s in ("accepted", "needs_review")}
    msg = f"{len(docs)} documents checked: {summary['accepted']} accepted" + (f", {summary['needs_review']} flagged for legibility review" if summary["needs_review"] else "")
    event(app, "quality_checks_completed", msg, None, data=summary, created_at=now)
    run_analysis(app)
    audit("application_submitted", f"{catalog.APP_TYPE_SHORT[app.app_type]} {app.academic_year} submitted with {len(docs)} documents", g.user, app)
    audit("quality_summary", msg, None, app)
    db.session.commit()
    return ok(application_detail(app))


@bp.get("/api/applications/<int:app_id>/timeline")
@require("institution", INST)
def timeline(app_id):
    app = own_application(app_id)
    visible = [e for e in app.events if e.visible_to_institution]
    return ok({"stages": timeline_stages(app), "events": [event_json(e) for e in reversed(visible)], "status": app.status})


@bp.post("/api/applications/<int:app_id>/clarifications")
@require("institution", INST)
def respond_clarification(app_id):
    app = own_application(app_id, lock=True)
    if app.status != "clarification_requested":
        raise ApiError(409, "no_open_clarification", "There is no open clarification request for this application.")
    body = request.get_json(silent=True) or {}
    message = (body.get("message") or "").strip()
    if len(message) < 10:
        raise ApiError(422, "validation_failed", "Describe your response (at least 10 characters).", {"fields": {"message": "Too short"}})
    if len(message) > 2000:
        raise ApiError(422, "validation_failed", "Response is too long.", {"fields": {"message": "Max 2000 characters"}})
    request_ev = [e for e in app.events if e.event_type == "clarification_requested"][-1]
    new_docs = [d for d in active_documents(app) if d.phase == "clarification" and d.uploaded_at >= request_ev.created_at]
    deadline = request_ev.data.get("deadline")
    late = bool(deadline and date.today().isoformat() > deadline)
    now = utcnow()
    prev = app.status
    set_status(app, "response_received", now)
    app.clarification_deadline = None
    event(app, "clarification_responded", message, g.user, prev, "response_received",
          data={"documents": [d.original_filename for d in new_docs], "late": late}, created_at=now)
    run_analysis(app)
    audit("clarification_response", f"Response submitted with {len(new_docs)} new document(s)" + (" (after deadline)" if late else ""), g.user, app,
          {"documents": [d.id for d in new_docs]})
    db.session.commit()
    return ok(application_detail(app))


@bp.get("/api/applications/<int:app_id>/acknowledgement.pdf")
@require("institution", INST)
def acknowledgement(app_id):
    app = own_application(app_id)
    if app.status == "draft":
        raise ApiError(409, "not_submitted", "Acknowledgements are available after submission.")
    pdf = acknowledgement_pdf(app)
    return Response(pdf, mimetype="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{app.application_number}-acknowledgement.pdf"',
    })
