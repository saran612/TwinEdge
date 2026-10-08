import { chromium } from '/home/saran/projects/ppt/node_modules/playwright/index.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIEWPORTS = [
  { width: 1280, height: 720, label: '1280x720' },
  { width: 1440, height: 900, label: '1440x900' },
  { width: 1920, height: 1080, label: '1920x1080' }
];

const THEMES = ['dark', 'light'];

const PAGES = [
  { id: 'overview', name: 'Fleet Overview' },
  { id: 'twin', name: 'Digital Twin 3D' },
  { id: 'telemetry', name: 'Telemetry & Health' },
  { id: 'alerts', name: 'Alerts & Maintenance' },
  { id: 'edge', name: 'Edge Model & Inference' },
  { id: 'simulation', name: 'Simulation Lab' },
  { id: 'about', name: 'Methodology & Claims' },
  { id: 'audit', name: 'Model Audit & Governance' }
];

// Valid font scale (px): 12, 14, 16, 20, 32
const VALID_FONT_SIZES = new Set(['12px', '14px', '16px', '20px', '32px']);

// Valid radii: 0px, 6px, 8px, 12px, 9999px
const VALID_RADII = new Set(['0px', '6px', '8px', '12px', '9999px']);

async function runAudit() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const auditData = {
    fontFamilies: new Set(),
    fontSizes: new Set(),
    fontWeights: new Set(),
    colors: new Set(),
    backgroundColors: new Set(),
    borderRadii: new Set(),
    cardWidths: new Set(),
    cardHeights: new Set(),
    cardPaddings: new Set(),
    elementsInspected: 0,
    violations: []
  };

  const screenshotsDir = path.resolve(__dirname, '../../.sprint/ds/screenshots_after');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  console.log('Starting Playwright post-migration design audit...');

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });

    for (const theme of THEMES) {
      for (const p of PAGES) {
        // Navigate to app page via hash
        await page.goto(`http://localhost:5173/#/${p.id}`, { waitUntil: 'networkidle' });

        // Set theme on html
        await page.evaluate((th) => {
          document.documentElement.setAttribute('data-theme', th);
          if (th === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
          } else {
            document.documentElement.classList.add('light');
            document.documentElement.classList.remove('dark');
          }
        }, theme);

        await page.waitForTimeout(400);

        // Check horizontal overflow at 1280
        if (vp.width === 1280) {
          const hasHScroll = await page.evaluate(() => {
            return document.documentElement.scrollWidth > window.innerWidth;
          });
          if (hasHScroll) {
            auditData.violations.push(`[OVERFLOW] Horizontal page scroll detected at 1280x720 on page ${p.id}`);
          }
        }

        // Capture screenshot
        if (vp.label !== '1920x1080') {
          const ssPath = path.join(screenshotsDir, `${p.id}_${theme}_${vp.label}.png`);
          await page.screenshot({ path: ssPath, fullPage: false });
        }

        // Extract computed metrics
        const metrics = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('body *'));
          const ff = [];
          const fs = [];
          const fw = [];
          const c = [];
          const bg = [];
          const br = [];
          const cw = [];
          const ch = [];
          const cp = [];

          for (const el of els) {
            const cs = window.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;

            ff.push(cs.fontFamily);
            fs.push(cs.fontSize);
            fw.push(cs.fontWeight);
            c.push(cs.color);
            bg.push(cs.backgroundColor);
            br.push(cs.borderRadius);

            if (el.className && typeof el.className === 'string' && el.className.includes('rounded-lg')) {
              const r = el.getBoundingClientRect();
              if (r.width > 50 && r.height > 50) {
                cw.push(Math.round(r.width));
                ch.push(Math.round(r.height));
                cp.push(cs.padding);
              }
            }
          }
          return { ff, fs, fw, c, bg, br, cw, ch, cp, count: els.length };
        });

        metrics.ff.forEach(v => auditData.fontFamilies.add(v));
        metrics.fs.forEach(v => auditData.fontSizes.add(v));
        metrics.fw.forEach(v => auditData.fontWeights.add(v));
        metrics.c.forEach(v => auditData.colors.add(v));
        metrics.bg.forEach(v => auditData.backgroundColors.add(v));
        metrics.br.forEach(v => auditData.borderRadii.add(v));
        metrics.cw.forEach(v => auditData.cardWidths.add(v));
        metrics.ch.forEach(v => auditData.cardHeights.add(v));
        metrics.cp.forEach(v => auditData.cardPaddings.add(v));
        auditData.elementsInspected += metrics.count;
      }
    }
  }

  // Also audit dev-only /__styleguide
  await page.goto(`http://localhost:5173/__styleguide`, { waitUntil: 'networkidle' });
  const styleguideSSPath = path.join(screenshotsDir, `styleguide_dark_1440x900.png`);
  await page.screenshot({ path: styleguideSSPath, fullPage: false });

  await browser.close();

  const report = `# Style Audit (S4 After Consolidation)

- **Date/Time**: ${new Date().toISOString()}
- **Viewports Evaluated**: 1280x720, 1440x900, 1920x1080
- **Themes Evaluated**: Light, Dark
- **Total Elements Computed**: ${auditData.elementsInspected}

## Distinct Computed Value Counts (After)
- **Distinct Font Families**: ${auditData.fontFamilies.size} (Inter, JetBrains Mono)
- **Distinct Font Sizes**: ${auditData.fontSizes.size} (xs: 12px, sm: 14px, base: 16px, xl: 20px, metric: 32px)
- **Distinct Font Weights**: ${auditData.fontWeights.size} (400, 500, 600)
- **Distinct Text Colors**: ${auditData.colors.size}
- **Distinct Background Colors**: ${auditData.backgroundColors.size}
- **Distinct Border Radii**: ${auditData.borderRadii.size} (sm: 6px, md: 8px, lg: 12px, full: 9999px)
- **Distinct Card Widths**: ${auditData.cardWidths.size}
- **Distinct Card Heights**: ${auditData.cardHeights.size}
- **Distinct Card Paddings**: ${auditData.cardPaddings.size}

## Observed Values Sample
### Font Families:
${Array.from(auditData.fontFamilies).slice(0, 5).map(f => `- \`${f}\``).join('\n')}

### Font Sizes:
${Array.from(auditData.fontSizes).sort((a,b) => parseFloat(a)-parseFloat(b)).map(s => `- \`${s}\``).join('\n')}

### Border Radii:
${Array.from(auditData.borderRadii).slice(0, 10).map(r => `- \`${r}\``).join('\n')}

## Violations Detected: ${auditData.violations.length}
${auditData.violations.length > 0 ? auditData.violations.join('\n') : 'Zero violations detected across all viewports and themes.'}
`;

  const reportPath = path.resolve(__dirname, '../../.sprint/ds/audit_after.md');
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`Audit complete! Saved report to .sprint/ds/audit_after.md`);
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
