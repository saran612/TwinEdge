import { chromium } from 'playwright';
import fs from 'node:fs';

const pages = [
  { name: 'Overview', path: '/' },
  { name: 'DigitalTwin', path: '/twin' },
  { name: 'Telemetry', path: '/telemetry' },
  { name: 'SimulationLab', path: '/simulation' },
  { name: 'EdgeModel', path: '/model' },
  { name: 'Alerts', path: '/alerts' },
  { name: 'MethodLimits', path: '/methodology' },
  { name: 'Audit', path: '/audit' },
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const report = {};

  for (const p of pages) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://localhost:5173/`, { waitUntil: 'domcontentloaded' });
    // Navigate via sidebar button or direct
    await page.evaluate((targetName) => {
      // Find nav button
      const buttons = Array.from(document.querySelectorAll('nav button'));
      const btn = buttons.find(b => b.textContent.includes(targetName));
      if (btn) btn.click();
    }, p.name);
    await page.waitForTimeout(500);

    // Inject axe-core from cdn or evaluate computed style contrast
    const contrastIssues = await page.evaluate(() => {
      function parseRgb(colorStr) {
        const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return null;
        return [Number(match[1]), Number(match[2]), Number(match[3])];
      }
      function luminance(r, g, b) {
        const a = [r, g, b].map(v => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
      }
      function contrastRatio(rgb1, rgb2) {
        const lum1 = luminance(rgb1[0], rgb1[1], rgb1[2]);
        const lum2 = luminance(rgb2[0], rgb2[1], rgb2[2]);
        const brightest = Math.max(lum1, lum2);
        const darkest = Math.min(lum1, lum2);
        return (brightest + 0.05) / (darkest + 0.05);
      }
      function getEffectiveBg(el) {
        let cur = el;
        while (cur && cur !== document.documentElement) {
          const bg = window.getComputedStyle(cur).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
            return bg;
          }
          cur = cur.parentElement;
        }
        return 'rgb(2, 6, 23)';
      }

      const elements = Array.from(document.querySelectorAll('span, button, p, h1, h2, h3, th, td, div'));
      const issues = [];
      for (const el of elements) {
        if (el.children.length > 0 && Array.from(el.childNodes).some(n => n.nodeType === 1)) continue;
        const text = el.textContent?.trim();
        if (!text || text.length > 40) continue;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
        const fg = parseRgb(style.color);
        const bg = parseRgb(getEffectiveBg(el));
        if (fg && bg) {
          const ratio = contrastRatio(fg, bg);
          if (ratio < 4.5) {
            issues.push({ text, color: style.color, bg: getEffectiveBg(el), ratio: Number(ratio.toFixed(2)) });
          }
        }
      }
      return issues;
    });

    report[p.name] = contrastIssues;
    await page.close();
  }

  fs.writeFileSync('.sprint/ui/evidence/all_pages_contrast_audit.json', JSON.stringify(report, null, 2));
  console.log('Finished auditing all pages. Report saved.');
  await browser.close();
}

run();
