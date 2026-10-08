# Model Audit and Wiring: Final Sprint Report

Date: 2026-10-08  
Branch: `model/audit-and-wiring`  
Status: ALL EXIT CRITERIA MET

---

## 1. Task Execution & Evidence Matrix

| ID | Task | Status | Primary Output / Evidence Location |
| :--- | :--- | :---: | :--- |
| **A0** | Wiring Discovery & Mapping | **VERIFIED** | [.sprint/model/wiring_map.md](file:///home/saran/projects/twinedge/.sprint/model/wiring_map.md) |
| **A1** | Central Paths, Registry & Fixtures | **VERIFIED** | [config/paths.py](file:///home/saran/projects/twinedge/config/paths.py), [models/registry.json](file:///home/saran/projects/twinedge/models/registry.json), [models/golden/golden_fixtures.json](file:///home/saran/projects/twinedge/models/golden/golden_fixtures.json) |
| **A2** | Wiring Consumers & Startup Canary | **VERIFIED** | [backend/app/main.py](file:///home/saran/projects/twinedge/backend/app/main.py) (Startup self-checks: hash match, shape, canary $1e-3$, fail-fast) |
| **A3** | Wiring Parity Verification | **VERIFIED** | [scripts/verify_wiring.py](file:///home/saran/projects/twinedge/scripts/verify_wiring.py), [.sprint/model/evidence/A3_verify_wiring.txt](file:///home/saran/projects/twinedge/.sprint/model/evidence/A3_verify_wiring.txt) |
| **B0** | Provenance & Environment | **VERIFIED** | [reports/model/MODEL_AUDIT.md](file:///home/saran/projects/twinedge/reports/model/MODEL_AUDIT.md#3-provenance-and-environment-b0) |
| **B1** | Headline Protocol (Capped vs Uncapped) | **VERIFIED** | [reports/model/MODEL_AUDIT.md](file:///home/saran/projects/twinedge/reports/model/MODEL_AUDIT.md#4-headline-reproduction--protocol-b1-b2) |
| **B2** | Metric Reproduction & NASA Score | **VERIFIED** | [reports/model/audit_metrics.json](file:///home/saran/projects/twinedge/reports/model/audit_metrics.json) |
| **B3** | Is It Really Trained? (Controls & Baselines)| **VERIFIED** | [reports/model/MODEL_AUDIT.md](file:///home/saran/projects/twinedge/reports/model/MODEL_AUDIT.md#5-is-it-really-trained-controls-baselines-leakage-b3) |
| **B4** | Bucket Accuracy & Bootstrap 95% CIs | **VERIFIED** | [reports/model/audit_metrics.json](file:///home/saran/projects/twinedge/reports/model/audit_metrics.json) |
| **B5** | Alert Precision/Recall & Lead Times | **VERIFIED** | [reports/model/audit_metrics.json](file:///home/saran/projects/twinedge/reports/model/audit_metrics.json) |
| **B6** | Numerical Precision, TFLite & OOD | **VERIFIED** | [reports/model/audit_metrics.json](file:///home/saran/projects/twinedge/reports/model/audit_metrics.json) |
| **B7** | Hardware Efficiency & Latency Gap | **VERIFIED** | [scripts/benchmark_model.py](file:///home/saran/projects/twinedge/scripts/benchmark_model.py), [reports/model/benchmark_results.json](file:///home/saran/projects/twinedge/reports/model/benchmark_results.json) |
| **B8** | Literature Context Comparison | **VERIFIED** | [reports/model/MODEL_AUDIT.md](file:///home/saran/projects/twinedge/reports/model/MODEL_AUDIT.md#9-literature-context-b8) |
| **B9** | Audit Visual Artifacts (8 figures) | **VERIFIED** | [reports/model/figures/](file:///home/saran/projects/twinedge/reports/model/figures/) |
| **B10**| MODEL_AUDIT.md & CLAIMS.md Updated | **VERIFIED** | [reports/model/MODEL_AUDIT.md](file:///home/saran/projects/twinedge/reports/model/MODEL_AUDIT.md), [CLAIMS.md](file:///home/saran/projects/twinedge/CLAIMS.md) |

---

## 2. Verdict

### Overall Audit Verdict: **WEAK**
- **Evidence**:
  1. The 1D-CNN is authentically trained: test RMSE of **16.1972** reproduces exactly against `results.json`; weight shuffling (70.25 RMSE) and noise substitution (85.37 RMSE) collapse predictive ability; predictions decrease monotonically across engine operational lifetimes (median Spearman $\rho = -0.9433$); top sensors (`s_13`, `s_14`, `s_2`, `s_7`, `s_21`) display strong physical permutation importance; no train/test unit leakage detected.
  2. However, the model is classified as **WEAK** because standard non-deep learning algorithms trained on the identical split achieve equal or superior accuracy on the C-MAPSS FD001 test benchmark:
     - **Ridge Regression**: RMSE = **15.8930** (MAE = 12.8927, NASA = 406.21)
     - **HistGradientBoostingRegressor**: RMSE = **14.2740** (MAE = 10.8919, NASA = 338.40)
  3. Paired bootstrap resampling confirms HistGBM is statistically superior to the shipped 1D-CNN ($\Delta \text{RMSE}$ 95% CI: `[+0.540, +3.210]`).

---

## 3. Quotable Numbers Summary

| Metric | Value | Protocol / Conditions |
| :--- | :--- | :--- |
| **Official Test RMSE (Capped)** | **16.1972** | Test FD001 last window, true RUL $\le 125$ |
| **Official Test RMSE (Uncapped)** | **17.3354** | Test FD001 last window, raw true RUL |
| **Test MAE** | **12.4734** | Test FD001 last window, true RUL $\le 125$ |
| **Test $R^2$** | **0.8366** | Test FD001 last window |
| **NASA Score** | **452.13** | Asymmetric penalty ($d = \text{pred} - \text{true}$) |
| **Degradation Monotonicity** | **-0.9433** (Median) | Spearman rank correlation on full lifetime run-to-failure engines |
| **Permutation Top Sensor** | **`s_13` (+24.71 $\Delta\text{RMSE}$)** | Core speed sensor |
| **Alert Detection Rate** | **100% (20/20 engines)** | $T=60, K=3$ gating on held-out validation engines |
| **Mean Lead Time Before Failure** | **54.0 cycles** | $T=60, K=3$ gating on held-out validation engines |
| **Isolated ONNX Latency (Batch 1)**| **0.042 ms (p50)** | Direct ONNX CPU runtime (Host 8-core CPU) |
| **Isolated ONNX Latency (1 Thread)**| **0.027 ms (p50)** | 1 thread CPU pinned ("edge-like") |
| **Isolated TFLite Latency (Batch 1)**| **0.012 ms (p50)** | Quantized edge TFLite |
| **End-to-End HTTP `/predict`** | **8.444 ms (p50)** | Full round-trip: JSON parsing, scaling, ONNX, and SQLite write |
| **Model Complexity** | **16,805 parameters** | 378,560 MACs / 757,120 FLOPs |

---

## 4. Unverified & Blocked Items

### Unverified Items:
- **Historical Literature FD001 Baselines**: Published MLP (~17.5) and LSTM (~14.5) scores from academic literature (Babu et al., Zheng et al.) are marked **UNVERIFIED** as the external publications were not crawled or re-evaluated in this offline workspace.

### Blocked Items:
- **None**: All tasks A0 through A3 and B0 through B10 were successfully completed with verifiable artifacts and non-zero exit validation scripts.

---

## 5. Protected Files Check
- `git diff sprint/frontend -- backend/model/ scaler.joblib backend/data/` shows **zero modifications** to shipped model weights, scalers, or raw/processed datasets.
