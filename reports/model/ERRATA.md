# TwinEdge Model Audit Errata (C-MAPSS FD001)

Date: 2026-10-09  
Reference Document: [reports/model/MODEL_AUDIT.md](file:///home/saran/projects/twinedge/reports/model/MODEL_AUDIT.md)  
Status: Active Errata

---

## 1. Sensor Label Discrepancy (`s_13` vs `s_14`)

### Observed in `MODEL_AUDIT.md` Section 5.4:
In Section 5.4 (*Permutation Sensor Reliance*), the text states:
```markdown
1. s_13 (Core Speed): +24.71 ΔRMSE
2. s_14 (Bypass Ratio): +13.29 ΔRMSE
```

### Canonical Mapping (from NASA C-MAPSS FD001 specification and `frontend/src/offline/features.json`):
- **`s_13`**: `NRf` (Corrected Fan Speed, rpm)
- **`s_14`**: `NRc` (Corrected Core Speed, rpm)
- **`s_15`**: `BPR` (Bypass Ratio, —)

### Errata Resolution:
The physical names listed in the parenthetical comments of Section 5.4 were mistakenly shifted:
- `s_13` represents **Corrected Fan Speed (NRf)**, not Core Speed.
- `s_14` represents **Corrected Core Speed (NRc)**, not Bypass Ratio.
The numerical permutation importance values (+24.71 and +13.29 ΔRMSE) are correct for channels `s_13` and `s_14` respectively, but their human labels should follow the canonical C-MAPSS engineering definitions.

---

## 2. Near-End-of-Life Performance Sentence vs. Bucket Table

### Observed in `MODEL_AUDIT.md` Section 4:
Directly below the severity bucket table, line 99 states:
> *"Accuracy is highest in the critical late-life degradation phase and degrades near the 125-cycle cap."*

### Contradiction against the Bucket Table:
The severity bucket table in Section 4 provides the following audited figures:
- $RUL \in [0, 25]$ (Near EOL): **RMSE = 14.282**, MAE = 10.984
- $RUL \in [25, 50]$: **RMSE = 12.951**, MAE = 10.590
- $RUL \in [50, 75]$: **RMSE = 12.571**, MAE = 9.620
- $RUL \in [75, 100]$: **RMSE = 16.598**, MAE = 12.871
- $RUL \in [100, 125]$: **RMSE = 20.654**, MAE = 15.875

### Errata Resolution:
The lowest RMSE and MAE occur in the **mid-life phase ($RUL \in [50, 75]$ with RMSE 12.571)**, not the final $[0, 25]$ bucket.  
Near end-of-life ($RUL \in [0, 25]$), the error is **14.28 cycles RMSE**, which is higher than mid-life. The claim of "accuracy is highest near end-of-life" is contradicted by the audited table. The accurate summary is:
> *Model accuracy is highest during the mid-degradation phase ($RUL \in [50, 75]$ at 12.57 RMSE); error increases both at the 125-cycle plateau (20.65 RMSE) and near end-of-life ($RUL < 25$ at 14.28 RMSE).*
