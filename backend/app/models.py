from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import JSON, CheckConstraint, Index, UniqueConstraint

db = SQLAlchemy()


def utcnow():
    # Stored as naive UTC so SQLite and PostgreSQL behave the same.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Institution(db.Model):
    __tablename__ = "institutions"
    id = db.Column(db.Integer, primary_key=True)
    permanent_id = db.Column(db.String(40), unique=True, nullable=False)
    name = db.Column(db.String(200), nullable=False)
    short_name = db.Column(db.String(40))
    address = db.Column(db.String(300))
    city = db.Column(db.String(80))
    state = db.Column(db.String(80))
    affiliating_university = db.Column(db.String(200))
    institution_type = db.Column(db.String(80))
    # True for the real institution used as the demo login; its public
    # reference data lives in InstitutionApproval, never in Application.
    is_reference_profile = db.Column(db.Boolean, default=False, nullable=False)
    is_synthetic = db.Column(db.Boolean, default=False, nullable=False)
    source_note = db.Column(db.String(400))
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    approvals = db.relationship("InstitutionApproval", back_populates="institution", order_by="InstitutionApproval.approval_date.desc()")


class InstitutionApproval(db.Model):
    """Published approval references, kept apart from demo case data."""

    __tablename__ = "institution_approvals"
    id = db.Column(db.Integer, primary_key=True)
    institution_id = db.Column(db.Integer, db.ForeignKey("institutions.id"), nullable=False, index=True)
    academic_year = db.Column(db.String(9), nullable=False)
    approval_date = db.Column(db.Date, nullable=False)
    letter_reference = db.Column(db.String(120))
    source_url = db.Column(db.String(400))
    record_kind = db.Column(db.String(40), nullable=False, default="published_reference")
    note = db.Column(db.String(400))

    institution = db.relationship("Institution", back_populates="approvals")


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    display_name = db.Column(db.String(120), nullable=False)
    portal = db.Column(db.String(20), nullable=False)
    role = db.Column(db.String(30), nullable=False)
    institution_id = db.Column(db.Integer, db.ForeignKey("institutions.id"), index=True)
    is_demo = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    institution = db.relationship("Institution")

    __table_args__ = (
        CheckConstraint("portal in ('institution','official')", name="ck_users_portal"),
        CheckConstraint(
            "role in ('institution_admin','scrutiny_member','reviewer','administrator')",
            name="ck_users_role",
        ),
    )


