import { chromium } from '@playwright/test';
import fs from 'fs';

async function main() {
  console.log('Reading dashboard image...');
  const dashboardPath = '~/Pictures/Assets/LineWatch/SEO/Dashboard.png';
  
  if (!fs.existsSync(dashboardPath)) {
    throw new Error(`Dashboard image not found at: ${dashboardPath}`);
  }

  const dashboardBase64 = fs.readFileSync(dashboardPath).toString('base64');
  
  console.log('Generating HTML template with 1.5px blur and 25% white haze overlay...');
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    width: 2560px;
    height: 1440px;
    overflow: hidden;
    background: #0d0808;
    position: relative;
  }
  .blur-container {
    width: 2640px;
    height: 1520px;
    margin-left: -40px;
    margin-top: -40px;
    background-image: url('data:image/png;base64,${dashboardBase64}');
    background-size: 2560px 1440px;
    background-position: 40px 40px; /* aligns perfectly 1:1 with the body */
    background-repeat: no-repeat;
    filter: blur(1.5px); /* very light blur for shape recognition */
  }
  .haze-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(255, 255, 255, 0.25); /* stronger white haze for frosted glass look */
    pointer-events: none;
  }
</style>
</head>
<body>
  <div class="blur-container"></div>
  <div class="haze-overlay"></div>
</body>
</html>
  `;

  console.log('Launching Playwright...');
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  console.log('Setting viewport to 2560x1440...');
  await page.setViewportSize({ width: 2560, height: 1440 });
  
  console.log('Setting page content...');
  await page.setContent(htmlContent);
  
  await page.waitForTimeout(1000); // ensure rendering finishes
  
  const outputPath = '~/Pictures/Assets/LineWatch/SEO/Dashboard_blurred.png';
  console.log(`Saving blurred/hazed image to: ${outputPath}...`);
  await page.screenshot({ path: outputPath, type: 'png' });
  
  console.log('Done!');
  await browser.close();
}

main().catch((err) => {
  console.error('Error running script:', err);
  process.exit(1);
});
