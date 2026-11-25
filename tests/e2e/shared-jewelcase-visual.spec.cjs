const { test, expect } = require("./support/qa-evidence.cjs");
const { openRail, go } = require("./support/b2-harness.cjs");
const scene = (page) => page.getByTestId("artist-discography");
const detail = (page) => page.getByTestId("album-detail-page");
const presentation = (page) => page.getByTestId("jewel-case-presentation");
// Explicit visual profile. All pre-existing regression options remain intact.
test.use({ launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });
async function openArtist(page) {
  await openRail(page);
  await go(page, "Colección", 3);
  await page.getByRole("combobox", { name: "Buscar discos o artistas", exact: true }).fill("Vertice");
  await page.getByRole("option", { name: "Explorar artista Vértice Magnético", exact: true }).click();
  await expect(scene(page)).toBeVisible();
}

async function visibleTrackInk(page, testInfo, state = "rest") {
  const titles = presentation(page).getByTestId("jewel-case-tracklist").locator('[class*="trackTitle"]');
  await expect(titles.first()).toContainText("Órbita de papel");
  const contrasts = [];
  for (let index = 0; index < 3; index++) {
    // Read actual composited pixels, including any pointer-transparent cover.
    // DOM visibility alone cannot detect the acrylic lid occluding the TOC.
    const png = await titles.nth(index).screenshot({ path: testInfo.outputPath(`${state}-track-${index + 1}.png`) });
    const contrast = await page.evaluate(async (encoded) => {
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
      const blob = new Blob([bytes], { type: "image/png" });
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0); bitmap.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const luminance = [];
      for (let at = 0; at < pixels.length; at += 4) luminance.push(.2126 * pixels[at] + .7152 * pixels[at + 1] + .0722 * pixels[at + 2]);
      const sorted = [...luminance].sort((a, b) => a - b);
      const background = sorted[Math.floor(sorted.length / 2)];
      return luminance.filter((value) => Math.abs(value - background) > 55).length / luminance.length;
    }, png.toString("base64"));
    contrasts.push(contrast);
  }
  await testInfo.attach(`${state}-track-ink-contrast`, { body: JSON.stringify(contrasts), contentType: "application/json" });
  for (const contrast of contrasts) expect(contrast).toBeGreaterThan(.01);
}

test.describe("shared-case: interior visible en GPU normal", () => {
  // A distinct visual check uses the desktop's normal ANGLE renderer. Existing
  // regression launch flags, assertion deadlines and retries are unchanged.

  test("la tapa abierta deja visibles los nombres de pistas, además de su DOM", async ({ page }, testInfo) => {
    await openArtist(page);
    const tray = scene(page).locator("[data-batea-tray]");
    await tray.hover({ position: { x: 8, y: 28 } });
    await tray.getByRole("button", { name: /Campo magnético/ }).click();
    await expect(presentation(page)).toHaveAttribute("data-presentation", "closed");
    await detail(page).getByRole("button", { name: "Abrir caja", exact: true }).click();
    await expect(presentation(page)).toHaveAttribute("data-presentation", "open");

    await visibleTrackInk(page, testInfo);
    const border = presentation(page).getByTestId("jewel-case-close-left");
    // The left strip extends past the paper's clipped bounds. Target the
    // visible right-hand frame, as a pointer does on the actual acrylic edge.
    await border.locator("span").nth(3).hover();
    await visibleTrackInk(page, testInfo, "hover");
    await page.keyboard.press("Tab");
    await border.focus();
    await expect(border).toBeFocused();
    await visibleTrackInk(page, testInfo, "focus");

    await page.mouse.move(2, 2);
    for (const [width, height] of [[1280, 720], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      await page.screenshot({ path: testInfo.outputPath(`album-abierto-${width}x${height}.png`), animations: "disabled" });
    }
  });
});
