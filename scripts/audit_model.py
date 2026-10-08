#!/usr/bin/env python3
"""
scripts/audit_model.py
Comprehensive verification, reproduction, ablation, robustness, and statistical evaluation
of the TwinEdge 1D-CNN RUL model on C-MAPSS FD001. Generates figures in reports/model/figures/
and outputs reports/model/audit_metrics.json.
"""

import os
import sys
import copy
import json
import time
import hashlib
from pathlib import Path
import numpy as np
import pandas as pd
import onnx
from onnx import numpy_helper
import onnxruntime as ort
import joblib
from scipy.stats import spearmanr, pearsonr
from sklearn.linear_model import Ridge
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import train_test_split

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# Add repo root to sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

from config import paths

def sha256_of_file(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def nasa_score(pred, true):
    d = np.array(pred) - np.array(true)
    score = 0.0
    for diff in d:
        if diff < 0:
            score += np.exp(-diff / 13.0) - 1.0
        else:
            score += np.exp(diff / 10.0) - 1.0
    return float(score)

def main():
    print("==================================================")
    print(" Running TwinEdge Model Audit (C-MAPSS FD001)     ")
    print("==================================================")
    
    figures_dir = paths.REPORTS_DIR / "figures"
    figures_dir.mkdir(parents=True, exist_ok=True)
    raw_dir = paths.REPORTS_DIR / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    # 1. Load Data
    x_train = np.load(paths.PROCESSED_DATA_DIR / "x_train.npy") # (14241, 30, 14)
    y_train = np.load(paths.PROCESSED_DATA_DIR / "y_train.npy") # (14241,)
    x_val = np.load(paths.PROCESSED_DATA_DIR / "x_val.npy")     # (3490, 30, 14)
    y_val = np.load(paths.PROCESSED_DATA_DIR / "y_val.npy")     # (3490,)
    x_test = np.load(paths.PROCESSED_DATA_DIR / "x_test.npy")   # (100, 30, 14)
    y_test = np.load(paths.PROCESSED_DATA_DIR / "y_test.npy")   # (100,)
    
    raw_test_rul = pd.read_csv(paths.RAW_DATA_DIR / "RUL_FD001.txt", sep=r"\s+", header=None)[0].values

    scaler = joblib.load(paths.SCALER_PATH)
    features = [f"s_{i}" for i in [2,3,4,7,8,9,11,12,13,14,15,17,20,21]]

    # 2. Shipped ONNX Inference
    session = ort.InferenceSession(str(paths.ONNX_MODEL_PATH), providers=["CPUExecutionProvider"])
    in_name = session.get_inputs()[0].name
    test_preds_raw = session.run(None, {in_name: x_test.astype(np.float32)})[0].flatten()
    test_preds = np.clip(test_preds_raw, 0.0, 125.0)

    val_preds_raw = session.run(None, {in_name: x_val.astype(np.float32)})[0].flatten()
    val_preds = np.clip(val_preds_raw, 0.0, 125.0)

    train_preds_raw = session.run(None, {in_name: x_train.astype(np.float32)})[0].flatten()
    train_preds = np.clip(train_preds_raw, 0.0, 125.0)

    # Headline reproduction metrics
    rmse_test_capped = float(np.sqrt(np.mean((test_preds_raw - y_test)**2)))
    rmse_test_uncapped = float(np.sqrt(np.mean((test_preds_raw - raw_test_rul)**2)))
    mae_test_capped = float(np.mean(np.abs(test_preds_raw - y_test)))
    r2_test_capped = float(1.0 - (np.sum((y_test - test_preds_raw)**2) / np.sum((y_test - np.mean(y_test))**2)))
    nasa_test_capped = nasa_score(test_preds_raw, y_test)
    nasa_test_uncapped = nasa_score(test_preds_raw, raw_test_rul)
    bias_test = float(np.mean(test_preds_raw - y_test))
    pct_late = float(np.mean(test_preds_raw > y_test) * 100.0)
    pct_early = float(np.mean(test_preds_raw < y_test) * 100.0)

    print(f"Test RMSE Capped: {rmse_test_capped:.4f} (Claimed in results.json: 16.1972)")
    print(f"Test RMSE Uncapped: {rmse_test_uncapped:.4f}")

    # 3. Baselines
    x_train_flat = x_train.reshape((len(x_train), -1))
    x_test_flat = x_test.reshape((len(x_test), -1))

    # Constant Mean
    const_pred = np.full_like(y_test, np.mean(y_train))
    rmse_const = float(np.sqrt(np.mean((const_pred - y_test)**2)))
    mae_const = float(np.mean(np.abs(const_pred - y_test)))
    nasa_const = nasa_score(const_pred, y_test)

    # Ridge
    ridge = Ridge().fit(x_train_flat, y_train)
    ridge_pred = ridge.predict(x_test_flat)
    rmse_ridge = float(np.sqrt(np.mean((ridge_pred - y_test)**2)))
    mae_ridge = float(np.mean(np.abs(ridge_pred - y_test)))
    nasa_ridge = nasa_score(ridge_pred, y_test)

    # HistGBM
    hgb = HistGradientBoostingRegressor(max_iter=100, random_state=42).fit(x_train_flat[::2], y_train[::2])
    hgb_pred = hgb.predict(x_test_flat)
    rmse_hgb = float(np.sqrt(np.mean((hgb_pred - y_test)**2)))
    mae_hgb = float(np.mean(np.abs(hgb_pred - y_test)))
    nasa_hgb = nasa_score(hgb_pred, y_test)

    # 4. Controls (Shuffled and Noise)
    onnx_model = onnx.load(str(paths.ONNX_MODEL_PATH))
    
    # Shuffled weights control
    model_shuf = copy.deepcopy(onnx_model)
    np.random.seed(42)
    for init in model_shuf.graph.initializer:
        w = numpy_helper.to_array(init)
        if w.size > 1 and np.issubdtype(w.dtype, np.floating):
            flat = w.flatten()
            np.random.shuffle(flat)
            init.CopyFrom(numpy_helper.from_array(flat.reshape(w.shape).astype(w.dtype), name=init.name))
    sess_shuf = ort.InferenceSession(model_shuf.SerializeToString(), providers=["CPUExecutionProvider"])
    shuf_pred = sess_shuf.run(None, {in_name: x_test.astype(np.float32)})[0].flatten()
    rmse_shuf = float(np.sqrt(np.mean((shuf_pred - y_test)**2)))

    # Noise weights control
    model_noise = copy.deepcopy(onnx_model)
    np.random.seed(42)
    for init in model_noise.graph.initializer:
        w = numpy_helper.to_array(init)
        if w.size > 1 and np.issubdtype(w.dtype, np.floating):
            noise = np.random.normal(0, 0.2, size=w.shape).astype(w.dtype)
            init.CopyFrom(numpy_helper.from_array(noise, name=init.name))
    sess_noise = ort.InferenceSession(model_noise.SerializeToString(), providers=["CPUExecutionProvider"])
    noise_pred = sess_noise.run(None, {in_name: x_test.astype(np.float32)})[0].flatten()
    rmse_noise = float(np.sqrt(np.mean((noise_pred - y_test)**2)))

    # 5. Full Validation Engine Spearman Correlations
    col_names = ['unit_number', 'time_in_cycles', 's1', 's2', 's3'] + [f's_{i}' for i in range(1, 22)]
    train_df = pd.read_csv(paths.RAW_DATA_DIR / 'train_FD001.txt', sep=r'\s+', header=None, names=col_names)
    unique_units = train_df['unit_number'].unique()
    train_units, val_units = train_test_split(unique_units, test_size=0.2, random_state=42)

    spearmans = []
    val_trajectories = {}
    for uid in sorted(list(val_units)):
        gdf = train_df[train_df['unit_number'] == uid].sort_values('time_in_cycles')
        vals = gdf[features].values
        cycles = gdf['time_in_cycles'].values
        total_life = int(gdf['time_in_cycles'].max())
        
        X = [vals[end-30:end] for end in range(30, len(vals) + 1)]
        X_scaled = scaler.transform(np.array(X).reshape(-1, 14)).reshape(len(X), 30, 14).astype(np.float32)
        preds = session.run(None, {in_name: X_scaled})[0].flatten()
        preds = np.clip(preds, 0.0, 125.0)
        
        corr, _ = spearmanr(cycles[29:], preds)
        spearmans.append(float(corr))
        val_trajectories[int(uid)] = {
            "cycles": cycles[29:].tolist(),
            "true_rul": (total_life - cycles[29:]).tolist(),
            "pred_rul": preds.tolist()
        }

    spearman_median = float(np.median(spearmans))
    spearman_mean = float(np.mean(spearmans))

    # 6. Permutation Importance on Validation
    base_val_rmse = float(np.sqrt(np.mean((val_preds_raw - y_val)**2)))
    perm_importance = {}
    for i, feat in enumerate(features):
        x_perm = x_val.copy()
        np.random.seed(42)
        perm_idx = np.random.permutation(len(x_val))
        x_perm[:, :, i] = x_perm[perm_idx, :, i]
        pred_p = session.run(None, {in_name: x_perm.astype(np.float32)})[0].flatten()
        delta_rmse = float(np.sqrt(np.mean((pred_p - y_val)**2)) - base_val_rmse)
        perm_importance[feat] = round(delta_rmse, 4)

    # 7. Accuracy Detail by True-RUL Buckets (Test set)
    buckets = [(0, 25), (25, 50), (50, 75), (75, 100), (100, 125)]
    bucket_metrics = {}
    for low, high in buckets:
        mask = (y_test >= low) & (y_test < high if high < 125 else y_test <= 125)
        if np.sum(mask) > 0:
            b_true = y_test[mask]
            b_pred = test_preds_raw[mask]
            b_rmse = float(np.sqrt(np.mean((b_pred - b_true)**2)))
            b_mae = float(np.mean(np.abs(b_pred - b_true)))
            bucket_metrics[f"{low}_{high}"] = {
                "count": int(np.sum(mask)),
                "rmse": round(b_rmse, 3),
                "mae": round(b_mae, 3)
            }

    # 8. Bootstrap 95% Confidence Intervals (1000 resamples over 100 test engines)
    np.random.seed(42)
    boot_rmse, boot_mae, boot_nasa = [], [], []
    boot_diff_ridge, boot_diff_hgb = [], []
    n_test = len(y_test)
    for _ in range(1000):
        idx = np.random.choice(n_test, size=n_test, replace=True)
        yt_b = y_test[idx]
        yp_b = test_preds_raw[idx]
        y_ridge_b = ridge_pred[idx]
        y_hgb_b = hgb_pred[idx]

        r_b = np.sqrt(np.mean((yp_b - yt_b)**2))
        boot_rmse.append(r_b)
        boot_mae.append(np.mean(np.abs(yp_b - yt_b)))
        boot_nasa.append(nasa_score(yp_b, yt_b))

        r_ridge = np.sqrt(np.mean((y_ridge_b - yt_b)**2))
        r_hgb = np.sqrt(np.mean((y_hgb_b - yt_b)**2))
        boot_diff_ridge.append(r_b - r_ridge)
        boot_diff_hgb.append(r_b - r_hgb)

    ci_rmse = [float(np.percentile(boot_rmse, 2.5)), float(np.percentile(boot_rmse, 97.5))]
    ci_mae = [float(np.percentile(boot_mae, 2.5)), float(np.percentile(boot_mae, 97.5))]
    ci_nasa = [float(np.percentile(boot_nasa, 2.5)), float(np.percentile(boot_nasa, 97.5))]
    ci_diff_ridge = [float(np.percentile(boot_diff_ridge, 2.5)), float(np.percentile(boot_diff_ridge, 97.5))]
    ci_diff_hgb = [float(np.percentile(boot_diff_hgb, 2.5)), float(np.percentile(boot_diff_hgb, 97.5))]

    # 9. Alert Performance Sweep on Validation Windows
    thresholds = [30, 40, 50, 60, 70, 80]
    alert_pr = {}
    val_true_ruls = []
    val_pred_ruls = []
    for uid, d in val_trajectories.items():
        val_true_ruls.extend(d["true_rul"])
        val_pred_ruls.extend(d["pred_rul"])
    val_true_ruls = np.array(val_true_ruls)
    val_pred_ruls = np.array(val_pred_ruls)

    for T in thresholds:
        act_pos = val_true_ruls < T
        pr_pos = val_pred_ruls < T
        tp = int(np.sum(act_pos & pr_pos))
        fp = int(np.sum((~act_pos) & pr_pos))
        fn = int(np.sum(act_pos & (~pr_pos)))
        tn = int(np.sum((~act_pos) & (~pr_pos)))
        prec = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
        rec = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
        f1 = float(2 * prec * rec / (prec + rec)) if (prec + rec) > 0 else 0.0
        far = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
        alert_pr[f"T_{T}"] = {
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1": round(f1, 4),
            "false_alarm_rate": round(far, 4)
        }

    # K-gating sweep at T=60
    k_gating = {}
    for K in [1, 2, 3, 4, 5]:
        lead_times = []
        false_alarms = 0
        for uid, d in val_trajectories.items():
            streak = 0
            alert_c = None
            total_l = d["cycles"][-1]
            for c, tr, pr in zip(d["cycles"], d["true_rul"], d["pred_rul"]):
                if pr < 60.0:
                    streak += 1
                else:
                    streak = 0
                if streak >= K:
                    alert_c = c
                    if tr >= 80:
                        false_alarms += 1
                    break
            if alert_c is not None:
                lead_times.append(total_l - alert_c)
        k_gating[f"K_{K}"] = {
            "mean_lead_time": round(float(np.mean(lead_times)), 1),
            "median_lead_time": round(float(np.median(lead_times)), 1),
            "min_lead_time": int(np.min(lead_times)),
            "missed_engines": 20 - len(lead_times),
            "false_alarms_healthy": false_alarms
        }

    # 10. Robustness and Noise Sweep
    noise_deltas = {}
    for sigma in [0.05, 0.1, 0.25, 0.5]:
        np.random.seed(42)
        noise = np.random.normal(0, sigma, size=x_test.shape).astype(np.float32)
        noisy_x = x_test.astype(np.float32) + noise
        noisy_pred = session.run(None, {in_name: noisy_x})[0].flatten()
        noisy_rmse = float(np.sqrt(np.mean((noisy_pred - y_test)**2)))
        noise_deltas[f"sigma_{sigma}"] = round(noisy_rmse - rmse_test_capped, 4)

    # Compile Audit Results Object
    audit_results = {
        "metadata": {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "onnx_sha256": sha256_of_file(paths.ONNX_MODEL_PATH),
            "scaler_sha256": sha256_of_file(paths.SCALER_PATH)
        },
        "headline_reproduction": {
            "rmse_test_capped": round(rmse_test_capped, 4),
            "rmse_test_uncapped": round(rmse_test_uncapped, 4),
            "mae_test_capped": round(mae_test_capped, 4),
            "r2_test_capped": round(r2_test_capped, 4),
            "nasa_test_capped": round(nasa_test_capped, 2),
            "nasa_test_uncapped": round(nasa_test_uncapped, 2),
            "bias_test": round(bias_test, 4),
            "pct_late": round(pct_late, 2),
            "pct_early": round(pct_early, 2)
        },
        "controls": {
            "rmse_shuffled_weights": round(rmse_shuf, 4),
            "rmse_noise_weights": round(rmse_noise, 4)
        },
        "baselines": {
            "constant_mean": {"rmse": round(rmse_const, 4), "mae": round(mae_const, 4), "nasa": round(nasa_const, 2)},
            "ridge": {"rmse": round(rmse_ridge, 4), "mae": round(mae_ridge, 4), "nasa": round(nasa_ridge, 2)},
            "hist_gbm": {"rmse": round(rmse_hgb, 4), "mae": round(mae_hgb, 4), "nasa": round(nasa_hgb, 2)}
        },
        "split_generalization": {
            "train_rmse": round(float(np.sqrt(np.mean((train_preds_raw - y_train)**2))), 4),
            "val_rmse": round(base_val_rmse, 4),
            "test_rmse": round(rmse_test_capped, 4),
            "train_to_test_ratio": round(float(np.sqrt(np.mean((train_preds_raw - y_train)**2))) / rmse_test_capped, 4)
        },
        "spearman_cycle_rul": {
            "median": round(spearman_median, 4),
            "mean": round(spearman_mean, 4),
            "min": round(float(np.min(spearmans)), 4),
            "max": round(float(np.max(spearmans)), 4)
        },
        "permutation_importance": perm_importance,
        "bucket_accuracy": bucket_metrics,
        "bootstrap_95_ci": {
            "rmse": [round(ci_rmse[0], 3), round(ci_rmse[1], 3)],
            "mae": [round(ci_mae[0], 3), round(ci_mae[1], 3)],
            "nasa": [round(ci_nasa[0], 1), round(ci_nasa[1], 1)],
            "diff_vs_ridge": [round(ci_diff_ridge[0], 3), round(ci_diff_ridge[1], 3)],
            "diff_vs_hgb": [round(ci_diff_hgb[0], 3), round(ci_diff_hgb[1], 3)]
        },
        "alert_metrics": alert_pr,
        "k_gating_metrics": k_gating,
        "noise_robustness": noise_deltas
    }

    with open(paths.REPORTS_DIR / "audit_metrics.json", "w") as f:
        json.dump(audit_results, f, indent=2)
    print(f"Audit metrics saved to {paths.REPORTS_DIR / 'audit_metrics.json'}")

    # ==================================================
    # 11. Plotting B9 Figures
    # ==================================================
    print("Generating B9 Audit Figures...")
    plt.style.use("seaborn-v0_8-whitegrid" if "seaborn-v0_8-whitegrid" in plt.style.available else "default")

    # Fig 1: Pred vs True RUL (Test set)
    plt.figure(figsize=(7, 6))
    plt.scatter(y_test, test_preds_raw, alpha=0.75, edgecolors='none', color='#2563eb', label='Test Engines (N=100)')
    plt.plot([0, 130], [0, 130], '--', color='#ef4444', linewidth=1.5, label='Ideal y=x')
    plt.xlabel('True RUL (capped at 125)', fontsize=11)
    plt.ylabel('Predicted RUL', fontsize=11)
    plt.title('Prediction vs Ground Truth (C-MAPSS FD001 Test Set)', fontsize=12, fontweight='bold')
    plt.legend()
    plt.tight_layout()
    plt.savefig(figures_dir / "pred_vs_true.png", dpi=200)
    plt.close()

    # Fig 2: Error by RUL Bucket
    bucket_labels = [f"{b[0]}-{b[1]}" for b in buckets]
    b_rmses = [bucket_metrics[f"{b[0]}_{b[1]}"]["rmse"] for b in buckets]
    b_maes = [bucket_metrics[f"{b[0]}_{b[1]}"]["mae"] for b in buckets]
    x_idx = np.arange(len(bucket_labels))
    width = 0.35

    plt.figure(figsize=(8, 5))
    plt.bar(x_idx - width/2, b_rmses, width, label='RMSE', color='#3b82f6')
    plt.bar(x_idx + width/2, b_maes, width, label='MAE', color='#93c5fd')
    plt.xlabel('True RUL Range', fontsize=11)
    plt.ylabel('Error (Cycles)', fontsize=11)
    plt.title('Test Prediction Error by True RUL Severity Bucket', fontsize=12, fontweight='bold')
    plt.xticks(x_idx, bucket_labels)
    plt.legend()
    plt.tight_layout()
    plt.savefig(figures_dir / "error_by_bucket.png", dpi=200)
    plt.close()

    # Fig 3: Trajectories for 3 Held-out Validation Engines
    plt.figure(figsize=(9, 5))
    for uid, col in [(31, '#059669'), (35, '#d97706'), (42, '#dc2626')]:
        if uid in val_trajectories:
            d = val_trajectories[uid]
            plt.plot(d["cycles"], d["true_rul"], '--', color=col, alpha=0.5, label=f'True Engine #{uid}')
            plt.plot(d["cycles"], d["pred_rul"], '-', color=col, linewidth=2, label=f'Pred Engine #{uid}')
    plt.xlabel('Cycle', fontsize=11)
    plt.ylabel('RUL', fontsize=11)
    plt.title('Full Run-to-Failure Trajectories (Held-Out Validation Engines)', fontsize=12, fontweight='bold')
    plt.legend(ncol=3, fontsize=9)
    plt.tight_layout()
    plt.savefig(figures_dir / "held_out_trajectories.png", dpi=200)
    plt.close()

    # Fig 4: Spearman Correlation Histogram
    plt.figure(figsize=(7, 4.5))
    plt.hist(spearmans, bins=12, color='#6366f1', edgecolor='black', alpha=0.85)
    plt.axvline(spearman_median, color='#dc2626', linestyle='--', linewidth=2, label=f'Median: {spearman_median:.3f}')
    plt.xlabel('Spearman Correlation (Cycle vs Predicted RUL)', fontsize=11)
    plt.ylabel('Engine Count (N=20)', fontsize=11)
    plt.title('Distribution of Spearman Degradation Monotonicity', fontsize=12, fontweight='bold')
    plt.legend()
    plt.tight_layout()
    plt.savefig(figures_dir / "spearman_histogram.png", dpi=200)
    plt.close()

    # Fig 5: Permutation Importance
    sorted_feats = sorted(perm_importance.items(), key=lambda x: x[1], reverse=True)
    f_names = [x[0] for x in sorted_feats]
    f_deltas = [x[1] for x in sorted_feats]

    plt.figure(figsize=(9, 5.5))
    plt.barh(f_names[::-1], f_deltas[::-1], color='#0ea5e9')
    plt.xlabel('Delta RMSE on Validation Windows (+cycles)', fontsize=11)
    plt.title('Sensor Permutation Feature Importance', fontsize=12, fontweight='bold')
    plt.tight_layout()
    plt.savefig(figures_dir / "permutation_importance.png", dpi=200)
    plt.close()

    # Fig 6: Precision-Recall Curve across Thresholds
    precs = [alert_pr[f"T_{T}"]["precision"] for T in thresholds]
    recs = [alert_pr[f"T_{T}"]["recall"] for T in thresholds]

    plt.figure(figsize=(6, 5))
    plt.plot(recs, precs, 'o-', color='#8b5cf6', linewidth=2, markersize=7)
    for i, T in enumerate(thresholds):
        plt.annotate(f"T={T}", (recs[i], precs[i]), textcoords="offset points", xytext=(-15, 10), fontsize=9)
    plt.xlabel('Recall', fontsize=11)
    plt.ylabel('Precision', fontsize=11)
    plt.title('Alert Level Precision-Recall Tradeoff', fontsize=12, fontweight='bold')
    plt.ylim([0.8, 1.0])
    plt.xlim([0.75, 0.95])
    plt.tight_layout()
    plt.savefig(figures_dir / "pr_curve.png", dpi=200)
    plt.close()

    # Fig 7: Alert Lead Time Histogram (T=60, K=3)
    k3_leads = []
    for uid, d in val_trajectories.items():
        streak = 0
        total_l = d["cycles"][-1]
        for c, pr in zip(d["cycles"], d["pred_rul"]):
            if pr < 60.0:
                streak += 1
            else:
                streak = 0
            if streak >= 3:
                k3_leads.append(total_l - c)
                break

    plt.figure(figsize=(7, 4.5))
    plt.hist(k3_leads, bins=10, color='#10b981', edgecolor='black', alpha=0.85)
    plt.axvline(np.median(k3_leads), color='#b91c1c', linestyle='--', linewidth=2, label=f'Median: {np.median(k3_leads):.1f} cycles')
    plt.xlabel('Lead Time Before EOL (Cycles)', fontsize=11)
    plt.ylabel('Engine Count (N=20)', fontsize=11)
    plt.title('Alert Lead Time Distribution (Threshold T=60, Gating K=3)', fontsize=12, fontweight='bold')
    plt.legend()
    plt.tight_layout()
    plt.savefig(figures_dir / "alert_lead_time_histogram.png", dpi=200)
    plt.close()

    # Fig 8: Weight Histograms
    conv1_weights = None
    for init in onnx_model.graph.initializer:
        if "conv1d_1/convolution" in init.name:
            conv1_weights = numpy_helper.to_array(init).flatten()

    plt.figure(figsize=(7, 4.5))
    if conv1_weights is not None:
        plt.hist(conv1_weights, bins=25, color='#f59e0b', edgecolor='black', alpha=0.8)
    plt.xlabel('Weight Values', fontsize=11)
    plt.ylabel('Count', fontsize=11)
    plt.title('First Layer Conv1D Weight Distribution', fontsize=12, fontweight='bold')
    plt.tight_layout()
    plt.savefig(figures_dir / "weight_histograms.png", dpi=200)
    plt.close()

    print(f"All 8 figures successfully generated in {figures_dir}")
    print("Audit computation completed.")

if __name__ == "__main__":
    main()
