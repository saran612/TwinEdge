# 3D Digital Twin & Playback Sprint Tasks

| ID | Task | Status | Verification | Evidence |
|---|---|---|---|---|
| SETUP | Sprint setup, baseline measurement framework | IN_PROGRESS | Directory structure created | .sprint/3d/ |
| T0 | Measure & Diagnostic instrumentation (`?debug3d=1`) | PENDING | T0a-j metrics, diagnosis.md | .sprint/3d/diagnosis.md, evidence/ |
| T1 | Fix Flicker (re-render churn, RAF loops, near/far, depthWrite) | PENDING | 0 changed pixels in 120-frame static flicker test | evidence/flicker_test.txt |
| T2 | Lighting & Materials (RoomEnvironment, ACES, tone mapping, metalness/roughness) | PENDING | Mean luminance threshold passed, before/after screenshots | evidence/lighting.png |
| T3 | Hotspots (mesh alignment, anchor pins within bounds, ?calibrate=1) | PENDING | Zero floating pins outside mesh bounds | evidence/hotspot_audit.json |
| T4 | Playback Engine (state machine, perf accumulation, speed scale, live/replay filters) | PENDING | Vitest timers, Playwright 3s advance test | evidence/playback_test.txt |
| T5 | Impact Panel (cap logic, rank thresholds, MODEL tag) | PENDING | Component attribution verification | evidence/impact_panel.txt |
| T6 | FPS Label (rolling 60 frame measurement, p95 ms, update <= 2Hz) | PENDING | Measured FPS vs static string | evidence/fps_benchmark.txt |
| T7 | UI & Layout (icon sizes >= 16/20px, single line labels, non-clipped footer) | PENDING | Playwright layout inspection | evidence/ui_audit.txt |
