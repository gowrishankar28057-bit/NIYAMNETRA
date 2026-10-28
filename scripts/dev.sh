#!/usr/bin/env bash
# Run backend (Flask :5000) and frontend (Vite :5173) together for local development.
# The Vite dev server proxies /api to the backend, so open http://localhost:5173
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

if [ ! -d .venv ]; then python3 -m venv .venv; fi
source .venv/bin/activate
pip install -q -r backend/requirements.txt

if [ ! -d frontend/node_modules ]; then (cd frontend && npm install); fi

trap 'kill 0' EXIT
( cd backend && DEMO_MODE=true SECRET_KEY=${SECRET_KEY:-dev-secret} PORT=5000 python wsgi.py ) &
( cd frontend && npm run dev ) &
wait
