from datetime import date

from flask import Blueprint, current_app, jsonify, request

from .. import catalog
from ..auth import create_session, load_session, revoke_session
from ..errors import ApiError, ok
from ..models import Institution, User, db
from ..services import audit

bp = Blueprint("auth", __name__)


def _session_json(sess):
    if not sess:
        return None
    user = sess.user
    data = {
        "user": {"id": user.id, "display_name": user.display_name, "role": user.role, "role_label": catalog.ROLE_LABELS[user.role]},
        "portal": sess.portal,
        "scope": sess.scope,
        "expires_at": sess.expires_at.isoformat() + "Z",
    }
    if user.institution_id:
        inst = db.session.get(Institution, user.institution_id)
        data["institution"] = {"id": inst.id, "name": inst.name, "short_name": inst.short_name, "permanent_id": inst.permanent_id}
    return data


@bp.get("/api/config")
def config():
    return ok({
        "demo_mode": current_app.config["DEMO_MODE"],
        "app_name": "NeyamNetra",
        "today": date.today().isoformat(),
        "max_upload_mb": current_app.config["MAX_UPLOAD_MB"],
        "disclaimer": "SIH 2026 Prototype • NeyamNetra by Neural Nexus • Not an official AICTE service",
    })


@bp.post("/api/auth/demo-login")
def demo_login():
    if not current_app.config["DEMO_MODE"]:
        raise ApiError(403, "demo_login_disabled", "Demo access is disabled. Real authentication has not been configured for this deployment.")
    body = request.get_json(silent=True) or {}
    portal = body.get("portal")
    login_id = (body.get("login_id") or "").strip()
    password = body.get("password") or ""
    errors = {}
    if portal not in ("institution", "official"):
        errors["portal"] = "Unknown portal."
    if not login_id:
        errors["login_id"] = "Login ID is required."
    if not password.strip():
        errors["password"] = "Password is required."
    role = body.get("role") if portal == "official" else "institution_admin"
    if portal == "official" and role not in catalog.OFFICIAL_ROLES:
        errors["role"] = "Select a valid role."
    if errors:
        raise ApiError(422, "validation_failed", "Please correct the highlighted fields.", {"fields": errors})
    # The entered ID and password are deliberately discarded: demo access maps to a seeded demo account.
    user = User.query.filter_by(portal=portal, role=role, is_demo=True).order_by(User.id).first()
    if not user:
        raise ApiError(503, "demo_data_missing", "Demo accounts are not seeded. Run the seed command.")
    resp = jsonify({"ok": True, "data": None})
    sess = create_session(user, resp)
    db.session.flush()
    audit("demo_login", f"{catalog.ROLE_LABELS[role]} signed in (demo access)", user)
    db.session.commit()
    resp.set_data(jsonify({"ok": True, "data": _session_json(sess)}).get_data())
    return resp


@bp.get("/api/auth/me")
def me():
    return ok({
        "demo_mode": current_app.config["DEMO_MODE"],
        "institution": _session_json(load_session("institution")),
        "official": _session_json(load_session("official")),
    })


@bp.post("/api/auth/logout")
def logout():
    portal = (request.get_json(silent=True) or {}).get("portal")
    if portal not in ("institution", "official"):
        raise ApiError(422, "validation_failed", "Unknown portal.")
    resp = jsonify({"ok": True, "data": None})
    sess = revoke_session(portal, resp)
    if sess:
        audit("logout", "Signed out", sess.user)
    db.session.commit()
    return resp


@bp.get("/api/application-types")
def application_types():
    return ok({
        "types": catalog.APPLICATION_TYPES,
        "other_categories": catalog.OTHER_CATEGORIES,
        "academic_years": catalog.ACADEMIC_YEARS,
        "default_academic_year": catalog.DEMO_ACADEMIC_YEAR,
        "handbook_version": catalog.HANDBOOK_VERSION,
        "handbook_note": catalog.HANDBOOK_NOTE,
    })


@bp.get("/api/document-requirements")
def document_requirements():
    app_type = request.args.get("type")
    if app_type not in catalog.APP_TYPE_CODES:
        raise ApiError(422, "validation_failed", "Unknown application type.")
    return ok({
        "requirements": catalog.requirements_for(app_type, request.args.get("category")),
        "handbook_version": catalog.HANDBOOK_VERSION,
        "handbook_note": catalog.HANDBOOK_NOTE,
    })
