from datetime import date, datetime

from . import catalog
from .analysis import active_documents
from .models import AuditLog, WorkflowEvent, db, utcnow


def iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds") + "Z"
    if isinstance(value, date):
        return value.isoformat()
    return value


def actor_of(user):
    if user is None:
        return "System", "system"
    return user.display_name, user.role


def audit(action, details, user=None, application=None, data=None, created_at=None, seeded=False):
    label, role = actor_of(user)
    entry = AuditLog(
        user_id=user.id if user else None,
        actor_label=label,
        role=role,
        action=action,
        application_id=application.id if application else None,
        application_number=application.application_number if application else None,
        institution_name=application.institution.name if application else None,
        details=details[:1000] if details else None,
        data=data or {},
        is_seeded=seeded,
    )
    if created_at:
        entry.created_at = created_at
    db.session.add(entry)
    return entry


def event(application, event_type, message, user=None, from_status=None, to_status=None, visible=True, data=None, created_at=None):
    label, role = actor_of(user)
    ev = WorkflowEvent(
        application=application,
        event_type=event_type,
        from_status=from_status,
        to_status=to_status,
        actor_user_id=user.id if user else None,
        actor_label=label,
        actor_role=role,
        message=message,
        visible_to_institution=visible,
        data=data or {},
    )
    if created_at:
        ev.created_at = created_at
    db.session.add(ev)
    return ev


def set_status(application, new_status, at=None):
    application.status = new_status
    application.status_changed_at = at or utcnow()


def application_number(application):
    start, end = application.academic_year.split("-")
    return f"NN-{start[-2:]}{end[-2:]}-{catalog.APP_TYPE_AY_CODE[application.app_type]}-{application.id:05d}"


# ---- Serialisers ------------------------------------------------------------

def institution_json(inst):
    reference = inst.approvals[0] if inst.approvals else None
    return {
        "id": inst.id,
        "permanent_id": inst.permanent_id,
        "name": inst.name,
        "short_name": inst.short_name,
        "address": inst.address,
        "city": inst.city,
        "state": inst.state,
        "affiliating_university": inst.affiliating_university,
        "institution_type": inst.institution_type,
        "is_reference_profile": inst.is_reference_profile,
        "is_synthetic": inst.is_synthetic,
        "source_note": inst.source_note,
        "reference_approval": approval_json(reference) if reference else None,
    }


def approval_json(a):
    return {
        "academic_year": a.academic_year,
        "approval_date": iso(a.approval_date),
        "letter_reference": a.letter_reference,
        "source_url": a.source_url,
        "record_kind": a.record_kind,
        "note": a.note,
    }


def document_json(doc):
    q = doc.quality or {}
    return {
        "id": doc.id,
        "requirement_code": doc.requirement_code,
        "original_filename": doc.original_filename,
        "content_type": doc.content_type,
        "size_bytes": doc.size_bytes,
        "sha256": doc.sha256,
        "page_count": doc.page_count,
        "status": doc.status,
        "phase": doc.phase,
        "is_synthetic_sample": doc.is_synthetic_sample,
        "replaces_id": doc.replaces_id,
        "uploaded_at": iso(doc.uploaded_at),
        "quality": {
            "verdict": q.get("verdict"),
            "message": q.get("message"),
            "reasons": q.get("reasons", []),
            "metrics": q.get("metrics"),
            "kind": q.get("kind"),
            "text_layer_pages": q.get("text_layer_pages"),
            "sampled_pages": q.get("sampled_pages"),
            "method": q.get("method"),
        },
        "file_url": f"/api/documents/{doc.id}/file",
    }


def requirement_list(application):
    form = (application.form.data if application.form else {}) or {}
    reqs = catalog.requirements_for(application.app_type, form.get("request_category"))
    if application.status != "draft" or any(d.requirement_code == "additional_evidence" for d in application.documents):
        reqs = reqs + [dict(catalog.ADDITIONAL_EVIDENCE, sort_order=len(reqs) + 1)]
    return reqs


def checklist(application):
    reqs = requirement_list(application)
    docs = active_documents(application)
    items = []
    for req in reqs:
        matched = [d for d in docs if d.requirement_code == req["code"]]
        latest = matched[-1] if matched else None
        state = "pending"
        if latest:
            state = {"accepted": "uploaded", "needs_review": "quality_review", "quality_failed": "rejected"}[latest.status]
        items.append({**req, "state": state, "document": document_json(latest) if latest else None, "count": len(matched)})
    core = [i for i in items if i["code"] != "additional_evidence"]
    done = [i for i in core if i["state"] in ("uploaded", "quality_review")]
    required = [i for i in core if i["required"]]
    required_done = [i for i in required if i["state"] in ("uploaded", "quality_review")]
    blocking = [i for i in core if i["state"] == "rejected"]
    return {
        "items": items,
        "total": len(core),
        "completed": len(done),
        "percent": round(100 * len(done) / len(core)) if core else 0,
        "required_total": len(required),
        "required_completed": len(required_done),
        "has_blocking": bool(blocking),
        "ready": len(required_done) == len(required) and not blocking,
        "handbook_version": application.handbook_version,
        "handbook_note": catalog.HANDBOOK_NOTE,
    }


