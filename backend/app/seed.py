"""Deterministic demo data.

* MAIT is the demo login institution. Its profile and the published EoA 2026-27
  reference come from details supplied by the team (source URL recorded); verify
  them before any external use. The reference sits in institution_approvals and is
  never modelled as a NeyamNetra application.
* Every application, document and review action created here is synthetic and is
  flagged is_synthetic / is_seeded. All other institutions are fictional.
* Seeded timestamps are anchored on 28 Oct 2026 and never later than "now".
"""

from datetime import date, datetime, timedelta

from flask import current_app

from . import catalog
from .analysis import run_analysis
from .models import (
    Application,
    ApplicationFormData,
    AuditLog,
    Document,
    DocumentBlob,
    DocumentRequirement,
    Institution,
    InstitutionApproval,
    ReviewAction,
    User,
    db,
    utcnow,
)
from .quality import document_status_for, run_quality_check, sha256
from .samples import sample_pdf
from .services import application_number, audit, event, set_status

ANCHOR = datetime(2026, 10, 28, 3, 30)  # 09:00 IST
MAIT_SOURCE = "https://mait.ac.in/index.php/component/content/article/aicte-feedback-approvals.html?Itemid=384&catid=9"

MAIT = {
    "permanent_id": "1-4261798",
    "name": "Maharaja Agrasen Institute of Technology",
    "short_name": "MAIT",
    "address": "Sector 22, Rohini, Delhi",
    "city": "Rohini, Delhi",
    "state": "Delhi",
    "affiliating_university": "Guru Gobind Singh Indraprastha University, Delhi",
    "institution_type": "Private Self-Financing",
    "is_reference_profile": True,
    "source_note": "Profile supplied by Team Neural Nexus; published EoA reference per institution website. Verify before external use.",
}

FICTIONAL = [
    ("1-DEMO-0101", "Godavari Delta Institute of Technology", "Rajahmundry", "Andhra Pradesh", "Private Self-Financing"),
    ("1-DEMO-0102", "Aravali Crest Institute of Engineering", "Alwar", "Rajasthan", "Private Self-Financing"),
    ("1-DEMO-0103", "Neelgiri Vista Institute of Technology", "Coimbatore", "Tamil Nadu", "Private Self-Financing"),
    ("1-DEMO-0104", "Triveni Lakeside College of Engineering", "Prayagraj", "Uttar Pradesh", "Private Aided"),
    ("1-DEMO-0105", "Kanchenjunga Valley College of Engineering", "Siliguri", "West Bengal", "Private Self-Financing"),
    ("1-DEMO-0106", "Coromandel Coast College of Technology", "Nellore", "Andhra Pradesh", "Private Self-Financing"),
    ("1-DEMO-0107", "Narmada Ridge Institute of Technology", "Jabalpur", "Madhya Pradesh", "Private Self-Financing"),
]

OFFICIALS = [
    ("scrutiny_member", "Dr. Meera Iyer"),
    ("reviewer", "Prof. Arvind Rao"),
    ("administrator", "Kavya Nair"),
]


def anchor():
    now = utcnow()
    return ANCHOR if now >= ANCHOR else now - timedelta(hours=1)


def seed_reference_data():
    mait = Institution.query.filter_by(permanent_id=MAIT["permanent_id"]).first()
    if not mait:
        mait = Institution(**MAIT)
        db.session.add(mait)
        db.session.flush()
        db.session.add(InstitutionApproval(
            institution_id=mait.id, academic_year="2026-27", approval_date=date(2026, 4, 30),
            letter_reference=None, source_url=MAIT_SOURCE, record_kind="published_reference",
            note="Published EoA for AY 2026-27 dated 30 April 2026 (reference record; not created in NeyamNetra).",
        ))
    if not User.query.filter_by(portal="institution", is_demo=True).first():
        db.session.add(User(display_name="MAIT Institution Admin", portal="institution", role="institution_admin", institution_id=mait.id, is_demo=True))
    for role, name in OFFICIALS:
        if not User.query.filter_by(portal="official", role=role, is_demo=True).first():
            db.session.add(User(display_name=name, portal="official", role=role, is_demo=True))
    for pid, name, city, state, kind in FICTIONAL:
        if Institution.query.filter_by(permanent_id=pid).first():
            continue
        inst = Institution(permanent_id=pid, name=name, short_name=None, address=f"{city}, {state}", city=city, state=state,
                           affiliating_university="(fictional affiliating university)", institution_type=kind, is_synthetic=True,
                           source_note="Fictional institution for demonstration.")
        db.session.add(inst)
        db.session.flush()
        db.session.add(InstitutionApproval(institution_id=inst.id, academic_year="2026-27", approval_date=date(2026, 5, 6),
                                           letter_reference=None, record_kind="synthetic_reference",
                                           note="Synthetic reference for a fictional institution."))
        # Seed-only actor so applications have an owner; not a login account.
        db.session.add(User(display_name=f"{name} (applicant)", portal="institution", role="institution_admin", institution_id=inst.id, is_demo=False))
    for (app_type, category), items in catalog.REQUIREMENTS.items():
        for i, item in enumerate(items):
            exists = DocumentRequirement.query.filter_by(app_type=app_type, category=category, code=item["code"],
                                                         handbook_version=catalog.HANDBOOK_VERSION).first()
            if not exists:
                db.session.add(DocumentRequirement(app_type=app_type, category=category, code=item["code"], title=item["title"],
                                                   description=item["description"], required=item["required"], sort_order=i + 1,
                                                   handbook_version=catalog.HANDBOOK_VERSION))
    db.session.flush()