class DemoSession(db.Model):
    __tablename__ = "demo_sessions"
    id = db.Column(db.Integer, primary_key=True)
    token_hash = db.Column(db.String(64), unique=True, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    portal = db.Column(db.String(20), nullable=False)
    role = db.Column(db.String(30), nullable=False)
    scope = db.Column(db.String(40), nullable=False, default="demo")
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    revoked_at = db.Column(db.DateTime)

    user = db.relationship("User")


class Application(db.Model):
    __tablename__ = "applications"
    id = db.Column(db.Integer, primary_key=True)
    application_number = db.Column(db.String(30), unique=True)
    institution_id = db.Column(db.Integer, db.ForeignKey("institutions.id"), nullable=False, index=True)
    app_type = db.Column(db.String(20), nullable=False)
    academic_year = db.Column(db.String(9), nullable=False)
    status = db.Column(db.String(30), nullable=False, default="draft", index=True)
    handbook_version = db.Column(db.String(60), nullable=False)
    is_synthetic = db.Column(db.Boolean, default=False, nullable=False)
    is_seeded = db.Column(db.Boolean, default=False, nullable=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    submitted_at = db.Column(db.DateTime, index=True)
    status_changed_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    clarification_deadline = db.Column(db.Date)
    decision_outcome = db.Column(db.String(30))

    institution = db.relationship("Institution")
    form = db.relationship("ApplicationFormData", uselist=False, back_populates="application", cascade="all, delete-orphan")
    documents = db.relationship("Document", back_populates="application", cascade="all, delete-orphan", order_by="Document.id")
    events = db.relationship("WorkflowEvent", back_populates="application", cascade="all, delete-orphan", order_by="WorkflowEvent.id")
    review_actions = db.relationship("ReviewAction", back_populates="application", cascade="all, delete-orphan", order_by="ReviewAction.id")
    runs = db.relationship("VerificationRun", back_populates="application", cascade="all, delete-orphan", order_by="VerificationRun.id")

    __table_args__ = (
        CheckConstraint("app_type in ('eoa','intake','new_course','other')", name="ck_app_type"),
        Index("ix_applications_inst_status", "institution_id", "status"),
    )


class ApplicationFormData(db.Model):
    __tablename__ = "application_form_data"
    id = db.Column(db.Integer, primary_key=True)
    application_id = db.Column(db.Integer, db.ForeignKey("applications.id"), unique=True, nullable=False)
    data = db.Column(JSON, nullable=False, default=dict)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    application = db.relationship("Application", back_populates="form")


class DocumentRequirement(db.Model):
    __tablename__ = "document_requirements"
    id = db.Column(db.Integer, primary_key=True)
    app_type = db.Column(db.String(20), nullable=False)
    category = db.Column(db.String(40), nullable=False, default="*")
    code = db.Column(db.String(60), nullable=False)
    title = db.Column(db.String(160), nullable=False)
    description = db.Column(db.String(400))
    required = db.Column(db.Boolean, nullable=False, default=True)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    handbook_version = db.Column(db.String(60), nullable=False)

    __table_args__ = (UniqueConstraint("app_type", "category", "code", "handbook_version", name="uq_requirement"),)


class Document(db.Model):
    __tablename__ = "documents"
    id = db.Column(db.Integer, primary_key=True)
    application_id = db.Column(db.Integer, db.ForeignKey("applications.id"), nullable=False, index=True)
    requirement_code = db.Column(db.String(60), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    safe_filename = db.Column(db.String(255), nullable=False)
    content_type = db.Column(db.String(60), nullable=False)
    size_bytes = db.Column(db.Integer, nullable=False)
    sha256 = db.Column(db.String(64), nullable=False)
    page_count = db.Column(db.Integer)
    status = db.Column(db.String(20), nullable=False, index=True)
    quality = db.Column(JSON, nullable=False, default=dict)
    phase = db.Column(db.String(20), nullable=False, default="initial")
    is_synthetic_sample = db.Column(db.Boolean, default=False, nullable=False)
    replaces_id = db.Column(db.Integer, db.ForeignKey("documents.id"))
    uploaded_by_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    uploaded_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    application = db.relationship("Application", back_populates="documents")
    blob = db.relationship("DocumentBlob", uselist=False, cascade="all, delete-orphan", back_populates="document")

    __table_args__ = (
        CheckConstraint(
            "status in ('accepted','needs_review','quality_failed','superseded','removed')",
            name="ck_document_status",
        ),
    )


class DocumentBlob(db.Model):
    """File bytes live in the database so a single hosted service keeps them across redeploys."""

    __tablename__ = "document_blobs"
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"), primary_key=True)
    data = db.Column(db.LargeBinary, nullable=False)

    document = db.relationship("Document", back_populates="blob")


class VerificationRun(db.Model):
    __tablename__ = "verification_runs"
    id = db.Column(db.Integer, primary_key=True)
    application_id = db.Column(db.Integer, db.ForeignKey("applications.id"), nullable=False, index=True)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"))
    engine = db.Column(db.String(20), nullable=False)
    mode = db.Column(db.String(20), nullable=False, default="computed")
    status = db.Column(db.String(20), nullable=False, default="completed")
    summary = db.Column(JSON, nullable=False, default=dict)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    application = db.relationship("Application", back_populates="runs")
    findings = db.relationship("VerificationFinding", back_populates="run", cascade="all, delete-orphan", order_by="VerificationFinding.id")


class VerificationFinding(db.Model):
    __tablename__ = "verification_findings"
    id = db.Column(db.Integer, primary_key=True)
    run_id = db.Column(db.Integer, db.ForeignKey("verification_runs.id"), nullable=False, index=True)
    application_id = db.Column(db.Integer, db.ForeignKey("applications.id"), nullable=False, index=True)
    document_id = db.Column(db.Integer, db.ForeignKey("documents.id"))
    engine = db.Column(db.String(20), nullable=False)
    code = db.Column(db.String(60), nullable=False)
    severity = db.Column(db.String(20), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    detail = db.Column(db.String(800))
    field = db.Column(db.String(80))
    expected = db.Column(db.String(300))
    observed = db.Column(db.String(300))
    evidence = db.Column(JSON, nullable=False, default=dict)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    run = db.relationship("VerificationRun", back_populates="findings")


class WorkflowEvent(db.Model):
    __tablename__ = "workflow_events"
    id = db.Column(db.Integer, primary_key=True)
    application_id = db.Column(db.Integer, db.ForeignKey("applications.id"), nullable=False, index=True)
    event_type = db.Column(db.String(40), nullable=False)
    from_status = db.Column(db.String(30))
    to_status = db.Column(db.String(30))
    actor_user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    actor_label = db.Column(db.String(120), nullable=False)
    actor_role = db.Column(db.String(30))
    message = db.Column(db.String(2000))
    visible_to_institution = db.Column(db.Boolean, nullable=False, default=True)
    data = db.Column(JSON, nullable=False, default=dict)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    application = db.relationship("Application", back_populates="events")


class ReviewAction(db.Model):
    __tablename__ = "review_actions"
    id = db.Column(db.Integer, primary_key=True)
    application_id = db.Column(db.Integer, db.ForeignKey("applications.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    role = db.Column(db.String(30), nullable=False)
    action = db.Column(db.String(40), nullable=False)
    comment = db.Column(db.String(2000))
    deadline = db.Column(db.Date)
    from_status = db.Column(db.String(30), nullable=False)
    to_status = db.Column(db.String(30), nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)

    application = db.relationship("Application", back_populates="review_actions")
    user = db.relationship("User")


class AuditLog(db.Model):
    """Append-only: rows are inserted, never updated."""

    __tablename__ = "audit_logs"
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    actor_label = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(30), nullable=False)
    action = db.Column(db.String(50), nullable=False, index=True)
    application_id = db.Column(db.Integer, db.ForeignKey("applications.id"), index=True)
    application_number = db.Column(db.String(30))
    institution_name = db.Column(db.String(200))
    details = db.Column(db.String(1000))
    data = db.Column(JSON, nullable=False, default=dict)
    is_seeded = db.Column(db.Boolean, nullable=False, default=False)
