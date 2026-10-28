import os

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

from .config import Config
from .errors import ApiError
from .models import db


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.from_object(config or Config)
    if app.config["SQLALCHEMY_DATABASE_URI"].startswith("sqlite:///") and "sqlite://" != app.config["SQLALCHEMY_DATABASE_URI"]:
        os.makedirs(os.path.join(os.path.dirname(__file__), "..", "instance"), exist_ok=True)
    db.init_app(app)

    from .routes.auth_routes import bp as auth_bp
    from .routes.institution import bp as institution_bp
    from .routes.official import bp as official_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(institution_bp)
    app.register_blueprint(official_bp)

    @app.after_request
    def cors(resp):
        origin = request.headers.get("Origin")
        allowed = app.config["CORS_ORIGINS"]
        if origin and (origin in allowed or (app.debug and origin.startswith("http://localhost"))):
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Credentials"] = "true"
            resp.headers["Vary"] = "Origin"
            resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
        return resp

    @app.route("/api/<path:_any>", methods=["OPTIONS"])
    def preflight(_any):
        return ("", 204)

    @app.errorhandler(ApiError)
    def handle_api_error(exc):
        return exc.response()

    @app.errorhandler(413)
    def too_large(_exc):
        return jsonify({"ok": False, "error": {"code": "file_too_large", "message": "File exceeds the upload size limit."}}), 413

    @app.errorhandler(HTTPException)
    def handle_http(exc):
        if request.path.startswith("/api/"):
            return jsonify({"ok": False, "error": {"code": exc.name.lower().replace(" ", "_"), "message": exc.description}}), exc.code
        return exc

    @app.errorhandler(Exception)
    def handle_unexpected(exc):
        app.logger.exception("Unhandled error")
        if request.path.startswith("/api/"):
            return jsonify({"ok": False, "error": {"code": "internal_error", "message": "An unexpected error occurred."}}), 500
        raise exc

    @app.post("/api/demo/reset")
    def demo_reset():
        from .auth import load_session
        from .models import User
        from .seed import reset_demo

        if not app.config["DEMO_MODE"]:
            raise ApiError(403, "demo_disabled", "Demo reset is only available in demo mode.")
        sess = load_session("official")
        user = db.session.get(User, sess.user_id) if sess else None
        if sess and sess.role != "administrator":
            raise ApiError(403, "forbidden_role", "Only an administrator session may reset the demo scenario.")
        reset_demo(user)
        return jsonify({"ok": True, "data": {"reset": True}})

    @app.get("/api/health")
    def health():
        try:
            db.session.execute(db.text("SELECT 1"))
            database = "ok"
        except Exception:
            database = "error"
        return jsonify({"ok": True, "data": {"status": "ok", "database": database, "demo_mode": app.config["DEMO_MODE"]}})

    _register_spa(app)

    with app.app_context():
        if app.config.get("AUTO_SEED") and not app.config.get("TESTING"):
            try:
                db.create_all()
                from .seed import ensure_seeded

                ensure_seeded()
            except Exception:
                app.logger.exception("Auto-seed skipped")

    register_cli(app)
    return app


def _register_spa(app):
    dist = app.config["FRONTEND_DIST"]

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def spa(path):
        if path.startswith("api/"):
            return jsonify({"ok": False, "error": {"code": "not_found", "message": "Unknown API route."}}), 404
        target = dist / path
        if path and target.is_file():
            return send_from_directory(dist, path)
        index = dist / "index.html"
        if index.is_file():
            return send_from_directory(dist, "index.html")
        return jsonify({"ok": True, "data": {"message": "NeyamNetra API is running. Build the frontend to serve the UI from this origin."}})


def register_cli(app):
    @app.cli.command("init-db")
    def init_db():
        """Create all database tables."""
        db.create_all()
        print("Database tables created.")

    @app.cli.command("seed")
    def seed():
        """Seed the deterministic demo scenario (idempotent)."""
        db.create_all()
        from .seed import ensure_seeded

        ensure_seeded()
        print("Demo data seeded.")

    @app.cli.command("reset-demo")
    def reset_demo_cmd():
        """Reset applications and audit log, then re-seed."""
        from .seed import reset_demo

        reset_demo()
        print("Demo scenario reset.")
