"""GLIMPSE (field extraction), TRACE-X (integrity indicators) and EvidenceGraph rules.

What is actually computed here:
  * GLIMPSE reads the text layer of digitally generated PDFs with PyMuPDF and pulls
    fields with deterministic patterns. No OCR engine is bundled, so image uploads and
    scanned PDFs report "no text layer" instead of invented values.
  * TRACE-X reports measurable signals only: quality metrics, PDF metadata and
    incremental-revision counts, EXIF editing software, duplicate files and SHA-256
    re-verification of stored bytes. It never labels a document genuine or forged.
  * EvidenceGraph rules compare extracted fields with the institution profile, the
    published approval reference and the applicant's own form entries.
"""

import re
from datetime import date

from . import catalog
from .models import Document, VerificationFinding, VerificationRun, db, utcnow
from .quality import sha256

EDITING_SOFTWARE = ("photoshop", "gimp", "canva", "picsart", "snapseed", "lightroom", "pixlr", "affinity")
MONTHS = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
)}


def _norm(text):
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def _parse_dates(text):
    found = []
    for d, m, y in re.findall(r"\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b", text):
        try:
            found.append(date(int(y), int(m), int(d)))
        except ValueError:
            pass
    for d, mon, y in re.findall(r"\b(\d{1,2})\s+(" + "|".join(MONTHS) + r")\s*,?\s+(20\d{2})\b", text, re.I):
        try:
            found.append(date(int(y), MONTHS[mon.lower()], int(d)))
        except ValueError:
            pass
    return found


def extract_fields(text, institution):
    """Deterministic extraction from a PDF text layer."""
    fields = []
    if not text or len(text.strip()) < 20:
        return fields
    flat = " ".join(text.split())
    norm_text = _norm(flat)

    def add(name, label, value, basis):
        fields.append({"field": name, "label": label, "value": value, "basis": basis, "confidence": "exact text match"})

    if _norm(institution.name) and _norm(institution.name) in norm_text:
        add("institution_name", "Institution Name", institution.name, "profile name found verbatim in text layer")
    else:
        m = re.search(r"(?:Name of the Institution|Institution)\s*[:\-]\s*([A-Za-z&.,()' ]{6,120}?)(?=\s{2,}|\s(?:Permanent|Institution|Academic|Address|Document|Date)\b|$)", flat)
        if m:
            add("institution_name", "Institution Name", m.group(1).strip(), "labelled field in text layer")
    ids = re.findall(r"\b1-(?:DEMO-)?\d{4,10}\b", flat)
    if ids:
        add("permanent_id", "Institution ID", ids[0], "pattern 1-NNNNNNN")
    ay = re.search(r"(?:Academic Year|AY)\s*[:\-]?\s*(20\d{2})\s*[-–]\s*(\d{2,4})", flat, re.I)
    if ay:
        add("academic_year", "Academic Year", f"{ay.group(1)}-{ay.group(2)[-2:]}", "labelled academic year")
    fno = re.search(r"F\.?\s?No\.?\s*[:\-]?\s*([A-Za-z0-9/().\-]{6,60})", flat)
    if fno:
        add("letter_reference", "Letter Reference", fno.group(1).rstrip(".,"), "F.No. pattern")
    intake = re.search(r"(?:approved|sanctioned)\s+intake\s*(?:\(previous\))?\s*[:\-]?\s*(\d{2,4})", flat, re.I)
    if intake:
        add("approved_intake", "Approved Intake (Previous)", intake.group(1), "labelled intake figure")
    dates = _parse_dates(flat)
    if dates:
        add("document_date", "Document Date", dates[0].isoformat(), "first date in text layer")
    return fields


def _finding(run, engine, code, severity, title, detail=None, document=None, field=None, expected=None, observed=None, evidence=None):
    f = VerificationFinding(
        run=run,
        application_id=run.application_id,
        document_id=document.id if document else None,
        engine=engine,
        code=code,
        severity=severity,
        title=title,
        detail=detail,
        field=field,
        expected=None if expected is None else str(expected),
        observed=None if observed is None else str(observed),
        evidence=evidence or {},
    )
    db.session.add(f)
    return f


