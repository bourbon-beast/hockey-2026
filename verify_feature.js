import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ recordVideo: { dir: '/home/jules/verification' } });
  const page = await context.newPage();

  // Navigate to app
  await page.goto('http://localhost:5173/');

  // Mock authenticated session
  await page.evaluate(() => {
    localStorage.setItem('mhc_admin_session', 'dummy');
  });
  await page.reload();

  // Wait for load
  await page.waitForTimeout(2000);

  // Take a screenshot of the main page where teams should be rendered
  await page.screenshot({ path: '/home/jules/verification/verification.png' });
  await context.close();
  await browser.close();
  console.log("Verification script complete.");
})();
