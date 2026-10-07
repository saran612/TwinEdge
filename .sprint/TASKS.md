# Frontend Sprint Tasks Matrix

| id | task | priority | status | verification | evidence |
|---|---|---|---|---|---|
| F0 | Discovery: frontend structure, App.jsx, Turbofan3DView.jsx, 3D assets search + mesh_report.md, backend endpoints, hardening state | P0 | VERIFIED | Output .sprint/frontend/discovery.md and .sprint/frontend/mesh_report.md | .sprint/evidence/F0.txt |
| F1 | Foundation: router, shell, tokens, store/state, API client with explicit errors, shared components, provenance/status/metric, Rubrics drawer | P0 | VERIFIED | Component test/render, clean build, Rubrics drawer verified | .sprint/evidence/F1.txt |
| F2 | Offline assets exporter + ORT-web engine + preprocessing in JS + parity tests | P0 | VERIFIED | max abs diff 0.0000e+0 on 220 windows verified in Vitest | .sprint/evidence/F2.txt |
| F3 | Replay controller + data-source switch (Live / Replay / Simulation) + held-out/test engine handling and badges | P0 | VERIFIED | Source switch behaves correctly, engine split badges display | .sprint/evidence/F3.txt |
| F4 | Digital Twin page: 3D load, mapping, selection, panels, EOL data, counterfactual impact, color modes | P0 | VERIFIED | 3D canvas renders, components select, counterfactual impact computed | .sprint/evidence/F4.txt |
| F5 | Simulation Lab: matrix editor, presets, run, results, sensitivity heatmap, OOD flags, save/compare/export | P0 | VERIFIED | Browser-side ORT-web runs offline without backend, matrix modifies inputs, heatmap renders | .sprint/evidence/F5.txt |
| F6 | Alerts & Sign-off page: filters, detail drawer, K-gate evidence, reviewer ID, Approve/Reject contract, prototype disclaimer | P1 | VERIFIED | Live signoff contract verified, disabled in Replay/Simulation | .sprint/evidence/F6.txt |
| F7 | Audit page: immutable chain table, verify chain endpoint, row/prev hash inspection, CSV/JSON export | P1 | VERIFIED | Chain verified via API, hash copies work | .sprint/evidence/F7.txt |
| F8 | Edge & Model page: model info, live/browser latency, edge bytes ratio, browser benchmark | P1 | VERIFIED | Real measurements display, benchmark runs 100 iterations | .sprint/evidence/F8.txt |
| F9 | Overview page: fleet engine table, status bands, mini charts, navigation quick actions | P1 | VERIFIED | Fleet table loads, row click switches engine, health gauges update | .sprint/evidence/F9.txt |
| F10 | Telemetry page: 14 small multiples, cycle brush, RUL pred vs true, error analysis, CSV export | P2 | VERIFIED | Small multiples render, cycle range selection works | .sprint/evidence/F10.txt |
| F11 | Method & Limits page: scope, C-MAPSS data details, 1D-CNN architecture, rubrics, limitations, CLAIMS.md viewer | P2 | TODO | Claims render, no forbidden claims present | .sprint/evidence/F11.txt |
| F12 | Accessibility & performance pass: focus order, keyboard 3D selection, contrast, bundle optimization, 60fps check | P2 | TODO | Lighthouse / a11y checks, keyboard navigation functional | .sprint/evidence/F12.txt |
| F13 | Automated tests: Vitest (parity, K-gate, perturbation, OOD, impact, EOL), Playwright E2E, screenshots | P1 | TODO | Vitest passing, Playwright / offline E2E passing | .sprint/evidence/F13.txt |
| F14 | CLAIMS.md update, .sprint/REPORT.md final report with screenshots and measurements | P0 | TODO | Final report and claims verified | .sprint/evidence/F14.txt |