def active_documents(application):
    return [d for d in application.documents if d.status not in ("superseded", "removed")]


def run_analysis(application, mode="computed", at=None):
    """Recompute GLIMPSE, TRACE-X and EvidenceGraph rules for an application."""
    VerificationRun.query.filter(
        VerificationRun.application_id == application.id,
        VerificationRun.engine.in_(["glimpse", "tracex", "rules"]),
    ).delete(synchronize_session=False)
    VerificationFinding.query.filter(
        VerificationFinding.application_id == application.id,
        VerificationFinding.engine.in_(["glimpse", "tracex", "rules"]),
    ).delete(synchronize_session=False)
    db.session.flush()

    inst = application.institution
    form = (application.form.data if application.form else {}) or {}
    docs = active_documents(application)
    now = at or utcnow()

    glimpse = VerificationRun(application_id=application.id, engine="glimpse", mode=mode, summary={}, created_at=now)
    tracex = VerificationRun(application_id=application.id, engine="tracex", mode=mode, summary={}, created_at=now)
    rules = VerificationRun(application_id=application.id, engine="rules", mode=mode, summary={}, created_at=now)
    db.session.add_all([glimpse, tracex, rules])
    db.session.flush()

    extracted = {}
    g_docs = []
    for doc in docs:
        q = doc.quality or {}
        text = q.get("text_excerpt") or ""
        fields = extract_fields(text, inst) if q.get("kind") == "pdf" else []
        extracted[doc.id] = fields
        source = "text_layer" if fields else ("no_text_layer" if q.get("kind") == "image" or not q.get("text_layer_pages") else "text_layer_no_fields")
        g_docs.append({"document_id": doc.id, "source": source, "fields": fields})
        for f in fields:
            _finding(glimpse, "glimpse", f"extracted_{f['field']}", "info", f"{f['label']} extracted", f["basis"], doc, f["field"], observed=f["value"])
        if source == "no_text_layer":
            _finding(glimpse, "glimpse", "no_text_layer", "info", "No text layer — OCR not run", "This build has no OCR engine; fields were not extracted from this image or scanned page.", doc)
    glimpse.summary = {
        "documents": g_docs,
        "method": "PyMuPDF text-layer extraction with deterministic patterns (no OCR engine bundled)",
    }

    # TRACE-X ----------------------------------------------------------------
    hashes = {}
    t_docs = []
    for doc in docs:
        q = doc.quality or {}
        indicators = []
        stored_ok = doc.blob is not None and sha256(doc.blob.data) == doc.sha256
        if not stored_ok:
            indicators.append("stored bytes do not match upload hash")
            _finding(tracex, "tracex", "hash_mismatch", "critical", "Stored file hash mismatch", "SHA-256 of stored bytes differs from the hash recorded at upload.", doc)
        hashes.setdefault(doc.sha256, []).append(doc)
        if q.get("kind") == "pdf":
            meta = q.get("pdf_metadata") or {}
            revisions = q.get("pdf_revisions") or 1
            if revisions > 1:
                indicators.append(f"{revisions} incremental revisions")
                _finding(tracex, "tracex", "pdf_incremental_updates", "warning", "PDF modified after creation",
                         f"The file contains {revisions} revision markers (%%EOF); content may have been changed after first save.", doc,
                         observed=revisions)
            cdate, mdate = meta.get("creationDate", ""), meta.get("modDate", "")
            if cdate and mdate and mdate[:16] < cdate[:16]:
                indicators.append("modification date precedes creation date")
                _finding(tracex, "tracex", "pdf_date_inconsistent", "warning", "PDF dates inconsistent", "Modification date is earlier than creation date.", doc,
                         expected=cdate, observed=mdate)
        exif = q.get("exif") or {}
        software = (exif.get("software") or "").lower()
        if any(s in software for s in EDITING_SOFTWARE):
            indicators.append(f"edited with {exif.get('software')}")
            _finding(tracex, "tracex", "exif_editor", "warning", "Image processed with editing software", f"EXIF Software tag: {exif.get('software')}.", doc, observed=exif.get("software"))
        if doc.status == "quality_failed":
            indicators.append("quality check failed")
        t_docs.append({
            "document_id": doc.id,
            "hash_verified": stored_ok,
            "quality_verdict": q.get("verdict"),
            "metrics": q.get("metrics") or {p["page"]: p.get("metrics") for p in q.get("pages", [])},
            "pdf_metadata": q.get("pdf_metadata"),
            "pdf_revisions": q.get("pdf_revisions"),
            "exif": exif,
            "indicators": indicators,
            "integrity_status": "attention" if indicators else "no_indicators",
        })
    for digest, group in hashes.items():
        if len(group) > 1:
            names = ", ".join(sorted({d.requirement_code for d in group}))
            for doc in group:
                _finding(tracex, "tracex", "duplicate_file", "warning", "Same file uploaded under multiple categories",
                         f"Identical SHA-256 used for: {names}.", doc, observed=digest[:16])
                for entry in t_docs:
                    if entry["document_id"] == doc.id:
                        entry["indicators"].append("duplicate of another upload")
                        entry["integrity_status"] = "attention"
    tracex.summary = {
        "documents": t_docs,
        "method": "Measured signals only: quality metrics, PDF metadata/revisions, EXIF software, duplicate hashes, SHA-256 re-verification",
    }

    # Rules (EvidenceGraph) ----------------------------------------------------
    reqs = catalog.requirements_for(application.app_type, form.get("request_category"))
    by_code = {}
    for doc in docs:
        by_code.setdefault(doc.requirement_code, []).append(doc)
    missing = [r for r in reqs if r["required"] and r["code"] not in by_code]
    failed = [d for d in docs if d.status == "quality_failed"]
    if missing:
        _finding(rules, "rules", "required_documents_missing", "critical", "Required documents missing",
                 ", ".join(r["title"] for r in missing), expected=len(reqs), observed=len(reqs) - len(missing))
    else:
        _finding(rules, "rules", "required_documents_present", "pass", "All required documents present", f"{len([r for r in reqs if r['required']])} required categories uploaded.")
    if failed:
        _finding(rules, "rules", "quality_failures", "critical", "Documents failed quality checks", ", ".join(d.original_filename for d in failed))
    elif docs:
        warn = [d for d in docs if d.status == "needs_review"]
        if warn:
            _finding(rules, "rules", "quality_warnings", "warning", "Documents need legibility review", ", ".join(d.original_filename for d in warn))
        else:
            _finding(rules, "rules", "quality_passed", "pass", "All documents passed readability checks", f"{len(docs)} documents checked.")

    reference = inst.approvals[0] if inst.approvals else None
    for doc in docs:
        for f in extracted.get(doc.id, []):
            if f["field"] == "institution_name":
                ok = _norm(f["value"]) == _norm(inst.name)
                _finding(rules, "rules", "name_match" if ok else "name_mismatch", "pass" if ok else "warning",
                         "Institution name matches profile" if ok else "Institution name differs from profile",
                         None, doc, "institution_name", inst.name, f["value"], {"rule": "R1", "field_source": doc.id})
            elif f["field"] == "permanent_id":
                ok = f["value"] == inst.permanent_id
                _finding(rules, "rules", "id_match" if ok else "id_mismatch", "pass" if ok else "critical",
                         "Institution ID matches profile" if ok else "Institution ID differs from profile",
                         None, doc, "permanent_id", inst.permanent_id, f["value"], {"rule": "R2", "field_source": doc.id})
            elif f["field"] == "academic_year" and doc.requirement_code == "prev_eoa_letter" and reference:
                ok = f["value"] == reference.academic_year
                _finding(rules, "rules", "prev_ay_match" if ok else "prev_ay_mismatch", "pass" if ok else "warning",
                         "Previous EoA year matches reference record" if ok else "Previous EoA year differs from reference record",
                         None, doc, "academic_year", reference.academic_year, f["value"], {"rule": "R3", "field_source": doc.id})
            elif f["field"] == "approved_intake" and form.get("current_intake"):
                ok = str(form.get("current_intake")) == f["value"]
                _finding(rules, "rules", "intake_match" if ok else "intake_mismatch", "pass" if ok else "critical",
                         "Claimed existing intake matches document" if ok else "Intake mismatch detected",
                         None if ok else f"Previously approved intake on document: {f['value']}. Currently claimed intake in form: {form.get('current_intake')}.",
                         doc, "approved_intake", f["value"], form.get("current_intake"), {"rule": "R4", "field_source": doc.id})
            elif f["field"] == "document_date":
                if f["value"] > date.today().isoformat():
                    _finding(rules, "rules", "future_date", "warning", "Document dated in the future", None, doc, "document_date", f"≤ {date.today().isoformat()}", f["value"], {"rule": "R6"})
    severities = [f.severity for f in rules.findings]
    rules.summary = {
        "critical": severities.count("critical"),
        "warning": severities.count("warning"),
        "pass": severities.count("pass"),
        "method": "Deterministic cross-checks between extracted fields, institution profile, published reference and form entries",
    }
    db.session.flush()


