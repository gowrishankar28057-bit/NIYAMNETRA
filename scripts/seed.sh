#!/usr/bin/env bash
# Initialise the database schema and load the deterministic demo scenario.
set -euo pipefail
cd "$(dirname "$0")/../backend"
source ../.venv/bin/activate
python -m flask --app wsgi seed
