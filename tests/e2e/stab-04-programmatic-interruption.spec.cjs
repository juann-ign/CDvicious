const { test, expect } = require('@playwright/test');

for (const input of ['middle', 'touch']) {
  test.describe(input + ' interrupts programmatic navigation', () => {
    test.use({ hasTouch: input === 'touch' });

    test('releases the motion gate and accepts wheel and menu afterwards', async ({ page }, testInfo) => {
      test.skip(process.env.RAIL_FLAG !== '1', 'Requires the desktop rail.');
      const samples = [];
      const wrapper = page.locator('[data-rail-wrapper]');
      const root = page.locator('[data-rail-ready="true"]');
      const sample = async (label) => samples.push({ label, ...await wrapper.evaluate(node => ({
        at: performance.now(), scroll: node.scrollLeft,
        moving: node.parentElement.dataset.railMoving,
        chapter: document.documentElement.dataset.chapter,
      })) });
      try {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await expect(root).toBeVisible({ timeout: 90000 });
        const destination = await wrapper.evaluate(node => node.firstElementChild.children[4].offsetLeft);
        await page.getByRole('button', { name: /Mixtape Lab$/ }).click();
        await expect(root).toHaveAttribute('data-rail-moving', 'true');
        await expect.poll(() => wrapper.evaluate(node => node.scrollLeft)).toBeGreaterThan(2);
        await sample('before-interruption');
        // Keep native gestures over the rail after reserving the footer height.
        const railBounds = await wrapper.boundingBox();
        const gestureY = railBounds.y + railBounds.height - 12;

        if (input === 'middle') {
          await page.mouse.click(60, gestureY, { button: 'middle' });
          // End the browser's native auto-scroll mode before testing later input.
          await page.keyboard.press('Escape');
        } else {
          const cdp = await page.context().newCDPSession(page);
          try {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: gestureY }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: gestureY }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 80, y: gestureY }] });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          } finally { await cdp.detach(); }
        }
        await sample('after-interruption');
        expect(samples.at(-1).scroll).toBeLessThan(destination - 2);
        await expect(root).toHaveAttribute('data-rail-moving', 'false');
        await sample('settled-after-interruption');

        // Native touch may coast across chapters after cancelling Lenis. Base
        // the next wheel step on its actual resting position, not chapter 0.
        const nearest = await wrapper.evaluate(node => {
          const panels = [...node.firstElementChild.children];
          return panels.reduce((best, panel, index) =>
            Math.abs(panel.offsetLeft - node.scrollLeft) < Math.abs(panels[best].offsetLeft - node.scrollLeft) ? index : best, 0);
        });
        const direction = nearest === 4 ? -1 : 1;
        const wheelTarget = nearest + direction;
        await page.getByRole('button', { name: /Mixtape Lab$/ }).hover();
        await page.mouse.wheel(0, direction * 700);
        await expect(page.getByRole('navigation').getByRole('button').nth(wheelTarget)).toHaveAttribute('aria-current', 'location');
        await expect(root).toHaveAttribute('data-rail-moving', 'false');
        await sample('after-wheel');

        const menuTarget = wheelTarget === 2 ? 1 : 2;
        await page.getByRole('button', { name: menuTarget === 1 ? /Split$/ : /Batea$/ }).click();
        await expect(page.locator('html')).toHaveAttribute('data-chapter', String(menuTarget));
        await expect(root).toHaveAttribute('data-rail-moving', 'false');
        await sample('after-menu');
      } finally {
        await testInfo.attach('interruption-public-state', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
      }
    });
  });
}
