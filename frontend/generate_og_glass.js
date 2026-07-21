import { chromium } from '@playwright/test';
import fs from 'fs';

async function main() {
  console.log('Reading dashboard image...');
  const dashboardPath = '~/Pictures/Assets/LineWatch/SEO/Dashboard.png';
  
  if (!fs.existsSync(dashboardPath)) {
    throw new Error(`Dashboard image not found at: ${dashboardPath}`);
  }

  const dashboardBase64 = fs.readFileSync(dashboardPath).toString('base64');
  
  console.log('Generating HTML template with 6px blur, dark tint, linear sheen, and SVG frosted grain texture...');
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
    background: #090d16;
    position: relative;
  }
  .blur-container {
    position: absolute;
    top: -60px;
    left: -60px;
    width: 2680px;
    height: 1560px;
    background-image: url('data:image/png;base64,${dashboardBase64}');
    background-size: 2560px 1440px;
    background-position: 60px 60px;
    background-repeat: no-repeat;
    /* Apply a realistic frosted glass blur, high saturation, and slightly reduced contrast */
    filter: blur(6px) saturate(145%) contrast(92%) brightness(88%);
  }
  .tint-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    /* Dark glassmorphic tint matching LineWatch's theme */
    background: rgba(9, 13, 22, 0.62); 
    pointer-events: none;
  }
  .sheen-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    /* Diagonal sheen simulating a light reflection on glass surface */
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 40%, rgba(0, 0, 0, 0.15) 100%);
    pointer-events: none;
  }
</style>
</head>
<body>
  <div class="blur-container"></div>
  <div class="tint-overlay"></div>
  <div class="sheen-overlay"></div>
  
  <!-- SVG noise filter to create a physical glass-grain texture -->
  <svg xmlns="http://www.w3.org/2000/svg" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0.08;">
    <filter id="glass-noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="4" stitchTiles="stitch"/>
    </filter>
    <rect width="100%" height="100%" filter="url(#glass-noise)" />
  </svg>
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
  
  const outputPath = '~/Pictures/Assets/LineWatch/SEO/Dashboard_glass.png';
  console.log(`Saving glassmorphic image to: ${outputPath}...`);
  await page.screenshot({ path: outputPath, type: 'png' });
  
  console.log('Done!');
  await browser.close();
}

main().catch((err) => {
  console.error('Error running script:', err);
  process.exit(1);
});
