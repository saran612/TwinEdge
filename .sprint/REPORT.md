# TwinEdge Sprint Report: Flight-Deck Frontend & Offline Edge AI

**Project**: Edge AI for Digital Twin of Aircraft MRO  
**Repository**: `saran612/TwinEdge`  
**Active Branch**: `sprint/frontend`  
**Timestamp**: 2026-10-07T20:13:00+05:30  
**Status**: COMPLETE (Tasks F0–F14 Verified)

---

## 1. Executive Summary

The TwinEdge flight-deck frontend provides a high-density, airworthiness-conscious monitoring and decision-support workspace for Aircraft Maintenance Engineers (AMEs). Operating on NASA C-MAPSS FD001 run-to-failure turbofan benchmarks, the architecture couples an edge-deployed 1D-CNN regression engine with an interactive Three.js 3D turbofan digital twin, cryptographic SHA-256 audit log, simulation matrix workbench, and offline-native WebAssembly inference engine.

All features strictly observe the **Honesty Rules H1–H7**:
- **H1 (No Mock Inventions)**: Every metric and data point displays an explicit provenance badge (`[LIVE]`, `[REPLAY]`, `[OFFLINE]`, `[SYNTHETIC]`, `[BENCHMARK]`, `[SPEC]`).
- **H2 (Engine-Level EOL Only)**: Strictly presents engine-level Remaining Useful Life (RUL). Per-component health is quantified solely as counterfactual attribution sensitivity without fabricating per-component RUL.
- **H3 (Traceable Latencies)**: Inference latency is reported through rolling empirical measurements (`p50`, `p95`) or live browser benchmarks.
- **H4 (Honest Edge Metrics)**: Quantifies edge compression as a measured ratio (1,680 bytes raw window to 8 bytes output payload = 210:1 ratio, 99.5% transmission reduction).
- **H5 (Persistent Simulation Banners)**: Persistent amber banner active whenever synthetic perturbation modes are engaged.
- **H6 (Sign-Off Contracts)**: AME sign-off strictly disabled during replay and simulation modes to prevent audit log contamination.
- **H7 (Forbidden Claims Disclaimer)**: Prominent disclaimers emphasizing prototype research status (not FAA/DO-178C certified, empirical surrogate rather than physics/CFD model).

---

## 2. Sprint Task Status Matrix (F0 – F14)

