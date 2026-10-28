import io
import warnings

import pytest

warnings.filterwarnings("ignore")

from app import create_app  # noqa: E402
from app.config import TestConfig  # noqa: E402
from app.models import db  # noqa: E402
from app.samples import blurred, document_image, sample_pdf, to_jpeg  # noqa: E402
from app.seed import seed_cases, seed_reference_data  # noqa: E402


@pytest.fixture
def app():
    application = create_app(TestConfig)
    with application.app_context():
        db.create_all()
        seed_reference_data()
        seed_cases()
        db.session.commit()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


def login(client, portal, role=None):
    body = {"portal": portal, "login_id": "demo-user", "password": "demo-pass"}
    if role:
        body["role"] = role
    return client.post("/api/auth/demo-login", json=body)


@pytest.fixture
def inst_client(app):
    c = app.test_client()
    login(c, "institution")
    return c


def official_client(app, role):
    c = app.test_client()
    login(c, "official", role)
    return c


SHARP_PAGE = None


def sample_image(blur=0.0):
    page = document_image(
        "Previous EoA Approval Letter",
        ["Name of the Institution: Maharaja Agrasen Institute of Technology", "Permanent ID: 1-4261798", "Academic Year: 2026-27"],
    )
    if blur:
        page = blurred(page, blur)
    return to_jpeg(page)


def sample_document_pdf(title="Affiliation Certificate"):
    return sample_pdf(title, ["Name of the Institution: Maharaja Agrasen Institute of Technology", "Permanent ID: 1-4261798"])


def upload(client, app_id, code, data, filename, content_type):
    return client.post(
        f"/api/applications/{app_id}/documents",
        data={"requirement_code": code, "file": (io.BytesIO(data), filename, content_type)},
        content_type="multipart/form-data",
    )


def complete_eoa(client, app_id):
    upload(client, app_id, "prev_eoa_letter", sample_image(), "prev.jpg", "image/jpeg")
    for code in ("affiliation_certificate", "land_documents", "building_plan", "faculty_details"):
        upload(client, app_id, code, sample_document_pdf(code), f"{code}.pdf", "application/pdf")
