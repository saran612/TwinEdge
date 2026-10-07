# Baseline Evaluation Report (Pre-hardening)

Recorded on: 2026-10-07T11:32:00+05:30
Branch: sprint/hardening

## 1. Pytest Suite
Command:
```bash
PYTHONPATH=backend backend/venv/bin/pytest backend/
```
Output:
```text
============================= test session starts ==============================
platform linux -- Python 3.11.16, pytest-9.1.1, pluggy-1.6.0
rootdir: /home/saran/projects/twinedge
plugins: anyio-4.15.1
collected 3 items                                                              

backend/app/test_main.py ...                                             [100%]

======================== 3 passed, 6 warnings in 9.96s =========================
```
Result: PASS (3/3 passed).

## 2. Frontend Build
Command:
```bash
npm run build # inside frontend/
```
Output:
```text
> twin-edge@0.1.0 build
> vite build

vite v8.1.3 building client environment for production...
✓ 2341 modules transformed.
dist/index.html                     0.45 kB │ gzip:   0.29 kB
dist/assets/index-BYbzXiuy.css     38.49 kB │ gzip:   7.12 kB
dist/assets/index-C_w6C_6a.js   1,240.58 kB │ gzip: 336.52 kB
✓ built in 34.13s
```
Result: PASS.

## 3. Backend Startup & Initialization
Command:
```bash
PYTHONPATH=backend backend/venv/bin/python3 -c "import app.main; from app.db import init_db; init_db(); print('Backend imports and init_db ok')"
```
Output:
```text
Database initialized at /home/saran/projects/twinedge/backend/app/db.sqlite3
Backend imports and init_db ok
```
Result: PASS.
