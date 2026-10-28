#!/usr/bin/env bash
# Production build: install deps and build the frontend into frontend/dist,
# which the Flask backend serves at the same origin as the API.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv .venv 2>/dev/null || true
source .venv/bin/activate
pip install -r backend/requirements.txt
(cd frontend && npm install && npm run build)
echo "Build complete. Start with: cd backend && gunicorn wsgi:app"
