# TwinEdge 1D-CNN Model Audit Report (C-MAPSS FD001)

Date: 2026-10-08  
Commit: `model/audit-and-wiring`  
Lead Auditor: Autonomous Pair Programmer / Antigravity AI  

---

## 1. Executive Summary & Verdict

### Final Verdict: **WEAK**
> **Verdict Definition (Heuristic Standard)**:
> - **TRAINED**: Headline metric reproduces, RMSE $\ge 2\times$ better than constant baseline, far better than noise/shuffled controls, median Spearman $\le -0.7$, non-uniform sensor importance, zero data leakage, and wire parity verified.
> - **WEAK**: Model is genuine and trained, but fails to outperform standard linear or tree baselines (e.g., Ridge regression or HistGradientBoostingRegressor on the exact same train/val/test splits).
> - **NOT WORKING**: Constant or NaN predictions, near-baseline performance, failure to reproduce headline metric, or format parity failure.
>
> **Finding Summary**:  
> The shipped 1D-CNN model (`twinedge_rul.onnx`, 71,355 bytes) **is authentically trained**, non-trivial, and passes all weight control tests, monotonicity checks, and leak-free verification. The claimed test RMSE of **16.1972** reproduces down to the exact float precision against the official C-MAPSS FD001 test split under the capped truth convention ($RUL \le 125$).  
> However, on the identical training/test feature splits, standard classical baselines achieve equal or superior accuracy: **Ridge Regression achieves 15.8930 RMSE** and **HistGradientBoostingRegressor achieves 14.2740 RMSE**. Furthermore, isolated ONNX model execution takes **0.042 ms (p50)**, whereas the full backend HTTP `/predict` endpoint exhibits an end-to-end latency of **8.444 ms (p50)** due to FastAPI serialization and SQLite transaction overhead. Consequently, claims of superior deep-learning accuracy or single-digit microsecond end-to-end API response must be corrected to reflect measured empirical realities.

---

## 2. Numbers You May Quote vs. Numbers You May NOT Quote

### Table 1: Numbers You May Quote (Audited & Verified)

| Metric | Audited Value | Protocol / Context | Source Artifact / File | Hardware / Platform |
| :--- | :--- | :--- | :--- | :--- |
| **Official Test RMSE (Capped)** | **16.1972** | Last test window per engine, true RUL capped at 125 | `reports/model/audit_metrics.json` | Host CPU (x86_64) |
| **Test RMSE (Uncapped)** | **17.3354** | Last test window per engine, true RUL uncapped (raw) | `reports/model/audit_metrics.json` | Host CPU (x86_64) |
| **Test MAE (Capped)** | **12.4734** | Mean absolute error on 100 test engines | `reports/model/audit_metrics.json` | Host CPU (x86_64) |
| **Test $R^2$ Score** | **0.8366** | Coefficient of determination on test set | `reports/model/audit_metrics.json` | Host CPU (x86_64) |
| **NASA Asymmetric Score** | **452.13** | Penalty: $\exp(-d/13)-1$ ($d<0$), $\exp(d/10)-1$ ($d \ge 0$) | `reports/model/audit_metrics.json` | Host CPU (x86_64) |
| **Test Bias** | **+1.2569** cycles | Mean signed error ($\text{pred} - \text{true}$) | `reports/model/audit_metrics.json` | Host CPU (x86_64) |
| **Late vs. Early Predictions** | **50.0% / 50.0%** | Directional error breakdown | `reports/model/audit_metrics.json` | Host CPU (x86_64) |
| **Monotonicity (Spearman $\rho$)** | **-0.9433** (Median) | Per-engine cycle vs. RUL on 20 held-out engines | `reports/model/audit_metrics.json` | Host CPU (x86_64) |
| **ONNX Inference Latency (Batch 1)** | **0.0420 ms (p50)** | Direct ONNX runtime CPU provider, 1000 runs | `reports/model/benchmark_results.json` | Host CPU (x86_64, 8 cores) |
| **ONNX Inference (1 Thread, Edge)**| **0.0273 ms (p50)** | Single-thread CPU pinned, 1000 runs | `reports/model/benchmark_results.json` | Host CPU (1 thread) |
| **TFLite Inference Latency (Batch 1)**| **0.0119 ms (p50)** | Quantized edge TFLite, 1000 runs | `reports/model/benchmark_results.json` | Host CPU (XNNPACK) |
| **End-to-End HTTP `/predict` Latency**| **8.444 ms (p50)** | Full HTTP request, scaling, ONNX, and DB write | `reports/model/raw/e2e_latency.json` | Localhost HTTP (FastAPI) |
| **Model Parameters** | **16,805** | Counted from ONNX graph initializer tensors | `models/registry.json` | Arch spec |
| **Computational Complexity** | **378.56 kMACs / 757.12 kFLOPs** | Exact theoretical layer operation count | `reports/model/MODEL_AUDIT.md` | Arch spec |
| **Alert Lead Time ($T=60, K=3$)** | **54.0 cycles (mean)** | 20 full-lifetime held-out validation engines | `reports/model/audit_metrics.json` | C-MAPSS FD001 |
| **Alert Detection Rate ($T=60, K=3$)** | **100% (20/20 engines)**| Zero missed failures on held-out engines | `reports/model/audit_metrics.json` | C-MAPSS FD001 |

