# Design System Sprint Assumptions & Decisions

- Branch: `ui/design-system`
- Goal: Unified, strictly enforced design system across every page, drawer, and modal of TwinEdge.
- Enforcement: Tailwind configuration replacing arbitrary values, ESLint/custom guard (`ds:check`), Playwright computed-style audit (`ds:audit`).
- Exemptions: Three.js WebGL canvas contents and browser-native OS controls.
- Typography: Single UI font family Inter via `@fontsource-variable/inter` self-hosted (no CDN). Tabular numerals on numeric data. Monospace JetBrains Mono exclusively for hashes, IDs, file paths, and code.
- Type Scale: xs (12/16), sm (14/20), base (16/24), xl (20/28), metric (32/36 w600).
- Radii: sm 6px, md 8px, lg 12px, full 9999px.
- Spacing: 4px base (4, 8, 12, 16, 20, 24, 32, 40). Page padding 24. Gap between cards 16. Gap between sections 24. Card padding 20. Header 64px. Sidebar 240px.
- S5 Defect Handling:
  - Provenance tags unified to neutral outline.
  - Multi-engine key format `<split>:<id>` (e.g. `VAL-001`, `TEST-001`).
  - Replay starts at cycle 30; cycles <30 show WARM-UP chip without status band.
  - Unit `cyc` -> `cycles` everywhere.
  - Selected row left accent border with 14% alpha fill.
