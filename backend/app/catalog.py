"""Configurable templates: application types, document checklists and workflow statuses.

The checklists are illustrative demo templates. They are versioned so they can be
replaced when the AICTE Approval Process Handbook changes; they do not claim to be
the complete legal requirement for any application type.
"""

HANDBOOK_VERSION = "demo-template-2027-28-v1"
HANDBOOK_NOTE = (
    "Illustrative demo checklist (template v1). Verify against the current AICTE "
    "Approval Process Handbook before relying on it."
)

DEMO_ACADEMIC_YEAR = "2027-28"
ACADEMIC_YEARS = ["2026-27", "2027-28"]

APPLICATION_TYPES = [
    {
        "code": "eoa",
        "title": "Renewal / Extension of Approval (EoA)",
        "short": "Renewal (EoA)",
        "description": "Apply for extension of approval for existing programmes and intake.",
        "has_form": False,
    },
    {
        "code": "intake",
        "title": "Increase in Intake / Additional Seats",
        "short": "Increase in Intake",
        "description": "Apply for increase in intake for existing programmes.",
        "has_form": True,
    },
    {
        "code": "new_course",
        "title": "New Course / New Programme",
        "short": "New Course",
        "description": "Apply for approval of new course(s) or programme(s).",
        "has_form": True,
    },
    {
        "code": "other",
        "title": "Other Approval Request",
        "short": "Other Approval Request",
        "description": "Apply for changes in institution details, closure, or other requests.",
        "has_form": True,
    },
]
APP_TYPE_CODES = {t["code"] for t in APPLICATION_TYPES}
APP_TYPE_SHORT = {t["code"]: t["short"] for t in APPLICATION_TYPES}
APP_TYPE_AY_CODE = {"eoa": "EOA", "intake": "INT", "new_course": "NCP", "other": "OAR"}

OTHER_CATEGORIES = [
    {"code": "institution_details", "title": "Institution detail changes"},
    {"code": "change_location", "title": "Change of location"},
    {"code": "change_name", "title": "Change of institution name"},
    {"code": "course_closure", "title": "Course closure or modification"},
    {"code": "other_request", "title": "Other request"},
]
OTHER_CATEGORY_CODES = {c["code"] for c in OTHER_CATEGORIES}


def _r(code, title, description, required=True):
    return {"code": code, "title": title, "description": description, "required": required}


PREV_EOA = _r("prev_eoa_letter", "Previous EoA Approval Letter", "Upload the last approved EoA letter issued by AICTE.")
FACULTY = _r("faculty_details", "Faculty Details", "Upload faculty list with qualifications and appointment letters.")
BOARD = _r("board_resolution", "Governing Body Resolution", "Resolution of the governing body / society supporting this request.", False)

REQUIREMENTS = {
    ("eoa", "*"): [
        PREV_EOA,
        _r("affiliation_certificate", "Affiliation Certificate", "Upload current affiliation certificate from University."),
        _r("land_documents", "Land Ownership / Lease Documents", "Upload land ownership or lease agreement documents."),
        _r("building_plan", "Building Plan Approval", "Upload approved building plan from competent authority."),
        FACULTY,
        _r("infrastructure_details", "Infrastructure Details", "Upload infrastructure facilities details with photos.", False),
    ],
    ("intake", "*"): [
        PREV_EOA,
        _r("university_consent", "University Consent for Additional Intake", "Consent / NOC from the affiliating university for the proposed intake."),
        FACULTY,
        _r("infrastructure_details", "Classroom & Laboratory Capacity", "Evidence of classroom and laboratory capacity for the additional seats."),
        BOARD,
    ],
    ("new_course", "*"): [
        PREV_EOA,
        _r("university_consent", "University NOC for New Programme", "No-objection / consent from the affiliating university for the proposed programme."),
        _r("curriculum", "Proposed Curriculum & Syllabus", "Curriculum structure and syllabus of the proposed programme."),
        _r("faculty_details", "Proposed Faculty Plan", "Faculty recruitment plan with qualifications for the new programme."),
        _r("lab_details", "Laboratory & Equipment Details", "Laboratories, equipment and infrastructure for the programme."),
        BOARD,
    ],
    ("other", "*"): [
        _r("request_letter", "Covering Letter", "Request letter on institution letterhead describing the change."),
        _r("board_resolution", "Governing Body Resolution", "Resolution of the governing body / society approving the request."),
    ],
    ("other", "change_location"): [
        _r("land_documents", "Land Documents for New Location", "Ownership or lease documents for the proposed location."),
        _r("building_plan", "Building Plan for New Location", "Approved building plan for the proposed campus."),
    ],
    ("other", "change_name"): [
        _r("name_change_certificate", "Name Change Registration", "Registration / certificate supporting the proposed institution name."),
    ],
    ("other", "course_closure"): [
        _r("university_consent", "University NOC", "Consent from the affiliating university for closure or modification."),
        _r("student_undertaking", "Undertaking on Enrolled Students", "Undertaking on protecting currently enrolled students."),
    ],
    ("other", "institution_details"): [
        _r("supporting_proof", "Supporting Proof", "Evidence supporting the requested change of details."),
    ],
    ("other", "other_request"): [
        _r("supporting_proof", "Supporting Document", "Any document supporting the request.", False),
    ],
}

