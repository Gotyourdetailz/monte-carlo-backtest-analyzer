const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
    }
  });
  
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.toString());
  });

  await page.goto('http://localhost:3000/');
  
  // Try to generate PDF with empty results (or whatever we can do)
  // Actually, wait, without uploading a CSV, we can't export.
  // We can just evaluate the exportToVectorPDF function directly!
  
  await page.evaluate(async () => {
    try {
      const { exportToVectorPDF } = await import('./src/reportGenerator.tsx');
      
      const dummyResults = {
        nSimulations: 100,
        runMeta: { dataFormat: 'absolute', nTrades: 50 },
        institutionalMetrics: { medianFinalBalance: 1000, medianMaxDrawdown: 0.1, cvar95: 50 },
        ruinProbability: 0.01
      };
      
      await exportToVectorPDF(['basic'], { basic: dummyResults });
    } catch (err) {
      console.error('EVAL ERROR:', err.message, err.stack);
    }
  });

  await browser.close();
})();