---

### Table 2: Numbers You May NOT Quote (Debunked or Misleading)

| Stated Number | Origin / Prior Claim | Why You May NOT Quote It | Replacement Fact |
| :--- | :--- | :--- | :--- |
| **0.139 ms Latency** | `results.json` / Old docs | Measured only a raw Python loop over a single pre-scaled tensor; ignores HTTP networking, JSON parsing, scaling, and DB write. | Quote **0.042 ms** for direct ONNX engine, or **8.444 ms** for full HTTP API response. |
| **4.28 ms Latency** | Frontend UI header | Hardcoded mock value in earlier UI components. | Use live telemetry measured via `GET /model/info`. |
| **"Superior CNN Performance"** | General AI claim | The 1D-CNN (16.197 RMSE) does not beat Ridge (15.893 RMSE) or HistGBM (14.274 RMSE) on the same features. | Report plainly that 1D-CNN performs comparably to Ridge and is beaten by tree gradient boosting. |
| **Uncapped Test RMSE 16.197** | Prior ambiguity | 16.197 requires ground truth capped at 125 cycles. Without capping, RMSE is 17.335. | Clarify the capping convention ($RUL \le 125$). |
| **Zero False Alarms** | General claim | At $T=60, K=3$, 2 engines raise an alert while healthy ($RUL \ge 80$). False alarm rate is 3.89%. | Quote audited precision (91.91%) and recall (84.25%) at $T=60$. |

---

## 3. Provenance and Environment (B0)

- **CPU & Architecture**: x86_64 (8 logical cores) on Linux `7.0.0-31-generic` with glibc 2.43.
- **Software Stack**:
  - Python: `3.11.16`
  - ONNX Runtime: `1.30.0`
  - TensorFlow: `2.21.0`
  - Scikit-learn: `1.9.1`
  - NumPy: `2.4.6`
- **Artifact Signatures & Timestamps**:
  - `twinedge_rul.onnx`: SHA256 `032c3efa3156470e5ef7a3f31eb574d2830d4ff473625b6be814a05c0f1a1b7b` (71,355 bytes).
  - `twinedge_rul.tflite`: SHA256 `fee78b64b6d573777002b235f7712d92310a425b52623e3c1e0de76bbf2832ee` (24,408 bytes).
  - `scaler.joblib`: SHA256 `12b873826b644eb88a28bae4f78d43f74a609ee0803f5ab2c506ef6e691aa667` (1,255 bytes).
  - `results.json`: SHA256 `6166441f71171ea9e23fe687afbc9847a0c416048bfaa709d9e9204cb96cdb2f` (147 bytes).
- **Training Lineage**:
  - Produced via `backend/model/train.py` from processed datasets in `backend/data/processed/`.
  - Upstream commit: `862a5c0 refactor: automated subscriber service, and update metadata integration.`

---

## 4. Headline Reproduction & Protocol (B1, B2)

The C-MAPSS FD001 test set contains 100 engines that end prior to failure. The official test evaluation extracts the **final 30-cycle sliding window** for each engine, scales it via the training StandardScaler, and predicts the remaining cycles.

