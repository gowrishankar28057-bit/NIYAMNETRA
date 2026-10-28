from .conftest import complete_eoa, login, official_client, sample_document_pdf, sample_image, upload


def _data(resp):
    return resp.get_json()["data"]


def test_config_reports_demo_mode(client):
    assert _data(client.get("/api/config"))["demo_mode"] is True


def test_demo_login_requires_nonempty_credentials(client):
    r = client.post("/api/auth/demo-login", json={"portal": "institution", "login_id": "", "password": ""})
    assert r.status_code == 422
    assert "login_id" in r.get_json()["error"]["details"]["fields"]


def test_institution_login_and_dashboard(inst_client):
    d = _data(inst_client.get("/api/institution/dashboard"))
    assert d["institution"]["permanent_id"] == "1-4261798"
    assert d["institution"]["reference_approval"]["academic_year"] == "2026-27"


def test_unauthenticated_blocked(client):
    assert client.get("/api/institution/dashboard").status_code == 401


def test_full_eoa_submission_creates_record_and_appears_in_queue(app):
    ci = app.test_client()
    login(ci, "institution")
    app_id = _data(ci.post("/api/applications", json={"app_type": "eoa", "academic_year": "2027-28"}))["application"]["id"]
    complete_eoa(ci, app_id)
    r = ci.post(f"/api/applications/{app_id}/submit", json={"confirm": True})
    assert r.status_code == 200
    number = _data(r)["application_number"]
    assert number and _data(r)["status"] == "submitted"

    # Track page shows it immediately.
    tl = _data(ci.get(f"/api/applications/{app_id}/timeline"))
    assert tl["status"] == "submitted"
    assert any(s["key"] == "submitted" and s["state"] == "completed" for s in tl["stages"])

    co = official_client(app, "scrutiny_member")
    found = _data(co.get(f"/api/official/applications?search={number}"))["applications"]
    assert any(a["application_number"] == number for a in found)


def test_submit_blocked_without_required_documents(inst_client):
    app_id = _data(inst_client.post("/api/applications", json={"app_type": "eoa"}))["application"]["id"]
    r = inst_client.post(f"/api/applications/{app_id}/submit", json={"confirm": True})
    assert r.status_code == 422
    assert r.get_json()["error"]["code"] == "checklist_incomplete"


def test_blurry_upload_then_clear_replacement(inst_client):
    app_id = _data(inst_client.post("/api/applications", json={"app_type": "eoa"}))["application"]["id"]
    r = upload(inst_client, app_id, "prev_eoa_letter", sample_image(blur=6), "blur.jpg", "image/jpeg")
    assert _data(r)["document"]["status"] == "quality_failed"
    assert not _data(r)["checklist"]["ready"]
    r = upload(inst_client, app_id, "prev_eoa_letter", sample_image(), "clear.jpg", "image/jpeg")
    assert _data(r)["document"]["status"] == "accepted"


def test_duplicate_submit_prevented(inst_client):
    app_id = _data(inst_client.post("/api/applications", json={"app_type": "eoa"}))["application"]["id"]
    complete_eoa(inst_client, app_id)
    assert inst_client.post(f"/api/applications/{app_id}/submit", json={"confirm": True}).status_code == 200
    again = inst_client.post(f"/api/applications/{app_id}/submit", json={"confirm": True})
    assert again.status_code == 409
    assert again.get_json()["error"]["code"] == "already_submitted"


def test_intake_form_validation_rejects_lower_proposed(inst_client):
    app_id = _data(inst_client.post("/api/applications", json={"app_type": "intake"}))["application"]["id"]
    r = inst_client.patch(f"/api/applications/{app_id}", json={
        "validate": True,
        "form_data": {"programme_name": "B.Tech CSE", "department": "CSE", "programme_level": "UG",
                      "current_intake": 120, "proposed_intake": 100, "classroom_capacity": 200,
                      "lab_availability": "available", "faculty_strength": 30,
                      "justification": "x" * 40},
    })
    assert r.status_code == 422
    assert "proposed_intake" in r.get_json()["error"]["details"]["fields"]


def test_intake_additional_seats_autocalculated(inst_client):
    app_id = _data(inst_client.post("/api/applications", json={"app_type": "intake"}))["application"]["id"]
    r = inst_client.patch(f"/api/applications/{app_id}", json={
        "validate": True,
        "form_data": {"programme_name": "B.Tech CSE", "department": "CSE", "programme_level": "UG",
                      "current_intake": 120, "proposed_intake": 180, "classroom_capacity": 240,
                      "lab_availability": "available", "faculty_strength": 42,
                      "justification": "Sustained demand justifies one more section of sixty seats."},
    })
    assert r.status_code == 200
    assert _data(r)["form_data"]["additional_seats"] == 60


def test_draft_edits_persist_invalid_values(inst_client):
    app_id = _data(inst_client.post("/api/applications", json={"app_type": "new_course"}))["application"]["id"]
    # Partial save with a too-short justification keeps typed data rather than discarding it.
    r = inst_client.patch(f"/api/applications/{app_id}", json={"form_data": {"programme_name": "Robotics", "justification": "short"}})
    assert r.status_code == 200
    reloaded = _data(inst_client.get(f"/api/applications/{app_id}"))
    assert reloaded["form_data"]["programme_name"] == "Robotics"
    assert reloaded["form_data"]["justification"] == "short"


def test_ownership_isolation_hard_blocks_other_institution(app):
    # The seeded intake discrepancy case belongs to a fictional institution, not MAIT.
    co = official_client(app, "scrutiny_member")
    other = _data(co.get("/api/official/applications?search=Neelgiri"))["applications"][0]
    ci = app.test_client()
    login(ci, "institution")
    assert ci.get(f"/api/applications/{other['id']}").status_code == 404


def test_other_request_contextual_fields_validated(inst_client):
    app_id = _data(inst_client.post("/api/applications", json={"app_type": "other"}))["application"]["id"]
    r = inst_client.patch(f"/api/applications/{app_id}", json={
        "validate": True,
        "form_data": {"request_category": "change_name", "description": "x" * 40, "justification": "y" * 40},
    })
    assert r.status_code == 422
    fields = r.get_json()["error"]["details"]["fields"]
    assert "current_name" in fields and "proposed_name" in fields
