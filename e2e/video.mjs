/**
 * Video page E2E in headless Chromium.
 *   node e2e/video.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:3111';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

let failed = false;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};

await page.goto(`${base}/detect/video`, { waitUntil: 'domcontentloaded' });
await page.getByText('Model ready').waitFor({ timeout: 120_000 });

await page.locator('input[type=file]').setInputFiles(resolve('e2e/fixtures/lot-timelapse.webm'));
await page.getByText(/frames analyzed/).waitFor({ timeout: 180_000 });
// Wait for the walk to finish (progress overlay disappears).
await page.getByText('Cancel').waitFor({ state: 'detached', timeout: 180_000 });

const framesTxt = await page.getByText(/frames analyzed/).innerText();
const frames = Number(framesTxt.match(/(\d+) frames/)?.[1]);
check(frames >= 30, 'sampled a sensible number of frames', framesTxt);

const across = (await page.locator('aside').innerText()).replace(/\s+/g, ' ');
const mean = Number(across.match(/Mean (\d+)% full/)?.[1]);
const busiest = Number(across.match(/Busiest (\d+)%/)?.[1]);
const emptiest = Number(across.match(/Emptiest (\d+)%/)?.[1]);
check(Number.isFinite(mean) && Number.isFinite(busiest) && Number.isFinite(emptiest), 'summary stats rendered', across.slice(0, 90));
// The fixture runs empty → busy → empty, so the spread must be wide.
check(busiest - emptiest >= 40, 'occupancy varies across the clip', `emptiest ${emptiest}% → busiest ${busiest}%`);

// Chart seek: clicking the busiest point should move the video there.
const busiestTime = across.match(/Busiest \d+% at (\d+):(\d+)/);
await page.getByRole('button', { name: /^\d+% at \d+:\d+$/ }).first().click();
await page.waitForTimeout(400);
const t = await page.locator('video').evaluate((v) => v.currentTime);
const expectT = busiestTime ? Number(busiestTime[1]) * 60 + Number(busiestTime[2]) : NaN;
check(Math.abs(t - expectT) < 1.5, 'clicking a summary stat seeks the video', `t=${t.toFixed(2)} expected ~${expectT}`);

// Overlay stats at that time should read as busy.
const now = (await page.locator('aside').innerText()).replace(/\s+/g, ' ');
const pct = Number(now.match(/(\d+)% full · \d+ taken/)?.[1]);
check(pct >= 50, 'live overlay stats at busiest point', now.slice(0, 50));

// Slider re-filter must not kick off a new walk.
await page.locator('#iou').fill('0.2');
await page.waitForTimeout(300);
const stillNoCancel = (await page.getByText('Cancel').count()) === 0;
check(stillNoCancel, 'slider did not re-run analysis');

await page.screenshot({ path: process.env.SHOT ?? 'e2e/_video.png' });
const real = errors.filter((e) => !/favicon/i.test(e));
check(real.length === 0, 'no console errors', real.slice(0, 3).join(' | '));

await browser.close();
process.exit(failed ? 1 : 0);
