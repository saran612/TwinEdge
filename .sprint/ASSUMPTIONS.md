# Assumptions & Decisions Log

1. **Python Virtual Environment**: Backend tests and execution use `backend/venv/bin/python3` and `backend/venv/bin/pytest` with `PYTHONPATH=backend`.
2. **Reviewer ID Verification**: Prototype identity only, per prompt instructions ("prototype identity, not licence verification").
3. **K-cycle Gating Computation**: Predictions table stores `(engine_id, cycle, rul_pred)` uniquely. Window evaluated on-the-fly from the last K predictions where `cycle <= current_cycle`.
4. **Audit Chain Hash**: Row hash is `sha256(prev_hash + canonical_row_fields)` where canonical row fields are formatted deterministically (e.g., pipe-delimited or json string).