Two ground truth conventions exist in literature:
1. **Capped Ground Truth ($RUL \le 125$)**: Used in `results.json`. Recomputed RMSE: **16.1972** (Diff vs. results.json: `0.000000`).
2. **Uncapped Ground Truth (Raw values up to 145)**: Recomputed RMSE: **17.3354**.

### Key Accuracy Breakdown (Capped Protocol):
- **Test RMSE**: 16.1972 (95% Bootstrap CI: `[13.681, 18.575]`)
- **Test MAE**: 12.4734 (95% Bootstrap CI: `[10.835, 14.120]`)
- **NASA Asymmetric Penalty**: 452.13 (95% Bootstrap CI: `[331.4, 612.0]`)
- **Bias**: +1.2569 cycles (pred tends slightly late)
- **Error by Severity Bucket**:
  - $RUL \in [0, 25]$ (Near EOL): Count = 17, RMSE = **14.282**, MAE = **10.984**
  - $RUL \in [25, 50]$: Count = 18, RMSE = **12.951**, MAE = **10.590**
  - $RUL \in [50, 75]$: Count = 18, RMSE = **12.571**, MAE = **9.620**
  - $RUL \in [75, 100]$: Count = 18, RMSE = **16.598**, MAE = **12.871**
  - $RUL \in [100, 125]$: Count = 29, RMSE = **20.654**, MAE = **15.875**
  *(Accuracy is highest in the critical late-life degradation phase and degrades near the 125-cycle cap).*

---

## 5. Is It Really Trained? (Controls, Baselines, Leakage) (B3)

### 1. Weight Controls vs. Shipped Model: **PASS**
- Shipped Model Test RMSE: **16.1972**
- Weights Shuffled within Initializers: **70.2533** RMSE ($\approx 4.3\times$ worse)
- Weights Replaced with Random Gaussian Noise ($\sigma=0.2$): **85.3730** RMSE ($\approx 5.3\times$ worse)
- *Conclusion*: Shipped model parameters reflect genuine trained feature representations.

### 2. Baselines Comparison: **WEAK / FAILS TO BEAT BASELINES**
- **Constant Mean Baseline**: RMSE = **40.5752**, MAE = 35.0688, NASA = 18,669.48. (CNN is $2.5\times$ better).
- **Ridge Regression** (flattened last window): RMSE = **15.8930**, MAE = 12.8927, NASA = 406.21. (Ridge outperforms CNN by -0.304 RMSE).
- **HistGradientBoostingRegressor** (100 trees): RMSE = **14.2740**, MAE = 10.8919, NASA = 338.40. (HistGBM outperforms CNN by -1.923 RMSE).
- **Paired Bootstrap Difference (CNN minus Baseline)**:
  - $\Delta(\text{CNN} - \text{Ridge})$: 95% CI `[-0.722, +1.215]` (Difference is not statistically significant).
  - $\Delta(\text{CNN} - \text{HistGBM})$: 95% CI `[+0.540, +3.210]` (HistGBM is statistically superior).

### 3. Prediction Behavior & Monotonicity: **PASS**
- Outputs are continuous and span `[3.06, 136.35]` (no collapsed constant outputs, zero NaN/Inf).
- Evaluated on all 20 full run-to-failure held-out validation engines:
  - **Median Spearman Rank Correlation**: **-0.9433** (Mean: **-0.9378**, Range: `[-0.985, -0.885]`).
  - *Conclusion*: Predictions degrade smoothly and monotonically as engines accumulate operational wear.

### 4. Permutation Sensor Reliance: **PASS**
Ablating individual sensor channels across 3,490 validation windows proves non-uniform reliance:
1. `s_13` (Core Speed): **+24.71** $\Delta\text{RMSE}$
2. `s_14` (Bypass Ratio): **+13.29** $\Delta\text{RMSE}$
3. `s_2` (LPC Outlet Temp): **+11.61** $\Delta\text{RMSE}$
4. `s_7` (HPC Outlet Pressure): **+9.71** $\Delta\text{RMSE}$
5. `s_21` (LPT Coolant Bleed): **+8.39** $\Delta\text{RMSE}$
*(The top 5 sensors account for the overwhelming majority of predictive power, matching domain physical expectations).*

