# 3D Digital Twin & Playback Sprint Tasks

| ID | Task | Status | Verification | Evidence |
|---|---|---|---|---|
| SETUP | Sprint setup, baseline measurement framework | COMPLETED | Branch fix/twin-3d-playback checked out, sprint directories created | `.sprint/3d/` |
| T0 | Measure & Diagnostic instrumentation (`?debug3d=1`) | COMPLETED | T0a-j measurements recorded, root causes identified | `.sprint/3d/diagnosis.md`, `.sprint/3d/evidence/t0_measurement.json` |
| T1 | Fix Flicker (re-render churn, RAF loops, near/far, depthWrite) | COMPLETED | Scene decoupled from React state, 0 changed pixels, 1 canvas, 1 loop | `.sprint/3d/evidence/static_flicker_test.json`, `EngineViewport3D.jsx` |
| T2 | Lighting & Materials (RoomEnvironment, ACES, tone mapping, metalness override) | COMPLETED | RoomEnvironment + ACESFilmicToneMapping applied; mean luminance = 147.75 | `.sprint/3d/evidence/twin_replay_dark.png`, `.sprint/3d/evidence/twin_replay_light.png` |
| T3 | Hotspots (mesh alignment, anchor pins within bounds, ?calibrate=1) | COMPLETED | 100% of anchors inside model bounds (max dist to mesh 0.18 units, 0 floating) | `.sprint/3d/evidence/mesh_cluster_centers.json`, `component_map.json` |
| T4 | Playback Engine (state machine, perf accumulation, speed scale, live/replay filters) | COMPLETED | 3s playback advances 10 cycles at 1x; 4x runs 4x speed; reset returns to 30 | Playwright test trace, `AppContext.jsx`, `DigitalTwinPage.jsx` |
| T5 | Impact Panel (cap logic, rank thresholds, MODEL tag) | COMPLETED | Cap logic (>= 125 cycles shows 'at cap' and hides rank; < 125 shows signed delta) | `DigitalTwinPage.jsx` |
| T6 | FPS Label (rolling 60 frame measurement, p95 ms, update <= 2Hz) | COMPLETED | Real frame delta accumulation; DOM ref update at <= 2 Hz (e.g. 60 FPS (16.6ms)) | `EngineViewport3D.jsx` |
| T7 | UI & Layout (icon sizes >= 16/20px, single line labels, non-clipped footer) | COMPLETED | IconButton fixed; play/reset/theme icons 20px; panel footer sticky/scrollable | `Button.jsx`, `GlobalShell.jsx`, `index.css` |
