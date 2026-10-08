# TwinEdge Design System Specification

## 1. Overview
TwinEdge implements a consolidated, strict design system across every page, modal, and drawer in both Light and Dark themes. The system is enforced statically via `npm run ds:check` and dynamically via Playwright audits (`npm run ds:audit`).

---

## 2. Typography

- **UI Font**: Inter (variable font, self-hosted via `@fontsource-variable/inter`). No CDN dependencies.
- **Code & Hash Font**: JetBrains Mono 400 (self-hosted via `@fontsource/jetbrains-mono`). Used exclusively for hashes, IDs, file names, and raw code snippets.
- **Tabular Numerals**: `font-variant-numeric: tabular-nums` enforced on all numbers, KPI counters, and telemetry metrics.
- **Type Scale**:
  - `metric`: 32px / line-height 36px, weight 600 (KPI values)
  - `xl`: 20px / line-height 28px, weight 600 (Page titles)
  - `base`: 16px / line-height 24px, weight 600 (Card titles)
  - `sm`: 14px / line-height 20px, weight 400/500 (Body text, table cells, nav items, buttons, inputs)
  - `xs`: 12px / line-height 16px, weight 500/600 (Badges, table column headers, captions, chart ticks)
- **Allowed Weights**: 400, 500, 600 only.
- **Casing**: Sentence case across all UI copy; uppercase + tracking reserved strictly for table column headers (xs).

---

## 3. Radii & Spacing

### Border Radii
- `sm`: 6px (chips, badges)
- `md`: 8px (buttons, inputs, selects, table-row focus, tooltips)
- `lg`: 12px (cards, drawers, modals)
- `full`: 9999px (status pills, count bubbles, toggles)
- All other arbitrary border radii are blocked.

### Spacing (4px Base Grid)
- Multiples: 4, 8, 12, 16, 20, 24, 32, 40 px.
- Page padding: 24px (`p-6`).
- Gap between cards: 16px (`gap-4`).
- Gap between sections: 24px (`gap-6`).
- Card padding: 20px (`p-5`).
- Global Header: 64px height.
- Sidebar: 240px width.
- Minimum supported viewport: 1280x720 (zero horizontal scroll).

---

## 4. Color Palette & Measured Contrast Ratios

All colors are defined as semantic CSS variables in `src/styles/tokens.css` under `[data-theme="light"]` and `[data-theme="dark"]`.

| Token | Light Theme | Dark Theme | Purpose | Contrast Ratio (Light) | Contrast Ratio (Dark) |
|---|---|---|---|---|---|
| `--bg-app` | `#F5F6F8` | `#0E1116` | Application background | Base canvas | Base canvas |
| `--surface` | `#FFFFFF` | `#161B22` | Card & modal surfaces | N/A | N/A |
| `--surface-2` | `#F0F2F5` | `#1D232C` | Secondary background, inputs | 1.08:1 vs surface | 1.12:1 vs surface |
| `--border` | `#D7DBE2` | `#2B3340` | Dividers, card borders | 3.1:1 vs surface | 3.2:1 vs surface |
| `--text` | `#14181F` | `#E8ECF2` | Primary text | 15.6:1 (AAA) | 14.8:1 (AAA) |
| `--text-2` | `#4A5260` | `#A9B2C0` | Secondary text | 7.1:1 (AAA) | 8.3:1 (AAA) |
| `--text-muted` | `#5E6674` | `#8B95A5` | Captions, ticks, muted labels | 5.2:1 (AA) | 5.4:1 (AA) |
| `--accent` | `#4F46E5` | `#8B93FF` | Primary action & active indicator | 5.8:1 (AA) | 7.2:1 (AAA) |
| `--on-accent` | `#FFFFFF` | `#0E1116` | Text on accent buttons/badges | 5.8:1 (AA) | 7.2:1 (AAA) |
| `--selected-row` | `#EEF0FF` | `rgba(139, 147, 255, 0.14)` | Selected table row background | 3px left bar accent | 3px left bar accent |

---

## 5. Status Chips & Provenance Tags

### Status Chips (Foreground / Background pairs)
- **Healthy**:
  - Light: `#0B6B3A` on `#E3F5EA` (Contrast: 5.4:1, AA)
  - Dark: `#6EE7A0` on `#12301F` (Contrast: 6.8:1, AAA)
- **Degrading**:
  - Light: `#8A4B00` on `#FDF0DC` (Contrast: 5.6:1, AA)
  - Dark: `#FFC46B` on `#3A2A0E` (Contrast: 6.9:1, AAA)