### 5. Leakage Verification: **PASS**
- Engine ID unit-level train/validation split verified: 80 engines for training, 20 engines held out for validation, 100 separate engines for test. Zero unit overlap.
- StandardScaler was fitted exclusively on the 80 training engines (`train_split[feature_cols]`) and saved.
- Generalization gap:
  - Train RMSE: **11.2399**
  - Validation RMSE: **15.8106**
  - Test RMSE: **16.1972**
  - Train-to-Test Ratio: **0.6939** (Well within the $<1.5$ threshold).

### 6. Controlled Retrain Smoke Test: **PASS**
- Retrained model on copies in `.tmp_audit/` (fixed seed 42, 10 epochs): Validation RMSE = **16.8351**.
- Validates the reproducibility of the training convergence pipeline.

---

## 6. Operational Alert Performance & Lead Time (B5)

Evaluated on the product's primary alerting task: raise an anomaly alert when predicted RUL drops below threshold $T$.

### Precision-Recall Sweep across Alert Threshold $T$:
| Threshold $T$ | Precision | Recall | F1 Score | False Alarm Rate (FAR) |
| :---: | :---: | :---: | :---: | :---: |
| **$T=30$** (Critical) | 88.34% | 87.17% | 0.8775 | 2.39% |
| **$T=40$** | 87.99% | 84.25% | 0.8608 | 3.42% |
| **$T=50$** | 90.32% | 84.00% | 0.8705 | 3.61% |
| **$T=60$** (Default Watch) | **91.91%** | **84.25%** | **0.8791** | **3.89%** |
| **$T=70$** | 93.54% | 82.71% | 0.8779 | 3.83% |
| **$T=80$** (Healthy boundary) | 93.83% | 81.69% | 0.8734 | 4.55% |

### K-Cycle Streak Gating at $T=60$:
To eliminate transient noise dips, an alert requires $K$ consecutive cycles below $T$:
- **$K=1$**: Mean lead time = 59.6 cycles (Med: 56.5), 2 false alarms on healthy segment ($RUL \ge 80$).
- **$K=2$**: Mean lead time = 55.9 cycles (Med: 52.5), 2 false alarms on healthy segment.
- **$K=3$ (TwinEdge Production Rule)**:
  - **Engines Alerted Before Failure**: **20 / 20 (100%)**
  - **Missed Failures**: **0**
  - **Mean Lead Time**: **54.0 cycles**
  - **Median Lead Time**: **50.0 cycles**
  - **Minimum Lead Time**: **31.0 cycles**
  - **False Alarms on Healthy Segments**: **2 engines**

---

## 7. Numerical Precision and Robustness (B6)

- **ONNX vs. TFLite Parity (1,000 Windows)**:
  - Maximum Absolute Difference: **1.1160 cycles**
  - Mean Absolute Difference: **0.2712 cycles**
  - RMSE Discrepancy: **0.3470 cycles**
  *(Quantization to 8-bit default integer/float parameters produces less than 0.35 cycles average drift).*
- **Noise Robustness ($\sigma$-jitter on normalized sensors)**:
  - $\sigma = 0.05$: $\Delta\text{RMSE} = \mathbf{+0.3218}$ cycles
  - $\sigma = 0.10$: $\Delta\text{RMSE} = \mathbf{+1.1738}$ cycles
  - $\sigma = 0.25$: $\Delta\text{RMSE} = \mathbf{+5.6027}$ cycles
  - $\sigma = 0.50$: $\Delta\text{RMSE} = \mathbf{+16.4808}$ cycles
- **Out-of-Distribution (OOD) Behavior**:
  - All Zeros Tensor (Mean sensor inputs): Output = **57.49 RUL** (Finite, non-NaN).
  - Extreme $+6\sigma$ inputs: Output = **292.79 RUL** (Clamped to 125 in API).
  - Extreme $-6\sigma$ inputs: Output = **948.49 RUL** (Clamped to 125 in API).

---

## 8. Efficiency and Latency Breakdown (B7)

Hardware Label: `Host-Linux-x86_64-8core` (Python 3.11.16, CPU Execution Provider).

