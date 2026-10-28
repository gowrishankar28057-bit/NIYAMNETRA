from .conftest import complete_eoa, login, official_client


def _data(resp):
    return resp.get_json()["data"]


def submit_fresh_eoa(app):
    ci = app.test_client()
    login(ci, "institution")
    app_id = _data(ci.post("/api/applications", json={"app_type": "eoa", "academic_year": "2027-28"}))["application"]["id"]
    complete_eoa(ci, app_id)
    ci.post(f"/api/applications/{app_id}/submit", json={"confirm": True})
    return ci, app_id


def test_dashboard_buckets_sum_to_total(app):
    co = official_client(app, "administrator")
    totals = _data(co.get("/api/official/dashboard"))["totals"]
    assert totals["pending_review"] + totals["under_verification"] + totals["needs_clarification"] + totals["approved"] + totals["escalated"] == totals["applications"]


def test_dashboard_matches_queue_total(app):
    co = official_client(app, "administrator")
    dash_total = _data(co.get("/api/official/dashboard"))["totals"]["applications"]
    queue_total = _data(co.get("/api/official/applications?page_size=50"))["pagination"]["total"]
    assert dash_total == queue_total


def test_role_permissions_enforced_server_side(app):
    ci, app_id = submit_fresh_eoa(app)
    scrutiny = official_client(app, "scrutiny_member")
    scrutiny.post(f"/api/official/applications/{app_id}/open")
    # Scrutiny may not record an approval.
    r = scrutiny.post(f"/api/official/applications/{app_id}/actions", json={"action": "record_approval", "comment": "approve", "confirm": True})
    assert r.status_code == 403
    assert r.get_json()["error"]["code"] == "forbidden_role"


def test_clarification_cycle_cross_portal(app):
    ci, app_id = submit_fresh_eoa(app)
    number = _data(ci.get(f"/api/applications/{app_id}"))["application_number"]
    scrutiny = official_client(app, "scrutiny_member")
    scrutiny.post(f"/api/official/applications/{app_id}/open")
    r = scrutiny.post(f"/api/official/applications/{app_id}/actions",
                      json={"action": "request_clarification", "comment": "Upload the signed building plan page.", "deadline": "2026-12-01"})
    assert r.status_code == 200

    # Institution side reflects it.
    detail = _data(ci.get(f"/api/applications/{app_id}"))
    assert detail["status"] == "clarification_requested"
    assert detail["clarification"]["open"] is True
    assert detail["clarification"]["deadline"] == "2026-12-01"

    r = ci.post(f"/api/applications/{app_id}/clarifications", json={"message": "Signed building plan has been attached."})
    assert r.status_code == 200
    assert _data(r)["status"] == "response_received"

    # Reviewer forwards then approves.
    reviewer = official_client(app, "reviewer")
    reviewer.post(f"/api/official/applications/{app_id}/open")
    assert reviewer.post(f"/api/official/applications/{app_id}/actions",
                         json={"action": "forward_review", "comment": "Signed plan received; forwarding."}).status_code == 200
    r = reviewer.post(f"/api/official/applications/{app_id}/actions",
                      json={"action": "record_approval", "comment": "Demonstration approval after reviewing the evidence.", "confirm": True})
    assert r.status_code == 200
    assert _data(ci.get(f"/api/applications/{app_id}"))["status"] == "approved"

    # Audit holds the real sequence with correct actors.
    admin = official_client(app, "administrator")
    entries = _data(admin.get(f"/api/official/audit?application={number}"))["entries"]
    actions = [e["action"] for e in entries]
    assert "request_clarification" in actions and "clarification_response" in actions and "record_approval" in actions
    approval = next(e for e in entries if e["action"] == "record_approval")
    assert approval["role"] == "reviewer"


def test_record_approval_requires_final_review_state(app):
    ci, app_id = submit_fresh_eoa(app)
    reviewer = official_client(app, "reviewer")
    reviewer.post(f"/api/official/applications/{app_id}/open")
    r = reviewer.post(f"/api/official/applications/{app_id}/actions",
                      json={"action": "record_approval", "comment": "approve directly", "confirm": True})
    assert r.status_code == 409
    assert r.get_json()["error"]["code"] == "invalid_transition"


def test_audit_export_role_restricted(app):
    assert official_client(app, "scrutiny_member").get("/api/official/audit/export").status_code == 403
    assert official_client(app, "administrator").get("/api/official/audit/export").status_code == 200


def test_intake_discrepancy_case_flagged(app):
    co = official_client(app, "scrutiny_member")
    disc = _data(co.get("/api/official/applications?search=Neelgiri"))["applications"][0]
    detail = _data(co.get(f"/api/official/applications/{disc['id']}"))
    codes = [f["code"] for f in detail["verification"]["rules"]["findings"]]
    assert "intake_mismatch" in codes
    assert detail["simulated"] is True
    assert len(detail["evidence_graph"]["nodes"]) > 5


def test_logout_clears_session(app):
    co = official_client(app, "reviewer")
    assert co.get("/api/official/dashboard").status_code == 200
    co.post("/api/auth/logout", json={"portal": "official"})
    assert co.get("/api/official/dashboard").status_code == 401
