# ---- Stage 1: build the frontend ----
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
# --include=dev forces build tooling (vite, tsc) even if the host sets NODE_ENV=production,
# which would otherwise skip devDependencies and break `npm run build`.
RUN npm install --include=dev --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Python runtime serving API + built SPA ----
FROM python:3.13-slim AS runtime
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
# OpenCV (headless) and PyMuPDF need a few shared libraries.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install -r backend/requirements.txt
COPY backend/ ./backend/
COPY --from=frontend /app/frontend/dist ./frontend/dist
WORKDIR /app/backend
ENV FRONTEND_DIST=/app/frontend/dist
EXPOSE 8000
# gunicorn serves both the JSON API and the built single-page app from one origin.
# One worker with threads keeps memory within small free-tier instances (OpenCV + PyMuPDF
# loaded once); threads carry the concurrency. $PORT is injected by the host at runtime.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8000} --workers 1 --threads 8 --timeout 120 wsgi:app"]
