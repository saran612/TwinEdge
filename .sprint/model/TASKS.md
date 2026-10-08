# Sprint Model Tasks: Part A (Wiring) & Part B (Audit)

| ID | Task | Status | Verification Check | Evidence |
| :--- | :--- | :---: | :--- | :--- |
| **A0** | Discovery wiring map | **VERIFIED** | Grep all model/scaler references across backend, frontend, scripts, compose | `.sprint/model/wiring_map.md` |
| **A1** | Root structure, registry & fixtures | **VERIFIED** | `models/registry.json`, `models/golden/`, `config/paths.py`, `Makefile` | `models/registry.json`, `models/golden/golden_fixtures.json` |
| **A2** | Wire consumers & startup self-checks | **VERIFIED** | Startup canary check + deliberate corruption fail-fast test | Commit `eb69081`, test logs |
| **A3** | verify_wiring.py & parity | **VERIFIED** | 4-stage check: hashes, preprocessing, ONNX vs HTTP predict, canary | `.sprint/model/evidence/A3_verify_wiring.txt` |
| **B0** | Provenance & environment | **VERIFIED** | CPU specs, package versions, git lineage, artifact hashes | `reports/model/MODEL_AUDIT.md`, `audit_metrics.json` |
| **B1** | Headline test metric protocol | **VERIFIED** | Recomputed under capped (16.1972) vs uncapped (17.3354) conventions | `reports/model/MODEL_AUDIT.md` |
| **B2** | Headline test metrics & NASA score | **VERIFIED** | RMSE 16.1972, MAE 12.4734, $R^2$ 0.8366, NASA 452.13, Bias +1.2569 | `reports/model/audit_metrics.json` |
| **B3** | Is it really trained? | **VERIFIED** | Controls: Shuffled (70.25) & Noise (85.37); Spearman -0.943; Baselines: Ridge (15.89), HistGBM (14.27); Verdict: WEAK | `reports/model/MODEL_AUDIT.md` |
| **B4** | Accuracy detail & bootstrap CIs | **VERIFIED** | 5 RUL buckets, residual stats, 1000-resample bootstrap CIs | `reports/model/audit_metrics.json` |
| **B5** | Alert precision/recall & K-gating | **VERIFIED** | Sweep $T \in \{30..80\}$; $K=3$ gating on 20 held-out engines: 100% alerted, mean lead 54.0 cycles | `reports/model/audit_metrics.json` |
| **B6** | Numerical precision & robustness | **VERIFIED** | ONNX vs TFLite parity (max diff 1.116, RMSE diff 0.347), OOD robustness (zeros, $\pm 6\sigma$), noise sweep | `reports/model/audit_metrics.json` |
| **B7** | Efficiency benchmarks & latency gap | **VERIFIED** | ONNX p50: 0.042 ms, 1-thread p50: 0.027 ms, TFLite p50: 0.012 ms; E2E HTTP p50: 8.444 ms | `reports/model/benchmark_results.json` |
| **B8** | Literature context table | **VERIFIED** | Contextual table with unverified literature indicators | `reports/model/MODEL_AUDIT.md` |
| **B9** | Audit visual figures (8 plots) | **VERIFIED** | Generated 8 PNG figures in `reports/model/figures/` | `reports/model/figures/*.png` |
| **B10**| MODEL_AUDIT.md & CLAIMS.md update | **VERIFIED** | Comprehensive report, quotable numbers table, and updated claims matrix | `reports/model/MODEL_AUDIT.md`, `CLAIMS.md` |
