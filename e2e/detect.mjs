/**
 * End-to-end check in headless Chromium.
 *
 *   node e2e/detect.mjs [baseUrl]
 *
 * Exits non-zero on any failure. Verifies:
 *   1. the document is cross-origin isolated (COOP/COEP headers took effect)
 *   2. /debug/parity reports PASS — the full browser path matches PyTorch
 *   3. /detect auto-loads a sample and renders real counts
 *   4. no console errors on either page
 */
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:3111';
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

let failed = false;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};

// ── 1. isolation ─────────────────────────────────────────────────────────────
await page.goto(`${base}/detect`, { waitUntil: 'domcontentloaded' });
const isolated = await page.evaluate(() => globalThis.crossOriginIsolated);
check(isolated === true, 'crossOriginIsolated', String(isolated));

// ── 2. parity ────────────────────────────────────────────────────────────────
await page.goto(`${base}/debug/parity`, { waitUntil: 'domcontentloaded' });
const report = page.locator('[data-testid="parity-report"]');
await report.waitFor({ timeout: 120_000 });
const pass = await report.getAttribute('data-pass');
const headline = (await page.locator('[data-testid="parity-report"] p').first().innerText()).replace(/\s+/g, ' ');
check(pass === 'true', 'browser/PyTorch parity', headline);

if (pass !== 'true') {
  const bad = await page.locator('tbody tr').evaluateAll((rows) =>
    rows.filter((r) => r.style.color).map((r) => r.innerText.replace(/\s+/g, ' ')).slice(0, 10),
  );
  for (const b of bad) console.log('   ✗', b);
}

// ── 3. detect page ───────────────────────────────────────────────────────────
await page.goto(`${base}/detect`, { waitUntil: 'domcontentloaded' });
await page.getByText('Model ready').waitFor({ timeout: 120_000 });
// The bootstrapped sample is example-full: Python reference says 20 occupied /
// 8 open. Canvas resampling can move a borderline box across the threshold,
// so assert a sane busy-lot result rather than the exact Python count — exact
// parity is the /debug/parity page's job, on its fixture image.
await page.getByText(/\d+ of \d+ free/).waitFor({ timeout: 60_000 });
const stat = (await page.locator('aside').innerText()).replace(/\s+/g, ' ');
const m = stat.match(/(\d+) of (\d+) free (\d+)% full/);
const [open, total, pct] = m ? m.slice(1).map(Number) : [NaN, NaN, NaN];
check(
  m !== null && total >= 24 && total <= 32 && open >= 6 && open <= 10 && pct >= 60,
  'auto-loaded sample reads as a busy lot',
  stat.slice(0, 60),
);
const baseline = stat.slice(0, 30);

// Slider re-filter must not re-run the model: watch the inference badge stay put.
const before = await page.getByText(/Last inference/).innerText();
await page.locator('#conf').fill('0.6');
await page.waitForTimeout(150);
const after = await page.getByText(/Last inference/).innerText();
const hiStat = (await page.locator('aside').innerText()).replace(/\s+/g, ' ');
check(before === after, 'slider did not re-run inference', `${before} → ${after}`);
check(!hiStat.startsWith(baseline), 'slider changed the counts', hiStat.slice(0, 60));

// ── 4. console ───────────────────────────────────────────────────────────────
const real = errors.filter((e) => !/favicon/i.test(e));
check(real.length === 0, 'no console errors', real.slice(0, 3).join(' | '));

await browser.close();
process.exit(failed ? 1 : 0);
