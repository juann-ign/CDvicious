const {
  test, expect, bootPrototype, title, canonicalState, observeRequests, saveRecord,
  threeCanvas, startRepresentationProbe, finishRepresentationProbe,
} = require("./support/historical-disc-harness.cjs");

// Worker options belong at file scope. This is an explicit native-browser
// capability fixture; getContext and provider APIs are never intercepted.
test.use({ viewport: { width: 1440, height: 900 }, launchOptions: { args: ["--disable-webgl", "--disable-webgl2"] } });

test("without real WebGL the free CD is a static honest fallback and docking preserves playback", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  await bootPrototype(page, "deck-lift");
  expect(await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  })).toBe(false);
  const before = await canonicalState(page);
  await startRepresentationProbe(page);
  await page.getByRole("button", { name: "Elevar CD del equipo", exact: true }).click();
  await expect(page.locator("[data-physical-deck]")).toHaveAttribute("data-disc-state", "free");
  await expect(threeCanvas(page)).toHaveCount(0);
  await expect(page.locator("[data-deck-disc-target]")).toHaveAttribute("data-historical-disc-status", "unavailable");
  await expect(page.locator("[data-deck-disc-target]")).toHaveAttribute("data-disc-representation", "css");
  await expect(page.locator("[data-physical-deck]").getByText("Vista estática · 3D no disponible", { exact: true })).toBeVisible();
  const elevated = page.getByRole("group", { name: "CD elevado", exact: true });
  await expect(elevated).toBeVisible();
  const beforeTransform = await elevated.evaluate((node) => getComputedStyle(node).transform);
  const box = await elevated.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 - 40, { steps: 8 });
  await page.mouse.up();
  await expect(elevated).not.toHaveAttribute("data-disc-dragging", "true");
  expect(await elevated.evaluate((node) => getComputedStyle(node).transform)).toBe(beforeTransform);
  await page.getByRole("button", { name: "Acoplar CD al equipo", exact: true }).click();
  await expect(page.locator("[data-physical-deck]")).toHaveAttribute("data-disc-state", "docked");
  await expect(title(page)).toHaveText(before.title);
  expect((await canonicalState(page)).playing).toBe(before.playing);
  expect(requests.play).toHaveLength(0);
  const representations = await finishRepresentationProbe(page);
  await saveRecord(testInfo, "actual-no-webgl-static-fallback", { before, after: await canonicalState(page), representations });
});
