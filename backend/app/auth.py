"""Demo-mode sessions with server-side role enforcement.

Each portal has its own HttpOnly cookie so the institution and official portals can
be open side by side during a demonstration. Tokens are random, stored only as a
SHA-256 hash, scoped to "demo" and expire after SESSION_HOURS. Passwords typed on the
demo login screens are checked for presence only and are never stored or logged.
"""

import hashlib
import secrets
from datetime import timedelta
from functools import wraps

from flask import current_app, g, request

from .errors import ApiError
from .models import DemoSession, User, db, utcnow

COOKIES = {"institution": "nn_inst_session", "official": "nn_off_session"}


def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(user, response):
    token = secrets.token_urlsafe(32)
    hours = current_app.config["SESSION_HOURS"]
    sess = DemoSession(
        token_hash=_hash(token),
        user_id=user.id,
        portal=user.portal,
        role=user.role,
        scope="demo",
        expires_at=utcnow() + timedelta(hours=hours),
    )
    db.session.add(sess)
    response.set_cookie(
        COOKIES[user.portal],
        token,
        max_age=hours * 3600,
        httponly=True,
        samesite="Lax",
        secure=current_app.config["COOKIE_SECURE"],
        path="/",
    )
    return sess


def load_session(portal):
    token = request.cookies.get(COOKIES[portal])
    if not token:
        return None
    sess = DemoSession.query.filter_by(token_hash=_hash(token), portal=portal).first()
    if not sess or sess.revoked_at or sess.expires_at < utcnow():
        return None
    if sess.scope == "demo" and not current_app.config["DEMO_MODE"]:
        return None
    return sess


def revoke_session(portal, response):
    sess = load_session(portal)
    if sess:
        sess.revoked_at = utcnow()
    response.delete_cookie(COOKIES[portal], path="/")
    return sess


def require(portal, roles=None):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            sess = load_session(portal)
            if not sess:
                raise ApiError(401, "not_authenticated", "Please sign in to continue.")
            if roles and sess.role not in roles:
                raise ApiError(403, "forbidden_role", "Your role is not permitted to perform this action.")
            g.session = sess
            g.user = db.session.get(User, sess.user_id)
            return fn(*args, **kwargs)

        return wrapper

    return decorator
