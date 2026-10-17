// Full-page screenshots of the concept page at 1440, 390 and 360 px, served
// from the same /Dar-Traffic-Monitoring/ subfolder GitHub Pages uses.
//
//   npm install --no-save puppeteer
//   node tools/screenshots.mjs [outDir]
//
// Set CHROME_PATH to use an installed Chrome instead of Puppeteer's download.
// Fails if the page logs a console error or any request returns 4xx/5xx.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// puppeteer in CI; puppeteer-core with CHROME_PATH works locally
const puppeteer = await import('puppeteer').then((m) => m.default).catch(() => import('puppeteer-core').then((m) => m.default));

const outDir = process.argv[2] ?? 'screenshots';
const port = 4321;
const base = '/Dar-Traffic-Monitoring/';
const root = fileURLToPath(new URL('..', import.meta.url));

mkdirSync(outDir, { recursive: true });
const server = spawn(process.execPath, ['tools/serve.cjs', 'site', String(port), base], { cwd: root, stdio: 'ignore' });
await new Promise((resolve) => setTimeout(resolve, 600));

const problems = [];
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox'],
});
try {
  for (const [label, width, height, mobile] of [['1440', 1440, 900, false], ['390', 390, 844, true], ['360', 360, 780, true]]) {
    const page = await browser.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') problems.push(`${label}: console: ${msg.text()}`); });
    page.on('pageerror', (err) => problems.push(`${label}: ${err.message}`));
    page.on('response', (res) => { if (res.status() >= 400) problems.push(`${label}: ${res.status()} ${res.url()}`); });
    await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
    // a fixed moment of the simulated day, so screenshots are comparable
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.goto(`http://127.0.0.1:${port}${base}`, { waitUntil: 'networkidle0' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) problems.push(`${label}: horizontal overflow ${overflow}px`);
    await page.screenshot({ path: `${outDir}/index-${label}.png`, fullPage: true });
    await page.close();
    console.log(`${label}px: saved`);
  }
} finally {
  await browser.close();
  server.kill();
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