def _doc_lines(inst, code, title, app, overrides):
    lines = [
        f"## {title}",
        f"Name of the Institution: {inst.name}",
        f"Permanent ID: {inst.permanent_id}",
        f"Address: {inst.address}",
        f"Academic Year: {overrides.get('ay', app.academic_year)}",
    ]
    if code == "prev_eoa_letter":
        ref = inst.approvals[0]
        lines += [
            "",
            "Document summary: reference to the previous Extension of Approval.",
            f"Previous approval academic year: {ref.academic_year}",
            f"Date of letter referenced: {ref.approval_date.strftime('%d/%m/%Y')}",
        ]
        if "approved_intake" in overrides:
            lines.append(f"Approved Intake (Previous): {overrides['approved_intake']}")
    else:
        lines += ["", f"Supporting details for: {title}.", "Figures in this sample are synthetic placeholders."]
    lines += ["", "This file exists only to exercise the NeyamNetra demonstration workflow."]
    return lines


def _add_documents(app, user, at, overrides=None):
    overrides = overrides or {}
    cfg = current_app.config
    category = (app.form.data or {}).get("request_category")
    for i, req in enumerate(catalog.requirements_for(app.app_type, category)):
        if not req["required"] and i % 2:
            continue
        lines = _doc_lines(app.institution, req["code"], req["title"], app, overrides.get(req["code"], {}))
        pdf = sample_pdf(f"{req['title']} (Synthetic Sample)", lines)
        result = run_quality_check("pdf", pdf, cfg)
        doc = Document(
            application=app, requirement_code=req["code"],
            original_filename=f"{req['code']}_{(app.institution.short_name or app.institution.name.split()[0]).lower()}_sample.pdf",
            safe_filename=f"{req['code']}_sample.pdf", content_type="application/pdf", size_bytes=len(pdf), sha256=sha256(pdf),
            page_count=result["page_count"], status=document_status_for(result["verdict"]), quality=result, phase="initial",
            is_synthetic_sample=True, uploaded_by_id=user.id, uploaded_at=at - timedelta(minutes=40 - i),
        )
        doc.blob = DocumentBlob(data=pdf)
        db.session.add(doc)
    db.session.flush()


