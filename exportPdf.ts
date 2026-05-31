/**
 * Standalone PDF export driver.
 *
 * Drives a running dev server with Puppeteer to upload a CSV, run the
 * Multi-Strategy Portfolio Dynamic Copula simulation, and trigger the
 * "Export Institutional Tear Sheet (PDF)" button. Used for ad-hoc tear
 * sheet generation outside of the browser UI.
 *
 * The dev server must already be running (`npm run dev`) on the target URL
 * before invoking this script. This script does not start it.
 *
 * Usage:
 *   npx tsx exportPdf.ts <inputCsv> [outputDir]
 *
 * Or with environment variables (CLI args take precedence):
 *   INPUT_CSV=/path/to/trades.csv OUTPUT_DIR=/path/to/output \
 *     APP_URL=http://localhost:3000 npx tsx exportPdf.ts
 *
 * Environment variables:
 *   INPUT_CSV   Absolute path to the CSV to upload (required if no CLI arg).
 *   OUTPUT_DIR  Directory the browser will use for downloads (default: cwd).
 *   APP_URL     URL the dev server is serving (default: http://localhost:3000).
 */

import puppeteer from 'puppeteer';
import path from 'path';

const DEFAULT_APP_URL = 'http://localhost:3000';

function resolveConfig() {
  const inputCsv = process.argv[2] ?? process.env.INPUT_CSV;
  const outputDir = process.argv[3] ?? process.env.OUTPUT_DIR ?? process.cwd();
  const appUrl = process.env.APP_URL ?? DEFAULT_APP_URL;

  if (!inputCsv) {
    console.error(
      'Error: input CSV path is required.\n' +
        'Usage: npx tsx exportPdf.ts <inputCsv> [outputDir]\n' +
        'Or set INPUT_CSV env var.',
    );
    process.exit(1);
  }

  return {
    inputCsv: path.resolve(inputCsv),
    outputDir: path.resolve(outputDir),
    appUrl,
  };
}

async function main() {
  const { inputCsv, outputDir, appUrl } = resolveConfig();

  console.log('Launching browser...');
  console.log(`  app URL:    ${appUrl}`);
  console.log(`  input CSV:  ${inputCsv}`);
  console.log(`  output dir: ${outputDir}`);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: outputDir,
  });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  for (let i = 0; i < 5; i++) {
    try {
      console.log(`Navigating to app... Attempt ${i + 1}`);
      await page.goto(appUrl, { waitUntil: 'networkidle0' });
      break;
    } catch {
      console.log('Navigation failed, retrying in 3s...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log('Uploading CSV...');
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.uploadFile(inputCsv);
  } else {
    console.error('Could not find file input.');
    await browser.close();
    return;
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('Selecting Multi-Strategy tab...');
  const tabs = await page.$$('button[role="tab"]');
  for (const tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text && text.includes('Multi-Strategy Portfolio')) {
      await tab.click();
      break;
    }
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('Setting Dynamic Copula mode...');
  const selects = await page.$$('select');
  for (const select of selects) {
    const html = await page.evaluate(el => el.innerHTML, select);
    if (html.includes('dynamic_copula')) {
      await page.evaluate(el => {
        (el as HTMLSelectElement).value = 'dynamic_copula';
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, select);
      break;
    }
  }

  console.log('Running simulation...');
  const buttons = await page.$$('button');
  let runBtn = null;
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('RUN SIMULATIONS')) {
      runBtn = btn;
      break;
    }
  }

  if (runBtn) {
    await runBtn.click();
  } else {
    console.log('Could not find run button.');
  }

  console.log('Waiting for simulation to finish...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('Taking screenshot...');
  await page.screenshot({ path: path.join(outputDir, 'screenshot.png') });

  console.log('Clicking Export PDF...');
  const exportBtns = await page.$$('button');
  for (const btn of exportBtns) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Export Institutional Tear Sheet (PDF)')) {
      await btn.click();
      break;
    }
  }

  console.log('Waiting for PDF to download (30s)...');
  await new Promise(resolve => setTimeout(resolve, 30000));

  await browser.close();
  console.log(`Done! PDF should be in ${outputDir}.`);
}

main().catch(console.error);
