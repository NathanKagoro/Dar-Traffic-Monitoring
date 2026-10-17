// Renders tools/og.html to site/og.png (1200x630), the social preview image.
//   npm install --no-save puppeteer   (or puppeteer-core with CHROME_PATH)
//   node tools/og.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const puppeteer = await import('puppeteer').then((m) => m.default).catch(() => import('puppeteer-core').then((m) => m.default));
const root = fileURLToPath(new URL('..', import.meta.url));
const port = 4322;
const server = spawn(process.execPath, ['tools/serve.cjs', '.', String(port)], { cwd: root, stdio: 'ignore' });
await new Promise((resolve) => setTimeout(resolve, 600));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/tools/og.html`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('body[data-ready]');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${root}site/og.png`, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log('wrote site/og.png');
} finally {
  await browser.close();
  server.kill();
}