def _case(inst, ay, app_type, submitted, form=None, overrides=None, steps=()):
    owner = User.query.filter_by(portal="institution", institution_id=inst.id).order_by(User.is_demo.desc()).first()
    app = Application(institution_id=inst.id, app_type=app_type, academic_year=ay, status="draft",
                      handbook_version=catalog.HANDBOOK_VERSION, is_synthetic=True, is_seeded=True, created_by_id=owner.id,
                      created_at=submitted - timedelta(days=2), updated_at=submitted, status_changed_at=submitted)
    app.form = ApplicationFormData(data=form or {})
    db.session.add(app)
    db.session.flush()
    app.institution = inst
    event(app, "application_created", f"Draft created: {catalog.APP_TYPE_SHORT[app_type]} for {ay}", owner, to_status="draft", created_at=submitted - timedelta(days=2))
    audit("application_created", f"Draft {catalog.APP_TYPE_SHORT[app_type]} application created for {ay}", owner, app, created_at=submitted - timedelta(days=2), seeded=True)
    _add_documents(app, owner, submitted, overrides)
    app.application_number = application_number(app)
    app.submitted_at = submitted
    set_status(app, "submitted", submitted)
    event(app, "submitted", "Application submitted by the institution", owner, "draft", "submitted", created_at=submitted)
    n = len(app.documents)
    event(app, "quality_checks_completed", f"{n} documents checked: {n} accepted", None, created_at=submitted + timedelta(seconds=5))
    audit("application_submitted", f"{catalog.APP_TYPE_SHORT[app_type]} {ay} submitted with {n} documents", owner, app, created_at=submitted, seeded=True)
    audit("quality_summary", f"{n} documents checked: {n} accepted", None, app, created_at=submitted + timedelta(seconds=5), seeded=True)
    run_analysis(app, at=submitted + timedelta(seconds=6))

    officials = {u.role: u for u in User.query.filter_by(portal="official", is_demo=True)}
    for step in steps:
        kind, at = step[0], step[1]
        if kind == "open":
            user = officials["scrutiny_member"]
            set_status(app, "under_scrutiny", at)
            event(app, "scrutiny_started", "Your application is under scrutiny by an official.", user, "submitted", "under_scrutiny", created_at=at)
            audit("case_review_started", "Case opened for scrutiny", user, app, created_at=at, seeded=True)
            continue
        if kind == "respond":
            prev = app.status
            set_status(app, "response_received", at)
            app.clarification_deadline = None
            event(app, "clarification_responded", step[2], owner, prev, "response_received", data={"documents": [], "late": False}, created_at=at)
            audit("clarification_response", "Response submitted with 0 new document(s)", owner, app, created_at=at, seeded=True)
            continue
        role, comment = step[2], step[3]
        deadline = step[4] if len(step) > 4 else None
        user = officials[role]
        spec = catalog.ACTIONS[kind]
        prev = app.status
        set_status(app, spec["to"], at)
        db.session.add(ReviewAction(application=app, user_id=user.id, role=role, action=kind, comment=comment, deadline=deadline,
                                    from_status=prev, to_status=spec["to"], created_at=at))
        if kind == "request_clarification":
            app.clarification_deadline = deadline
            event(app, "clarification_requested", comment, user, prev, spec["to"], data={"deadline": deadline.isoformat() if deadline else None}, created_at=at)
        elif kind == "record_approval":
            app.decision_outcome = "approved"
            event(app, "decision_recorded", f"Demonstration approval decision recorded. Reviewer remarks: {comment}", user, prev, spec["to"], data={"outcome": "approved"}, created_at=at)
        else:
            from .routes.official import EVENT_TYPES, INSTITUTION_MESSAGES

            event(app, EVENT_TYPES[kind], INSTITUTION_MESSAGES[kind], user, prev, spec["to"], data={"internal_comment": comment}, created_at=at)
        audit(kind, f"{spec['label']}: {comment}" + (f" (deadline {deadline.isoformat()})" if deadline else ""), user, app,
              {"from": prev, "to": spec["to"]}, created_at=at, seeded=True)
    app.updated_at = app.status_changed_at
    db.session.flush()
    return app


