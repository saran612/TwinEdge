.PHONY: setup run-backend run-frontend test wiring audit benchmark all clean

PYTHON := $(shell if [ -f .venv-audit/bin/python ]; then echo .venv-audit/bin/python; elif [ -f backend/venv/bin/python ]; then echo backend/venv/bin/python; else echo python3; fi)

setup:
	@echo "Setting up Python audit environment..."
	@if [ ! -d .venv-audit ]; then \
		python3 -m venv .venv-audit && \
		.venv-audit/bin/pip install --upgrade pip && \
		.venv-audit/bin/pip install -r backend/requirements.txt matplotlib pytest; \
	fi
	@echo "Setup completed."

run-backend:
	@echo "Starting backend..."
	cd backend && ../$(PYTHON) -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

run-frontend:
	@echo "Starting frontend dev server..."
	cd frontend && npm run dev

test:
	@echo "Running tests..."
	PYTHONPATH=backend:. $(PYTHON) -m pytest -v backend/app/test_main.py

wiring:
	@echo "Verifying wiring and model parity..."
	PYTHONPATH=backend:. $(PYTHON) scripts/verify_wiring.py

audit:
	@echo "Running full model audit..."
	PYTHONPATH=backend:. $(PYTHON) scripts/audit_model.py

benchmark:
	@echo "Running model efficiency benchmark..."
	PYTHONPATH=backend:. $(PYTHON) scripts/benchmark_model.py

all: wiring test audit benchmark
	@echo "All model checks, wiring tests, and audit benchmarks succeeded."

fleet:
	@echo "Starting 3-node online fleet (5 Hz)..."
	PYTHONPATH=backend:. $(PYTHON) -m edge_sim run --nodes 3 --engines VAL-001,VAL-005,TEST-002 --rate 5 --inference auto --uplink http --cloud-url http://localhost:8000 --base-port 8100

fleet-offline:
	@echo "Starting standalone offline edge node..."
	PYTHONPATH=backend:. $(PYTHON) -m edge_sim run --nodes 1 --engines VAL-001 --rate 2 --inference edge --uplink http --cloud-url "" --base-port 8100

chaos:
	@echo "Running automated chaos resilience harness..."
	PYTHONPATH=backend:. $(PYTHON) scripts/chaos.py

clean:
	rm -rf .tmp_audit reports/model/raw data/edge

# PostgreSQL Tasks
pg-up:
	docker compose --profile pg up -d postgres

pg-down:
	docker compose --profile pg down postgres

pg-psql:
	PGPASSWORD=twinedge_app_secret docker exec -it twinedge_postgres psql -U twinedge_app -d twinedge

pg-migrate:
	PYTHONPATH=backend:. $(PYTHON) scripts/migrate.py

pg-backup:
	@mkdir -p backups
	@OUT="backups/twinedge_pg_$$(date +%Y%m%d_%H%M%S).dump"; \
	PGPASSWORD=postgres_master_secret docker exec -e PGPASSWORD=postgres_master_secret twinedge_postgres pg_dump -U postgres -d twinedge -Fc > "$$OUT"; \
	echo "Backup created at $$OUT"

pg-restore-test:
	PYTHONPATH=backend:. $(PYTHON) scripts/pg_restore_test.py

demo:
	./run_infra.sh

demo-pg:
	LOG_SINK=postgres LOG_READ_STORE=postgres ./run_infra.sh

verify-demo:
	@echo "Checking TwinEdge services..."
	@curl -sf http://localhost:8000/health >/dev/null && echo "Backend: GO" || echo "Backend: NO-GO"
	@curl -sf http://localhost:5173 >/dev/null && echo "Frontend: GO" || echo "Frontend: NO-GO"


