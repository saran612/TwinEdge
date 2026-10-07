# Frontend Discovery Report (Task F0)

## 1. Frontend Structure & Architecture
- **Framework & Bundler**: React 19 (`react: ^19.2.7`, `react-dom: ^19.2.7`), Vite 8 (`vite: ^8.1.1`), Tailwind CSS v4 (`tailwindcss: ^4.3.2`, `@tailwindcss/vite: ^4.3.2`).
- **Data Visualization**: Recharts (`recharts: ^3.9.1`).
- **3D Graphics**: Three.js (`three: ^0.186.1`).
- **Icons**: Lucide React (`lucide-react: ^1.23.0`).
- **Current Entry Points**:
  - `frontend/src/main.jsx`: Mounts `App`.
  - `frontend/src/App.jsx`: Monolithic view containing KPI cards, alerts, engine charts, and tabbed views.
  - `frontend/src/components/Turbofan3DView.jsx`: Procedural turbofan renderer with spinning blades and hotspot anchors.

## 2. 3D Model Assets & Scene Graph
- **Discovered Model**: `frontend/public/models/Turbofan_Engine_Animated.glb` (28.02 MB).
- **Scene Graph Metrics**:
  - Total Nodes: 5,376
  - Total Meshes: 1,616
  - File details documented in `.sprint/frontend/mesh_report.md`.
- **Identified Component Mesh / Node Sub-trees**:
  - `Fan`: Nodes matching `Fan`, fan blades, hub, outer casing.
  - `LPC`: Low Pressure Compressor booster stages.
  - `HPC`: High Pressure Compressor blade rows and stators.
  - `Combustor`: Combustion chamber, liner, inner ducting.
  - `HPT`: High Pressure Turbine blade rows (explicit `HPT B row blade...`).
  - `LPT`: Low Pressure Turbine blade rows (`Turbine Blades Low Pressure`).
  - `Nozzle`: Exhaust nozzle and tail cone.
  - `HP Spool`: High pressure drive shaft and bevel gears.
  - `LP Spool`: Low pressure inner shaft and bearings.
- **Selection Architecture**:
  - Primary: Named scene mesh picking and material emissive highlight.
  - Fallback / Augmentation: Clickable 3D hotspot anchors along engine longitudinal axis for guaranteed clickability and screen-space labeling.

## 3. Backend Endpoints Available
All required backend endpoints from the hardening sprint are present and active on the FastAPI service:
1. `GET /health`: Health status, Influx connection check, MQTT broker check, pipeline bypass status, model metadata.
2. `POST /predict`: Inference on sliding window `[N, 14]` with front-padding, K-cycle alert gating, live latency tracking, edge byte metering.
3. `GET /telemetry/recent`: Recent telemetry points from SQLite buffer or InfluxDB.
4. `GET /alerts`: All triggered alerts with engine ID, cycle, RUL, status, reviewer ID, timestamp.
5. `POST /alerts/{alert_id}/signoff`: Human-in-the-loop signoff enforcing decision (`approve`/`reject`), non-empty `reviewer_id`, 409 double-signoff guard, and SHA-256 audit chaining.
6. `GET /audit`: Chronological cryptographic audit log entries.
7. `GET /audit/verify`: Audit chain integrity verification returning validity flag and first tampered row index.
8. `GET /model/info`: Model metadata, ONNX/TFLite file sizes, I/O tensor shapes, feature list, test RMSE (16.197), and live rolling p50/p95 latency.
9. `GET /edge/stats`: Edge transmission statistics (total calls, raw window bytes, upstream payload bytes, compression ratio).

## 4. Hardening Branch Verification
- Branch `sprint/frontend` created from `sprint/hardening`.
- All backend tests passing (`pytest` 9/9 passed).
- Frontend production build verified (`npm run build` exits 0).
- Datasets, model binaries, scaler, and results.json intact and unmodified.