def application_summary(app):
    return {
        "id": app.id,
        "application_number": app.application_number,
        "app_type": app.app_type,
        "app_type_label": catalog.APP_TYPE_SHORT[app.app_type],
        "academic_year": app.academic_year,
        "status": app.status,
        "status_label": catalog.STATUS_LABELS[app.status],
        "status_bucket": catalog.STATUS_BUCKETS.get(app.status),
        "submitted_at": iso(app.submitted_at),
        "created_at": iso(app.created_at),
        "updated_at": iso(app.updated_at),
        "status_changed_at": iso(app.status_changed_at),
        "clarification_deadline": iso(app.clarification_deadline),
        "is_synthetic": app.is_synthetic,
        "institution": {"id": app.institution.id, "name": app.institution.name, "permanent_id": app.institution.permanent_id,
                        "state": app.institution.state, "city": app.institution.city},
        "document_count": len(active_documents(app)),
    }


def event_json(ev, include_internal=False):
    return {
        "id": ev.id,
        "type": ev.event_type,
        "from_status": ev.from_status,
        "to_status": ev.to_status,
        "actor": ev.actor_label,
        "actor_role": catalog.ROLE_LABELS.get(ev.actor_role, ev.actor_role),
        "message": ev.message,
        "data": ev.data if include_internal else {k: v for k, v in (ev.data or {}).items() if k in ("deadline", "documents", "late")},
        "created_at": iso(ev.created_at),
        "visible_to_institution": ev.visible_to_institution,
    }


def open_clarification(app):
    """Latest clarification request and its response, if any."""
    request_ev, response_ev = None, None
    for ev in app.events:
        if ev.event_type == "clarification_requested":
            request_ev, response_ev = ev, None
        elif ev.event_type == "clarification_responded" and request_ev:
            response_ev = ev
    if not request_ev:
        return None
    return {
        "request": event_json(request_ev),
        "response": event_json(response_ev) if response_ev else None,
        "deadline": request_ev.data.get("deadline"),
        "open": app.status == "clarification_requested",
    }


STAGE_TITLES = [
    ("submitted", "Submitted"),
    ("quality", "Document Quality Checks"),
    ("scrutiny", "Under Scrutiny"),
    ("field", "Field Verification"),
    ("clarification", "Clarification Required"),
    ("final", "Final Review"),
    ("decision", "Decision Recorded"),
]


def timeline_stages(app):
    """Stages derived only from stored events; optional branches appear only if they happened."""
    first = {}
    last = {}
    for ev in app.events:
        first.setdefault(ev.event_type, ev)
        last[ev.event_type] = ev
    status = app.status
    stages = []

    def stage(key, title, state, ev=None, note=None):
        stages.append({"key": key, "title": title, "state": state, "at": iso(ev.created_at) if ev else None, "note": note})

    if status == "draft":
        stage("submitted", "Submitted", "current", None, "Draft — not yet submitted")
        stage("quality", "Document Quality Checks", "upcoming")
        stage("scrutiny", "Under Scrutiny", "upcoming")
        stage("final", "Final Review", "upcoming")
        stage("decision", "Decision Recorded", "upcoming")
        return stages

    stage("submitted", "Submitted", "completed", first.get("submitted"))
    q = first.get("quality_checks_completed")
    stage("quality", "Document Quality Checks", "completed" if q else "current", q, q.message if q else None)
    scr = first.get("scrutiny_started")
    if not scr:
        stage("scrutiny", "Under Scrutiny", "current" if q else "upcoming", None, "Awaiting assignment to a scrutiny member")
    else:
        later = status not in ("under_scrutiny",)
        stage("scrutiny", "Under Scrutiny", "completed" if later else "current", scr)
    if "field_verification_marked" in first:
        ev = last["field_verification_marked"]
        stage("field", "Field Verification", "current" if status == "field_verification" else "completed", ev)
    if "clarification_requested" in first:
        req = last["clarification_requested"]
        resp = last.get("clarification_responded")
        responded = resp is not None and resp.id > req.id
        if status == "clarification_requested":
            stage("clarification", "Clarification Required", "attention", req, f"Respond by {req.data.get('deadline')}" if req.data.get("deadline") else "Response required")
        else:
            stage("clarification", "Clarification Required", "completed", resp if responded else req, "Response submitted" if responded else None)
    fin = last.get("forwarded_final_review")
    if status == "final_review":
        stage("final", "Final Review", "current", fin)
    elif status in ("approved",) and fin:
        stage("final", "Final Review", "completed", fin)
    elif status == "escalated" and fin:
        stage("final", "Final Review", "completed", fin)
    else:
        stage("final", "Final Review", "upcoming")
    dec = last.get("decision_recorded")
    if dec:
        stage("decision", "Decision Recorded", "completed", dec, catalog.STATUS_LABELS[status])
    else:
        stage("decision", "Decision Recorded", "upcoming")
    return stages


def next_steps(app):
    if app.status == "draft":
        return "Complete the document checklist, then review and submit the application."
    if app.status == "clarification_requested":
        return "Respond to the clarification request: upload the requested evidence and submit your response before the deadline."
    if app.status in ("submitted", "response_received"):
        return "No action needed. Your application is queued for scrutiny."
    if app.status in ("under_scrutiny", "field_verification", "final_review"):
        return "No action needed. Officials are reviewing your application; you will be notified if clarification is required."
    if app.status == "approved":
        return "A demonstration approval decision has been recorded. Download the acknowledgement for your records."
    if app.status == "escalated":
        return "The case has been escalated for further review. No automatic suspension has been applied."
    return ""
