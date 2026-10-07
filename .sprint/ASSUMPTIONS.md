# Assumptions & Decisions Log

1. **Python Virtual Environment**: Backend tests and execution use `backend/venv/bin/python3` and `backend/venv/bin/pytest` with `PYTHONPATH=backend`.
2. **Reviewer ID Verification**: Prototype identity only, per prompt instructions ("prototype identity, not licence verification").
3. **K-cycle Gating Computation**: Predictions table stores `(engine_id, cycle, rul_pred)` uniquely. Window evaluated on-the-fly from the last K predictions where `cycle <= current_cycle`.
4. **Audit Chain Hash**: Row hash is `sha256(prev_hash + canonical_row_fields)` where canonical row fields are formatted deterministically (e.g., pipe-delimited or json string).
5. **Preprocessing Parity Arithmetic**: Standard JavaScript 64-bit IEEE floats yielded minor floating-point divergence (~1e-3). Solved using `Math.fround()` float32 precision matching Python/NumPy float32 exactly, achieving `0.0000e+0` difference across all 220 verification windows.
6. **WebGL Headless Fallback**: Headless jsdom environments lack WebGL context support. Handled gracefully in `EngineViewport3D` with a 2D dummy canvas fallback so headless Vitest unit tests pass while maintaining full WebGL PBR rendering in real browser engines.
7. **Zero-CDN Offline Operation**: ONNX Runtime Web WASM binaries (`ort-wasm-simd-threaded.jsep.wasm`) are bundled and served directly from `frontend/public/wasm/`, eliminating external network or CDN dependencies.
8. **Counterfactual Attribution Interpretation (H2 Compliance)**: Per Rule H2, the underlying C-MAPSS FD001 model predicts engine-level RUL only. Per-component attribution percentages in the Digital Twin view represent relative model sensitivity to sensor deviations, not independent component-level RUL.

