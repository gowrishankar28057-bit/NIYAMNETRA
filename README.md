# NeyamNetra

**AICTE Extension-of-Approval & document-verification decision-support prototype**
Team **Neural Nexus** · Smart India Hackathon 2026

> **SIH 2026 Prototype • NeyamNetra by Neural Nexus • Not an official AICTE service.**
> This application does not issue regulatory approvals, does not connect to any
> government database, and does not claim official AICTE affiliation. All approval
> decisions shown are **demonstration decisions**, and all case data is synthetic
> and clearly labelled.

NeyamNetra is a two-portal web application:

- **Institution portal** — apply for Extension of Approval (EoA), intake increases,
  new programmes and other approval requests; upload documents with live
  readability checks; review, submit and track applications.
- **AICTE Officials portal** — a scrutiny/reviewer/administrator workspace to triage
  submitted applications, inspect documents and verification findings, record
  decisions, and review a complete audit trail.

Both portals share one backend and one workflow state machine, so an application
submitted by an institution appears in the official queue immediately, and official
actions flow back to the institution's tracking page in real time.

---

## Table of contents
- [Highlights](#highlights)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Quick start (local development)](#quick-start-local-development)
- [Production build & run](#production-build--run)
- [Docker](#docker)
- [Deployment](#deployment)
- [Environment variables](#environment-variables)
- [Demo credentials policy](#demo-credentials-policy)
- [Demonstration walkthrough](#demonstration-walkthrough)
- [Document quality checks](#document-quality-checks)
- [Verification modules & integrity policy](#verification-modules--integrity-policy)
- [Testing](#testing)
- [Project layout](#project-layout)
- [Known limitations](#known-limitations)

---

## Highlights

- **Complete cross-portal workflow** — submit → quality checks → scrutiny →
  (optional) clarification → final review → recorded decision, all driven by a real
  state machine and persisted workflow events.
- **Real document readability checks** — uploads are analysed server-side with
  OpenCV (variance-of-Laplacian over content tiles + the Crete–Roffet "blur effect")
  and PyMuPDF. Blurry, low-resolution, low-contrast or blank files are rejected with
  a clear reason; digitally-generated PDFs are not penalised for lacking a
  camera-sharpness score.
- **Verification modules** — GLIMPSE (text-layer field extraction), TRACE-X
  (measured integrity signals only) and an interactive EvidenceGraph that links
  Institution → Application → Document → Field → Rule → Reviewer finding.
- **Role-based access**, enforced on the backend (Scrutiny Member / Reviewer /
  Administrator), not just the UI.
- **Append-only audit trail** with search, filters, date range and CSV export.
- **Generated acknowledgement PDFs** built from stored application records.
- Responsive, accessible UI matching the provided design references; a discreet
  footer and "Simulated Analysis" labels keep demonstration data distinct from
  anything that could be mistaken for a government record.

## Architecture

```
Browser (React SPA)
   │  same-origin fetch(/api/...), HttpOnly session cookies
   ▼
Flask (gunicorn)  ──  serves /api/* JSON  AND  the built SPA (frontend/dist)
   │
   ▼
SQLAlchemy  ──►  PostgreSQL 17 (production)  /  SQLite (local dev fallback)
```

A single service serves both the API and the static front end from one origin, so
there is no cross-origin configuration to manage in production. In local
development the Vite dev server proxies `/api` to Flask.

## Tech stack

**Frontend:** React 18 + TypeScript, Vite, Tailwind CSS, React Router, TanStack
Query, Framer Motion, Recharts, Lucide icons.
**Backend:** Python 3, Flask, SQLAlchemy, OpenCV (headless), Pillow, PyMuPDF,
ReportLab, gunicorn. PostgreSQL 17 preferred; SQLite for local development.

## Quick start (local development)

Prerequisites: **Python 3.11+**, **Node.js 20+**.

```bash
git clone <this-repo> neyamnetra && cd neyamnetra
./scripts/dev.sh
```

`scripts/dev.sh` creates a virtualenv, installs backend and frontend dependencies,
starts Flask on `:5000` and Vite on `:5173`, and seeds the demo data automatically.

**Open http://localhost:5173** — this is the dev URL (Vite proxies `/api` to Flask).

To run the two sides manually instead:

```bash
# Terminal 1 — backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
cd backend && DEMO_MODE=true SECRET_KEY=dev-secret python wsgi.py     # http://localhost:5000
```

```bash
# Terminal 2 — frontend
cd frontend && npm install && npm run dev                              # http://localhost:5173
```

## Production build & run

```bash
./scripts/build.sh          # installs deps + builds frontend/dist
cd backend
gunicorn --bind 0.0.0.0:8000 --workers 2 --threads 4 --timeout 120 wsgi:app
```

With `AUTO_SEED=true` (the default) the schema is created and demo data loaded on
first start. **Open http://localhost:8000** — one origin serves both the SPA and the
API. To seed manually instead, set `AUTO_SEED=false` and run `./scripts/seed.sh`.

### Individual commands

| Purpose | Command |
| --- | --- |
| Initialise database schema | `cd backend && flask --app wsgi init-db` |
| Seed demo data (idempotent) | `cd backend && flask --app wsgi seed` |
| Reset demo scenario | `cd backend && flask --app wsgi reset-demo` |
| Production build (frontend) | `cd frontend && npm run build` |
| Start backend (prod) | `cd backend && gunicorn wsgi:app` |
| Backend tests | `cd backend && pytest -q` |

## Docker

A multi-stage `Dockerfile` builds the frontend and serves everything from Python:

```bash
docker build -t neyamnetra .
docker run -p 8000:8000 \
  -e SECRET_KEY=$(openssl rand -hex 32) \
  -e DEMO_MODE=true \
  -e DATABASE_URL=postgresql://user:pass@host:5432/neyamnetra \
  neyamnetra
# Open http://localhost:8000
```

Omit `DATABASE_URL` to use an in-container SQLite file (data is lost when the
container is removed — fine for a quick demo, not for shared/persistent use).

## Deployment

This repo is deployment-ready but **is not currently deployed** — no hosting
credentials are configured in this environment. To get a public URL for the SIH
submission, the fastest path is **Render** using the included blueprint:

1. Push this repository to GitHub.
2. On [Render](https://render.com) choose **New → Blueprint** and select the repo.
3. Render reads `render.yaml`, provisions a **PostgreSQL 17** database and a Docker
   web service, wires `DATABASE_URL`, and generates `SECRET_KEY`.
4. First boot auto-seeds the demo scenario. The service URL (e.g.
   `https://neyamnetra.onrender.com`) is your demo link; health check is
   `/api/health`.

Any host that can build a Dockerfile works the same way (Railway, Fly.io, a VM).
For buildpack-style hosts, a root `Procfile` is included; build the frontend
(`npm run build`) during the build phase so `frontend/dist` exists at runtime, and
set `FRONTEND_DIST` if it is not at the default `../frontend/dist`.

Set `COOKIE_SECURE=true` whenever the app is served over HTTPS.

## Environment variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable | Default | Notes |
| --- | --- | --- |
| `SECRET_KEY` | `dev-only-change-me` | **Set a long random value in production.** |
| `DATABASE_URL` | SQLite file | PostgreSQL 17 recommended; `postgres://` is normalised. |
| `DEMO_MODE` | `true` | `true` enables the non-empty-credentials demo login. |
| `AUTO_SEED` | `true` | Seed demo data on first start. |
| `COOKIE_SECURE` | `false` | Set `true` over HTTPS. |
| `CORS_ORIGINS` | *(empty)* | Only needed if API and SPA are on different origins. |
| `MAX_UPLOAD_MB` | `10` | Per-file upload limit. |
| `REPORTING_PERIOD_START` | `2026-07-01` | Official-dashboard reporting period start. |

## Demo credentials policy

For the SIH demonstration, when `DEMO_MODE=true` **any non-empty login ID and
password sign you in** — on the official portal the selected **role** determines
permissions. This is a deliberate demo convenience, and it is scoped and safe:

- The typed ID and password are checked for presence only; they are **never stored
  or logged**, and are discarded immediately after the request.
- A successful demo login issues a limited-scope, time-boxed demo session bound to a
  seeded account (the institution portal always maps to the demonstration
  institution, MAIT).
- Role permissions are enforced on the **backend**; you cannot escalate your role
  from the browser.
- When `DEMO_MODE=false`, arbitrary credentials are **rejected** — real
  authentication is not bundled with this prototype, so the production login simply
  refuses to authenticate until a real provider is wired in.

Suggested demo logins (any non-empty values work):

| Portal | Login ID | Password | Role |
| --- | --- | --- | --- |
| Institution | `1-4261798` | `demo` | — |
| Official | `AICTE-SM-01` | `demo` | Scrutiny Member |
| Official | `AICTE-RV-01` | `demo` | Reviewer |
| Official | `AICTE-AD-01` | `demo` | Administrator |

## Demonstration walkthrough

The full jury flow works without editing code or the database:

1. **Landing** → **Institution Login** (any non-empty credentials).
2. **Dashboard** for Maharaja Agrasen Institute of Technology (MAIT).
3. **New Application → Renewal / Extension of Approval (EoA)**.
4. Upload a **deliberately blurry image** → it is rejected with a quality warning.
5. **Replace** it with a clear copy → accepted; checklist reaches 83% (5 of 6).
6. **Review & Submit** → success page with a generated application ID and
   downloadable acknowledgement.
7. **Track Application** → live status timeline.
8. Sign out → **AICTE Officials Login** → **Scrutiny Member**.
9. **Dashboard** (status donut) → **Applications for Review** → open the new case.
10. Inspect **Documents** (real PDF/image viewer), **Verification Results**
    (GLIMPSE / TRACE-X), and the **EvidenceGraph**.
11. **Request Clarification** (with a deadline).
12. Back on the institution side, the clarification appears — upload evidence and
    respond.
13. A **Reviewer** forwards to final review and **records a demonstration approval**.
14. The institution sees the updated status; the **Audit Trail** shows the full
    sequence with the correct actors.

The seed also includes several fictional institutions with cases that are already
under review, approved, awaiting clarification, flagged for field verification, and
one carrying a **simulated intake discrepancy** (clearly labelled).

Administrators can reset the scenario from the backend
(`flask --app wsgi reset-demo`) at any time.

## Document quality checks

Image uploads (JPG/PNG) and image-only PDF pages are analysed for readability:

- **Sharpness** — variance of the Laplacian over content-bearing tiles **and** the
  no-reference Crete–Roffet blur effect; a file is failed only when both signals
  agree or one is far past threshold.
- **Resolution**, **contrast**, **brightness** and **blank-page** checks.
- Digitally-generated PDFs (with a text layer) are treated as born-digital and are
  **not** failed for lacking a camera-sharpness score.

Thresholds are configurable (see `QUALITY_*` in `.env.example`). These checks assess
**legibility, not authenticity** — a readable document is not thereby a genuine one.

## Verification modules & integrity policy

- **GLIMPSE** extracts fields from the **text layer** of digitally-generated PDFs
  using deterministic patterns. No OCR engine is bundled, so scanned images report
  "no text layer" rather than inventing values.
- **TRACE-X** reports **measured signals only**: quality metrics, PDF
  metadata/incremental-revision counts, EXIF editing-software tags, duplicate file
  hashes, and SHA-256 re-verification of stored bytes.
- **EvidenceGraph** cross-checks extracted fields against the institution profile,
  the published approval reference and the applicant's own form entries.

**Documents are never labelled "genuine", "forged", "government verified" or "AI
verified".** Seeded case studies carry a visible **"Simulated Analysis"** label.
File uploads trigger genuine validation and quality checks; the advanced engines use
disclosed demonstration fixtures where real analysis is not implemented.

## Testing

```bash
cd backend && pytest -q          # 32 backend tests: quality checks, auth/roles,
                                 # workflow, ownership, dashboard consistency,
                                 # end-to-end API flow, clarification cycle
```

An end-to-end browser walkthrough (Playwright) exercising all 24 critical UI checks
across both portals was run during development against the built app.

## Project layout

```
neyamnetra/
├── backend/
│   ├── app/
│   │   ├── __init__.py       # app factory, SPA serving, error handling, CLI
│   │   ├── models.py         # SQLAlchemy models
│   │   ├── catalog.py        # application types, document checklists, workflow
│   │   ├── quality.py        # OpenCV/PyMuPDF readability checks + upload validation
│   │   ├── analysis.py       # GLIMPSE / TRACE-X / EvidenceGraph rules
│   │   ├── validators.py     # server-side form validation
│   │   ├── auth.py           # demo sessions + role guards
│   │   ├── services.py       # serialisers, workflow events, audit, timeline
│   │   ├── ack.py            # acknowledgement PDF generation
│   │   ├── samples.py        # synthetic sample-document generators
│   │   ├── seed.py           # deterministic demo data + reset
│   │   └── routes/           # auth, institution, official blueprints
│   ├── tests/                # pytest suite
│   ├── requirements.txt
│   └── wsgi.py
├── frontend/
│   ├── src/
│   │   ├── pages/            # landing, logins, dashboards, wizard, case review…
│   │   ├── components/       # UI primitives, uploader, viewer, graph, panels
│   │   └── lib/              # API client, types, formatters, session hooks
│   └── (vite / tailwind / tsconfig)
├── scripts/                  # dev.sh, build.sh, seed.sh
├── Dockerfile · render.yaml · Procfile · .env.example
```

## Known limitations

- **No real OCR** — GLIMPSE reads PDF text layers only; scanned images are not
  transcribed.
- **No authenticity verification** — quality and integrity checks assess readability
  and measurable signals, not whether a document is genuine. TRACE-X never asserts
  forgery.
- **No external integrations** — there is no connection to AICTE, universities, or
  any government system. All approval decisions and most case records are
  demonstration data.
- **Demo authentication only** — production-grade authentication is not bundled;
  `DEMO_MODE=false` rejects arbitrary credentials rather than authenticating.
- The published MAIT EoA reference and institution profile were supplied by the team;
  verify them against the source before any external use.
