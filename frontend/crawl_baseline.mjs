import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const VIEWPORTS = [
  { width: 1280, height: 720, label: '1280x720' },
  { width: 1440, height: 900, label: '1440x900' },
  { width: 1920, height: 1080, label: '1920x1080' }
];

const THEMES = ['dark', 'light'];
const SOURCES = ['REPLAY', 'LIVE', 'SIMULATION'];

const PAGES = [
  { id: 'overview', name: 'Fleet Overview' },
  { id: 'twin', name: 'Digital Twin 3D' },
  { id: 'telemetry', name: 'Telemetry & Health' },
  { id: 'alerts', name: 'Alerts & Maintenance' },
  { id: 'model', name: 'Edge Model & Inference' },
  { id: 'sim', name: 'Simulation Lab' },
  { id: 'method', name: 'Methodology & Claims' },
  { id: 'audit', name: 'Model Audit & Governance' }
];

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
    offenders: []
  };

  const screenshotsDir = path.resolve('../.sprint/ds/screenshots_before');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  console.log('Starting Playwright baseline audit...');

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });

    for (const theme of THEMES) {
      for (const p of PAGES) {
        await page.goto(`http://localhost:5173/#/${p.id}`, { waitUntil: 'networkidle' });

        // Ensure theme
        await page.evaluate((th) => {
          if (th === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
          } else {
            document.documentElement.classList.add('light');
            document.documentElement.classList.remove('dark');
          }
        }, theme);

        await page.waitForTimeout(300);

        // Screenshot for 1440x900 and 1280x720
        if (vp.label !== '1920x1080') {
          const ssPath = path.join(screenshotsDir, `${p.id}_${theme}_${vp.label}.png`);
          await page.screenshot({ path: ssPath, fullPage: false });
        }

        // Collect computed styles
        const pageMetrics = await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('body *'));
          const data = {
            ff: [],
            fs: [],
            fw: [],
            c: [],
            bg: [],
            br: [],
            cw: [],
            ch: [],
            cp: [],
            count: elements.length,
            sampleOffenders: []
          };

          for (const el of elements) {
            const cs = window.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;

            data.ff.push(cs.fontFamily);
            data.fs.push(cs.fontSize);
            data.fw.push(cs.fontWeight);
            data.c.push(cs.color);
            data.bg.push(cs.backgroundColor);
            data.br.push(cs.borderRadius);

            // If it's a card/panel container
            if (el.className && typeof el.className === 'string' && (el.className.includes('bg-slate-900') || el.className.includes('rounded'))) {
              const rect = el.getBoundingClientRect();
              if (rect.width > 50 && rect.height > 50) {
                data.cw.push(Math.round(rect.width));
                data.ch.push(Math.round(rect.height));
                data.cp.push(cs.padding);
              }
            }
          }
          return data;
        });

        pageMetrics.ff.forEach(v => auditData.fontFamilies.add(v));
        pageMetrics.fs.forEach(v => auditData.fontSizes.add(v));
        pageMetrics.fw.forEach(v => auditData.fontWeights.add(v));
        pageMetrics.c.forEach(v => auditData.colors.add(v));
        pageMetrics.bg.forEach(v => auditData.backgroundColors.add(v));
        pageMetrics.br.forEach(v => auditData.borderRadii.add(v));
        pageMetrics.cw.forEach(v => auditData.cardWidths.add(v));
        pageMetrics.ch.forEach(v => auditData.cardHeights.add(v));
        pageMetrics.cp.forEach(v => auditData.cardPaddings.add(v));
        auditData.elementsInspected += pageMetrics.count;
      }
    }
  }

  await browser.close();

  const report = `# Baseline Style Audit (S0 Before)

- **Date/Time**: ${new Date().toISOString()}
- **Viewports Evaluated**: 1280x720, 1440x900, 1920x1080
- **Themes Evaluated**: Light, Dark
- **Total Elements Computed**: ${auditData.elementsInspected}

## Distinct Computed Value Counts
- **Distinct Font Families**: ${auditData.fontFamilies.size}
- **Distinct Font Sizes**: ${auditData.fontSizes.size}
- **Distinct Font Weights**: ${auditData.fontWeights.size}
- **Distinct Text Colors**: ${auditData.colors.size}
- **Distinct Background Colors**: ${auditData.backgroundColors.size}
- **Distinct Border Radii**: ${auditData.borderRadii.size}
- **Distinct Card Widths**: ${auditData.cardWidths.size}
- **Distinct Card Heights**: ${auditData.cardHeights.size}
- **Distinct Card Paddings**: ${auditData.cardPaddings.size}

## Observed Raw Values Sample
### Font Families:
${Array.from(auditData.fontFamilies).slice(0, 10).map(f => `- \`${f}\``).join('\n')}

### Font Sizes:
${Array.from(auditData.fontSizes).sort((a,b) => parseFloat(a)-parseFloat(b)).map(s => `- \`${s}\``).join('\n')}

### Font Weights:
${Array.from(auditData.fontWeights).sort().map(w => `- \`${w}\``).join('\n')}

### Border Radii:
${Array.from(auditData.borderRadii).slice(0, 15).map(r => `- \`${r}\``).join('\n')}

## Baseline Verdict
Excessive fragmentation in font sizes (${auditData.fontSizes.size} distinct), border radii (${auditData.borderRadii.size} distinct), text colors (${auditData.colors.size} distinct), and backgrounds (${auditData.backgroundColors.size} distinct). Card dimensions and paddings lack uniform constraints.
`;

  fs.writeFileSync('../.sprint/ds/audit_before.md', report, 'utf8');
  console.log('Saved baseline report to .sprint/ds/audit_before.md');
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
