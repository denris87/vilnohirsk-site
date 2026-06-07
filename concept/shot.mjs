// Рендер концепт-колажу у PNG.
// Запуск:  npm i -D playwright && npx playwright install chromium && node concept/shot.mjs
import { chromium } from 'playwright';
import path from 'node:path';

const file = 'file://' + path.resolve('concept/ios-app-concept.html');
const out = path.resolve('concept/ios-app-concept.png');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1700, height: 1180 }, deviceScaleFactor: 2 });
await page.goto(file, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await (await page.$('#stage')).screenshot({ path: out });
await browser.close();
console.log('saved', out);