| Task ID | Description | Priority | Status | Verification Summary | Evidence File |
|---|---|---|---|---|---|
| **F0** | Discovery: Frontend structure, App.jsx, 3D assets search, mesh report | P0 | **VERIFIED** | Analyzed 29MB GLB model scene graph, mapped 9 turbofan components | `.sprint/evidence/F0.txt` |
| **F1** | Foundation: Router shell, design tokens, store/state, API client, Rubrics drawer | P0 | **VERIFIED** | GlobalShell, ProvenanceTag, StatusBadge, MetricCard, Rubrics drawer clean test pass | `.sprint/evidence/F1.txt` |
| **F2** | Offline Assets Exporter: ORT-web engine, JS preprocessing, bit parity | P0 | **VERIFIED** | Bit-level exact parity (`0.0000e+0` diff across 220 windows) verified in Vitest | `.sprint/evidence/F2.txt` |
| **F3** | Replay Controller: Data source switch (Live/Replay/Sim), held-out test engine splits | P0 | **VERIFIED** | Source switch toggle verified, split badges (`HELD-OUT VAL`, `TEST`) render correctly | `.sprint/evidence/F3.txt` |
| **F4** | Digital Twin Page: Three.js 3D viewport, component selection, EOL block, counterfactual attribution | P0 | **VERIFIED** | 3D canvas renders, components pickable via `window.__twin.select(id)`, Rule H2 EOL block verified | `.sprint/evidence/F4.txt` |
| **F5** | Simulation Lab: Perturbation matrix editor, 8 presets, OOD detection, local WASM inference | P0 | **VERIFIED** | Local browser ORT-web runs offline, matrix perturbates inputs, OOD (|z| > 4) flagged | `.sprint/evidence/F5.txt` |
| **F6** | Alerts & Sign-Off Page: Queue table, K-gate policy KPIs, reviewer ID input, sign-off contracts | P1 | **VERIFIED** | Live signoff contract verified, disabled in Replay/Simulation | `.sprint/evidence/F6.txt` |
| **F7** | Audit Page: Immutable SHA-256 chain table, live chain verification, hash inspect & export | P1 | **VERIFIED** | Cryptographic verification via API, tamper-evident hash inspection functional | `.sprint/evidence/F7.txt` |
| **F8** | Edge & Model Page: Hardware specs, live p50/p95 latency, edge bytes ratio, 100x WASM benchmark | P1 | **VERIFIED** | Real latency measurements display, 100-iteration browser benchmark functional | `.sprint/evidence/F8.txt` |
| **F9** | Overview Page: Flight-deck instrument metrics, fleet engines table, split badges, quick navigation | P1 | **VERIFIED** | Fleet table loads, row click switches engine, health gauges update | `.sprint/evidence/F9.txt` |
| **F10** | Telemetry Page: 14 small multiples, cycle brush, RUL pred vs actual, error statistics, CSV export | P2 | **VERIFIED** | Small multiples render, cycle range selection works, error statistics verified | `.sprint/evidence/F10.txt` |
| **F11** | Method & Limits Page: Scope, C-MAPSS data profile, 1D-CNN specs, rubrics, CLAIMS.md viewer | P2 | **VERIFIED** | Scope limits, 14 sensors, 1D-CNN architecture, permitted/forbidden claims verified | `.sprint/evidence/F11.txt` |
| **F12** | Accessibility & Performance Pass: Keyboard 3D selection, focus rings, reduced motion, bundle check | P2 | **VERIFIED** | Arrow keys cycle components, focus rings visible, bundle build clean | `.sprint/evidence/F12.txt` |
| **F13** | Automated Test Pass: Vitest 12 test suites (30 tests) + production build verification | P1 | **VERIFIED** | 12/12 Vitest suites passed (30/30 tests), production build exit 0 in 41s | `.sprint/evidence/F13.txt` |
| **F14** | Final Sprint Report: Architecture report, evidence paths, instructions for 3D model replacement | P0 | **VERIFIED** | Comprehensive report written to `.sprint/REPORT.md` and evidence recorded | `.sprint/evidence/F14.txt` |

---

## 3. Empirical Latency & Performance Measurements

| Environment | Component / Metric | Measured Value | Profiling Details |
|---|---|---|---|
| **Edge Backend** | ONNX Runtime CPU Latency (p50) | `~0.50 ms` | Measured via rolling deque (500 samples), Linux host |
| **Edge Backend** | ONNX Runtime CPU Latency (p95) | `~0.60 ms` | Measured via rolling deque (500 samples), Linux host |
| **Browser Frontend** | ONNX WebAssembly In-Browser Inference | `~1.2 – 2.4 ms` | 100-run benchmark in WebAssembly thread pool |
| **Edge Data Compression** | Raw Window to Prediction Payload | `210:1 (99.52%)` | 1,680 B raw window vs 8 B float64 RUL output |
| **Mathematical Parity** | Python NumPy vs JavaScript Preprocessing | `0.0000e+0` | Max absolute diff across 220 C-MAPSS test windows |

---

## 4. Instructions for Replacing the Turbofan 3D Model (`engine.glb`)

The 3D visualization is architected with dynamic mesh keyword matching and fallback hotspot anchors:

1. **Place GLB File**:
   Copy the new high-fidelity turbofan GLB model to:
   ```bash
   frontend/public/models/Turbofan_Engine_Animated.glb
   ```
2. **Component Mapping Configuration**:
   The engine components are defined in `frontend/src/config/component_map.json`:
   - `mesh_keywords`: Array of substring keywords matched against mesh names in the GLB scene graph (e.g. `["fan", "blade", "spinner"]`).
   - `anchor_position`: `[x, y, z]` world coordinates for the procedural glowing anchor spheres.
   - If the new model uses different mesh naming conventions, update the `mesh_keywords` in `component_map.json` to match the node names of the new GLB.
3. **Automatic Fallback**:
   If the GLB file fails to load or WebGL is unavailable, `EngineViewport3D` automatically falls back to procedural geometric anchor spheres, preserving full interaction and component selection.

---

## 5. Unverified & Blocked Items

- **Unverified Items**: NONE. All 15 tasks (F0 through F14) have been fully implemented, empirically tested, and verified.
- **Blocked Items**: NONE.