def latest_runs(application):
    runs = {}
    for run in application.runs:
        runs[run.engine] = run
    return runs


def evidence_graph(application, runs):
    """Nodes/edges: Institution → Application → Document → Field → Rule → Reviewer finding."""
    inst = application.institution
    nodes, edges = [], []

    def node(nid, kind, label, status="neutral", meta=None):
        nodes.append({"id": nid, "kind": kind, "label": label, "status": status, "meta": meta or {}})

    node("inst", "institution", inst.name, meta={"permanent_id": inst.permanent_id})
    node("app", "application", application.application_number or f"Draft {application.id}",
         meta={"type": catalog.APP_TYPE_SHORT[application.app_type], "status": application.status})
    edges.append({"from": "inst", "to": "app"})
    docs = active_documents(application)
    quality_state = {"accepted": "pass", "needs_review": "warning", "quality_failed": "critical"}
    for d in docs:
        node(f"doc{d.id}", "document", d.original_filename, quality_state.get(d.status, "neutral"), {"category": d.requirement_code})
        edges.append({"from": "app", "to": f"doc{d.id}"})
    glimpse = runs.get("glimpse")
    if glimpse:
        for f in glimpse.findings:
            if f.code.startswith("extracted_") and f.document_id:
                fid = f"field{f.id}"
                node(fid, "field", f"{f.field}: {f.observed}", meta={"document_id": f.document_id})
                edges.append({"from": f"doc{f.document_id}", "to": fid})
    rules = runs.get("rules")
    field_nodes = {(n["meta"].get("document_id"), n["label"].split(":")[0]): n["id"] for n in nodes if n["kind"] == "field"}
    if rules:
        for f in rules.findings:
            rid = f"rule{f.id}"
            node(rid, "rule", f.title, f.severity, {"expected": f.expected, "observed": f.observed, "detail": f.detail})
            src = field_nodes.get((f.document_id, f.field))
            if src:
                edges.append({"from": src, "to": rid})
            elif f.document_id:
                edges.append({"from": f"doc{f.document_id}", "to": rid})
            else:
                edges.append({"from": "app", "to": rid})
    rule_ids = [n["id"] for n in nodes if n["kind"] == "rule" and n["status"] in ("critical", "warning")]
    for ra in application.review_actions:
        aid = f"review{ra.id}"
        node(aid, "finding", catalog.ACTIONS.get(ra.action, {}).get("label", ra.action), "neutral",
             {"comment": ra.comment, "role": catalog.ROLE_LABELS.get(ra.role), "at": ra.created_at.isoformat() + "Z"})
        targets = rule_ids or ["app"]
        for t in targets:
            edges.append({"from": t, "to": aid})
    return {"nodes": nodes, "edges": edges}