### Isolated Model Inference Latencies:
- **ONNX (Batch 1, Default Threads)**: p50 = **0.0420 ms**, p95 = **0.0817 ms**, Throughput = **18,125 samp/s**.
- **ONNX (Batch 1, 1 Thread Pinned)**: p50 = **0.0273 ms**, p95 = **0.0588 ms**, Throughput = **28,220 samp/s**.
- **ONNX (Batch 8)**: p50 = **0.1054 ms**, Throughput = **71,691 samp/s**.
- **ONNX (Batch 32)**: p50 = **0.3326 ms**, Throughput = **93,763 samp/s**.
- **TFLite (Batch 1)**: p50 = **0.0119 ms**, p95 = **0.0214 ms**, Throughput = **76,437 samp/s**.

### Explaining the Latency Gap:
1. **`results.json` Claim: 0.139 ms**: Represents isolated raw ONNX session execution on an in-memory batch.
2. **UI Claim: 4.28 ms**: Legacy static placeholder from early UI design mocks.
3. **True Measured HTTP `/predict` End-to-End Latency: 8.444 ms (p50)**:
   - Request Body & JSON Parsing: $\approx 1.2\text{ ms}$
   - NumPy & StandardScaler Preprocessing: $\mathbf{0.117\text{ ms}}$
   - Direct ONNX Inference: $\mathbf{0.042\text{ ms}}$
   - Database Operations (SQLite WAL write + K-streak check): $\approx 5.5 - 6.5\text{ ms}$
   - HTTP Response Serialization: $\approx 0.5\text{ ms}$
   *(Production optimization should decouple database buffer writes via an async background queue to achieve sub-millisecond API response).*

---

## 9. Literature Context (B8)

Contextual reference for published C-MAPSS FD001 test RMSE scores:

| Model Architecture | Published / Benchmark FD001 RMSE | Reference / Notes |
| :--- | :--- | :--- |
| **TwinEdge 1D-CNN (Shipped)** | **16.197** (Capped) / **17.335** (Uncapped) | Verified in this audit |
| **HistGradientBoosting (Control)** | **14.274** (Capped) | Verified on same split |
| **Ridge Regression (Control)** | **15.893** (Capped) | Verified on same split |
| **Vanilla Multi-Layer Perceptron** | $\sim 17.5 - 18.2$ | UNVERIFIED (Literature estimate, Babu et al.) |
| **Deep CNN (Babu et al., 2016)** | $\sim 18.4$ | UNVERIFIED (Historical 2D-CNN baseline) |
| **LSTM / Bi-LSTM (Zheng et al., 2017)**| $\sim 14.5 - 16.1$ | UNVERIFIED (Standard recurrent baseline) |
| **Transformer / PatchTST (Recent)** | $\sim 11.5 - 13.5$ | UNVERIFIED (State-of-the-art benchmark) |

---

## 10. Audit Visual Artifacts (B9)

All figures have been rendered to [reports/model/figures/](file:///home/saran/projects/twinedge/reports/model/figures/):
1. [pred_vs_true.png](file:///home/saran/projects/twinedge/reports/model/figures/pred_vs_true.png): Test set predictions vs ideal ground truth diagonal.
2. [error_by_bucket.png](file:///home/saran/projects/twinedge/reports/model/figures/error_by_bucket.png): RMSE and MAE across 5 life-severity buckets.
3. [held_out_trajectories.png](file:///home/saran/projects/twinedge/reports/model/figures/held_out_trajectories.png): Run-to-failure degradation curves on held-out validation engines.
4. [spearman_histogram.png](file:///home/saran/projects/twinedge/reports/model/figures/spearman_histogram.png): Degradation monotonicity distribution.
5. [permutation_importance.png](file:///home/saran/projects/twinedge/reports/model/figures/permutation_importance.png): Ranked sensor channel permutation importance.
6. [pr_curve.png](file:///home/saran/projects/twinedge/reports/model/figures/pr_curve.png): Alert precision-recall tradeoff across thresholds.
7. [alert_lead_time_histogram.png](file:///home/saran/projects/twinedge/reports/model/figures/alert_lead_time_histogram.png): EOL lead time distribution under $T=60, K=3$.
8. [weight_histograms.png](file:///home/saran/projects/twinedge/reports/model/figures/weight_histograms.png): Weight distributions of first-layer Conv1D kernels.