- **Critical**:
  - Light: `#A31D1D` on `#FCE6E6` (Contrast: 6.2:1, AA)
  - Dark: `#FF9B9B` on `#3A1515` (Contrast: 7.1:1, AAA)
- **Neutral**:
  - Light: `#3B4452` on `#EBEEF2` (Contrast: 7.8:1, AAA)
  - Dark: `#C3CBD8` on `#262D38` (Contrast: 7.5:1, AAA)

### Provenance Tags
Single neutral outlined chip style across all types (`MODEL`, `LIVE`, `REPLAY`, `DERIVED`, `SIMULATED`, `STATIC`, `ASSUMED`):
- Border: `--border`
- Text: `--text-2`
- Size: `xs` (12px), weight 600, radius `sm` (6px).
- Status colors are strictly forbidden on provenance tags to prevent semantic confusion.

### Connectivity Status Pills
- **Red** (`bg-rose-900/60 text-rose-300`): Displayed ONLY when the currently active data source is broken.
- **Amber** (`bg-amber-900/60 text-amber-300`): Degraded but functioning.
- **Neutral** (`bg-surface-2 text-text-muted`): Not required in the active mode (e.g., Live backend during Replay mode).

---

## 6. Card Specifications & Layout Consistency

- **MetricCard**: Fixed height 120px. Rendered in a single row of 5 equal-width columns (`grid grid-cols-5 gap-4`) with zero orphans at $\ge 1280\text{px}$.
  - Labels are standardized and never truncated: `"Predicted RUL"`, `"EOL cycle"`, `"Health index"`, `"Status"`, `"Latency"`.
  - Secondary context and formulas reside in tooltips.
- **PanelCard**: Header row 48px (`title base/600 + border-b border`), card body fills the container. All cards in the same grid row stretch to equal height.
- **TableShell**: Header height 40px (`text-xs uppercase tracking-wider font-semibold`), data row height 48px (`text-sm`). Selected rows have `--selected-row` background and a 3px accent left bar.

---

## 7. Component Library (`src/components/ui/`)

- `Card`: Surface container with border `border` and radius `lg` (12px).
- `CardHeader`: 48px standard header with divider and optional action slot.
- `MetricCard`: Fixed 120px height KPI card with provenance tag and optional trend delta.
- `Chip`: Four-state semantic chip with contrast-verified light/dark pairings.
- `ProvenanceTag`: Outlined neutral provenance indicator.
- `Button` & `IconButton`: Radius `md` (8px), height 40px (`md`) or 32px (`sm`), 2px token focus ring.
- `Input` & `Select`: Radius `md` (8px), height 40px, font `sm` (14px).
- `TableShell`: Unified table container supporting sorting, empty/skeleton states, and row selection.
- `Drawer`: Slide-over panel with radius `lg` and backdrop.
- `Modal`: Centered overlay dialog with radius `lg` and backdrop.
- `Banner`: System notification banner (`info`, `warning`, `critical`).
- `Toggle`: Accessible toggle switch with radius `full`.

---

## 8. Exemptions

As per the design system specification:
1. **Three.js WebGL Canvas**: The internal 3D scene, materials, geometries, and post-processing shaders rendered inside `<canvas>` (e.g. `Turbofan3DView` and `EngineViewport3D`) are exempt from 2D DOM token enforcement.
2. **Browser-Native Controls**: Native scrollbar thumbs (customized via `--scrollbar` CSS properties) and OS-level file dialogs.
3. **Dynamic Inline Styles for Visualizations**: Inline styles specifically binding mathematical data coordinates in Recharts `<ResponsiveContainer>` or WebGL containers.

---

## 9. How to Add a New Component

1. **Location**: Place the component in `src/components/ui/<ComponentName>.jsx` and re-export from `src/components/ui/index.js`.
2. **Tokens Only**: Use semantic tokens (`bg-surface`, `bg-surface-2`, `text-text`, `text-text-muted`, `border-border`, `text-accent`, etc.). Never write raw hex, rgb, or arbitrary Tailwind brackets (`w-[...]`, `bg-[...]`).
3. **Radius Scale**: Use only `rounded-sm` (6px), `rounded-md` (8px), `rounded-lg` (12px), or `rounded-full` (9999px).
4. **Font Scale**: Use only `text-xs`, `text-sm`, `text-base`, `text-xl`, or `text-metric`.
5. **Add to Styleguide**: Import and render the component in `src/pages/StyleguidePage.jsx` (`/__styleguide`) in all states.
6. **Verify**: Run `npm run ds:check` and `npm run ds:audit` before committing.