def seed_cases():
    t0 = anchor()

    def days_ago(d, hours=0):
        return t0 - timedelta(days=d, hours=hours)

    insts = {i.permanent_id: i for i in Institution.query.all()}
    mait = insts[MAIT["permanent_id"]]
    deadline = (t0 + timedelta(days=13)).date()

    _case(mait, "2027-28", "intake", days_ago(22, 3), form={
        "programme_name": "B.Tech Computer Science and Engineering", "department": "Computer Science and Engineering",
        "programme_level": "UG", "current_intake": 120, "proposed_intake": 180, "additional_seats": 60,
        "classroom_capacity": 240, "lab_availability": "partially_available", "faculty_strength": 42,
        "justification": "Synthetic demo figures: sustained demand and placement outcomes justify one additional section.",
        "remarks": "Synthetic demonstration record — figures are placeholders, not MAIT data.",
    }, steps=[
        ("open", days_ago(20, 1)),
        ("request_clarification", days_ago(8, 2), "scrutiny_member",
         "Please upload faculty appointment letters for the additional 60 seats and an updated laboratory capacity statement.", deadline),
    ])
    _case(mait, "2026-27", "other", days_ago(44, 5), form={
        "request_category": "institution_details", "detail_field": "Official correspondence e-mail",
        "current_value": "old-contact@example.org", "proposed_value": "approvals@example.org",
        "description": "Synthetic demo record: update of the official correspondence e-mail on the institution profile.",
        "reference_identifiers": "", "justification": "Synthetic demo record: the earlier mailbox is being retired by the institution.",
    }, steps=[
        ("open", days_ago(42)),
        ("forward_review", days_ago(33), "scrutiny_member", "Supporting resolution and covering letter are in order."),
        ("record_approval", days_ago(19), "reviewer", "Change of contact details recorded for the demonstration."),
    ])

    f = {pid: insts[pid] for pid, *_ in FICTIONAL}
    _case(f["1-DEMO-0101"], "2027-28", "eoa", days_ago(7, 4), steps=[("open", days_ago(5, 2))])
    _case(f["1-DEMO-0102"], "2027-28", "eoa", days_ago(2, 6))
    _case(f["1-DEMO-0103"], "2027-28", "intake", days_ago(10, 1), form={
        "programme_name": "B.E. Mechanical Engineering", "department": "Mechanical Engineering", "programme_level": "UG",
        "current_intake": 240, "proposed_intake": 300, "additional_seats": 60, "classroom_capacity": 320,
        "lab_availability": "available", "faculty_strength": 58,
        "justification": "Fictional case study used to demonstrate an intake discrepancy between the form and evidence.",
        "remarks": "",
    }, overrides={"prev_eoa_letter": {"approved_intake": 120}}, steps=[("open", days_ago(9, 2))])
    _case(f["1-DEMO-0104"], "2027-28", "new_course", days_ago(16, 2), form={
        "programme_name": "B.Tech Robotics and Automation", "specialization": "Industrial Robotics", "programme_level": "UG",
        "department": "Mechatronics", "proposed_intake": 60, "affiliation_details": "Fictional university consent letter dated 02/09/2026",
        "faculty_strength": 9, "lab_infrastructure": "Robotics lab with six industrial arms, PLC lab and simulation centre (fictional).",
        "justification": "Fictional case: regional manufacturing growth creates demand for robotics graduates.",
        "objectives": "Fictional case: produce graduates skilled in automation design, control and maintenance.",
    }, steps=[
        ("open", days_ago(15)),
        ("forward_review", days_ago(6, 3), "scrutiny_member", "Curriculum and laboratory plan reviewed; forwarding for final review."),
    ])
    _case(f["1-DEMO-0105"], "2027-28", "eoa", days_ago(29, 2), steps=[
        ("open", days_ago(27)),
        ("forward_review", days_ago(20), "scrutiny_member", "All documents legible and consistent with profile."),
        ("record_approval", days_ago(13), "reviewer", "Demonstration approval recorded after review of the evidence."),
    ])
    _case(f["1-DEMO-0106"], "2026-27", "other", days_ago(13, 5), form={
        "request_category": "change_location", "current_address": "Plot 4, Coastal Road, Nellore, Andhra Pradesh",
        "proposed_address": "Survey No. 118, NH-16 Bypass, Nellore, Andhra Pradesh", "land_area_sqm": 52000,
        "description": "Fictional case: relocation of the campus to a larger permanent site within the same district.",
        "reference_identifiers": "", "effective_date": None,
        "justification": "Fictional case: the current leased premises cannot accommodate approved laboratories.",
    }, steps=[
        ("open", days_ago(12)),
        ("mark_field_verification", days_ago(4, 1), "scrutiny_member", "Site inspection needed to confirm the land area at the proposed location."),
    ])
    _case(f["1-DEMO-0107"], "2027-28", "eoa", days_ago(18, 3), steps=[
        ("open", days_ago(17)),
        ("request_clarification", days_ago(14), "scrutiny_member", "The building plan approval page is unsigned. Upload the signed copy.", (t0 - timedelta(days=2)).date()),
        ("respond", days_ago(6, 4), "Signed building plan approval has been sent; please refer to the attached covering note."),
    ])


def ensure_seeded():
    if Institution.query.first() is None:
        seed_reference_data()
        seed_cases()
        db.session.commit()


def reset_demo(user=None):
    """Remove all applications and audit rows, then restore the seeded scenario."""
    for app in Application.query.all():
        db.session.delete(app)
    AuditLog.query.delete()
    db.session.flush()
    seed_reference_data()
    seed_cases()
    audit("demo_reset", "Demo scenario reset to seeded state", user)
    db.session.commit()
