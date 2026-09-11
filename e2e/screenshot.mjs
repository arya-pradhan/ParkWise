import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto('http://localhost:3111/detect');
await p.getByText('Model ready').waitFor({ timeout: 120000 });
await p.getByText(/\d+ of \d+ free/).waitFor({ timeout: 60000 });
await p.waitForTimeout(500);
// hover a box so the label chip shows
const cv = p.locator('canvas'); const box = await cv.boundingBox();
await p.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.62);
await p.waitForTimeout(200);
await p.screenshot({ path: process.argv[2] ?? 'e2e/_detect.png' });
await b.close();
