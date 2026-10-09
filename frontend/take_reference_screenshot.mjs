import { chromium } from '/home/saran/projects/ppt/node_modules/playwright/index.mjs';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://localhost:5174/#/telemetry', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Set slider to max
  const slider = await page.$('input[type="range"]');
  if (slider) {
    const max = await slider.getAttribute('max');
    console.log('Slider max:', max);
    await slider.fill(max || '192');
    await slider.dispatchEvent('input');
    await slider.dispatchEvent('change');
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '.sprint/chartstyle/reference.png', fullPage: true });
  console.log('Saved .sprint/chartstyle/reference.png');
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
