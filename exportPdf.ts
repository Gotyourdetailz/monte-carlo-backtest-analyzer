import puppeteer from 'puppeteer';
import path from 'path';

async function main() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  const downloadPath = path.resolve('C:\\Users\\demir\\antigravity\\Monte-Carlo-Backtest-Analyzer');
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadPath,
  });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  for (let i = 0; i < 5; i++) {
    try {
      console.log(`Navigating to app... Attempt ${i+1}`);
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
      break;
    } catch (err) {
      console.log(`Navigation failed, retrying in 3s...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log("Uploading CSV...");
  const filePath = "C:\\Users\\demir\\OneDrive\\Documents\\NinjaTrader Grid 2026-04-08 10-41 PM.csv";
  
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) {
    await fileInput.uploadFile(filePath);
  } else {
    console.error("Could not find file input.");
    await browser.close();
    return;
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log("Selecting Multi-Strategy tab...");
  const tabs = await page.$$('button[role="tab"]');
  for (const tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text && text.includes('Multi-Strategy Portfolio')) {
      await tab.click();
      break;
    }
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log("Setting Dynamic Copula mode...");
  const selects = await page.$$('select');
  for (const select of selects) {
    const html = await page.evaluate(el => el.innerHTML, select);
    if (html.includes('dynamic_copula')) {
      await page.evaluate(el => {
        el.value = 'dynamic_copula';
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, select);
      break;
    }
  }

  console.log("Running simulation...");
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
    console.log("Could not find run button.");
  }

  console.log("Waiting for simulation to finish...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log("Taking screenshot...");
  await page.screenshot({ path: 'screenshot.png' });

  console.log("Clicking Export PDF...");
  const exportBtns = await page.$$('button');
  for (const btn of exportBtns) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text && text.includes('Export Institutional Tear Sheet (PDF)')) {
      await btn.click();
      break;
    }
  }

  console.log("Waiting for PDF to download (30s)...");
  await new Promise(resolve => setTimeout(resolve, 30000));

  await browser.close();
  console.log("Done! PDF should be in the directory.");
}

main().catch(console.error);