ADDITIONAL_EVIDENCE = {
    "code": "additional_evidence",
    "title": "Additional Evidence",
    "description": "Additional document uploaded in response to a clarification request.",
    "required": False,
}


def requirements_for(app_type, category=None):
    items = list(REQUIREMENTS.get((app_type, "*"), []))
    if app_type == "other" and category:
        items += REQUIREMENTS.get(("other", category), [])
    return [dict(item, sort_order=i + 1) for i, item in enumerate(items)]


# ---- Workflow -------------------------------------------------------------

STATUS_LABELS = {
    "draft": "Draft",
    "submitted": "Submitted",
    "under_scrutiny": "Under Verification",
    "field_verification": "Field Verification",
    "clarification_requested": "Needs Clarification",
    "response_received": "Response Received",
    "final_review": "Final Review",
    "approved": "Approved (Demo Decision)",
    "escalated": "Escalated for Review",
}

# Mutually exclusive dashboard buckets; every non-draft status maps to exactly one.
STATUS_BUCKETS = {
    "submitted": "pending_review",
    "response_received": "pending_review",
    "under_scrutiny": "under_verification",
    "field_verification": "under_verification",
    "final_review": "under_verification",
    "clarification_requested": "needs_clarification",
    "approved": "approved",
    "escalated": "escalated",
}
BUCKET_LABELS = {
    "pending_review": "Pending Review",
    "under_verification": "Under Verification",
    "needs_clarification": "Needs Clarification",
    "approved": "Approved",
    "escalated": "Escalated",
}

ACTIONS = {
    "request_clarification": {
        "label": "Request Clarification",
        "roles": {"scrutiny_member", "reviewer"},
        "from": {"under_scrutiny", "field_verification", "response_received", "final_review"},
        "to": "clarification_requested",
        "comment_required": True,
    },
    "mark_field_verification": {
        "label": "Mark for Field Verification",
        "roles": {"scrutiny_member", "reviewer"},
        "from": {"under_scrutiny", "response_received", "final_review"},
        "to": "field_verification",
        "comment_required": True,
    },
    "forward_review": {
        "label": "Forward for Further Review",
        "roles": {"scrutiny_member", "reviewer"},
        "from": {"under_scrutiny", "field_verification", "response_received"},
        "to": "final_review",
        "comment_required": True,
    },
    "record_approval": {
        "label": "Record Approval Decision",
        "roles": {"reviewer"},
        "from": {"final_review"},
        "to": "approved",
        "comment_required": True,
    },
    "record_escalation": {
        "label": "Escalate for Suspension / Escalation Review",
        "roles": {"reviewer"},
        "from": {"under_scrutiny", "field_verification", "response_received", "final_review"},
        "to": "escalated",
        "comment_required": True,
    },
}

ROLE_LABELS = {
    "institution_admin": "Institution",
    "scrutiny_member": "Scrutiny Member",
    "reviewer": "Reviewer",
    "administrator": "Administrator",
    "system": "System",
}
OFFICIAL_ROLES = ("scrutiny_member", "reviewer", "administrator")
