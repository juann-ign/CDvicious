const {
  test, expect, go, bootPrototype, collection, observeRequests, saveRecord,
} = require("./support/prototype-harness.cjs");

test.use({ viewport: { width: 1440, height: 900 }, launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });

test("Batea normal: archived drawer stays hidden, angled jewel cases open the album page and regain focus", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  // An old bookmarked prototype URL still leads to Collection.
  await bootPrototype(page, "collection-tray");
  await expect(page.getByTestId("collection-batea-prototype")).toHaveCount(0);
  await expect(collection(page).getByRole("button", { name: /Batea en Colección|Batea \(prototipo\)/i })).toHaveCount(0);
  await go(page, "Batea", 2);

  const crate = page.getByRole("region", { name: "La Batea", exact: true });
  const shelf = page.locator("[data-belt-animation-enabled]");
  const stage = crate.locator('[class*="stage"]').first();
  const cases = page.locator("button[data-batea-album-id]");
  const position = () => shelf.locator('[class*="track"]').evaluate((node) => node.style.transform);
  await expect(shelf).toHaveAttribute("data-belt-animation-enabled", "true");
  await expect(cases.first()).toBeAttached();
  const catalogueIds = await cases.evaluateAll((nodes) => nodes.map((node) => node.dataset.bateaAlbumId));
  expect(catalogueIds.slice(0, 6)).toEqual([
    "demo-vertice-album-0", "mock-album-01", "demo-satelite-album-1", "mock-album-02", "demo-inerciales-album-0", "mock-album-03",
  ]);
  expect(new Set(catalogueIds).size).toBe(21);
  await stage.hover({ position: { x: 12, y: 8 } });
  const visible = await cases.evaluateAll((nodes) => {
    const viewport = nodes[0].closest('[class*="viewport"]').getBoundingClientRect();
    return nodes.flatMap((button, index) => {
      const bounds = button.getBoundingClientRect();
      if (bounds.left < viewport.left || bounds.right > viewport.right) return [];
      const shell = button.querySelector(":scope > [aria-hidden]");
      const edge = shell.querySelector('[class*="spineFace"]');
      const style = getComputedStyle(edge);
      return [{
        index, id: button.dataset.bateaAlbumId, album: button.title,
        label: edge.textContent, width: shell.offsetWidth, height: shell.offsetHeight,
        angle: getComputedStyle(shell).transform, spineArt: style.backgroundImage,
      }];
    }).slice(0, 3);
  });
  expect(visible).toHaveLength(3);
  for (const album of visible) {
    expect(album.label).toBe(album.album);
    expect(album.width).toBeGreaterThan(150);
    expect(album.width).toBe(album.height);
    expect(album.angle).toMatch(/^matrix3d\(/);
    expect(album.spineArt).toContain("url(");
  }
  expect(new Set(visible.map((album) => album.spineArt)).size).toBe(visible.length);
  await page.screenshot({ path: testInfo.outputPath("Batea-1440x900.png") });

  const selected = visible[1];
  const source = cases.nth(selected.index);
  await source.focus();
  await expect(source).toBeFocused();
  await page.keyboard.press("Enter");
  const detail = page.getByTestId("album-detail-page");
  const presentation = detail.getByTestId("jewel-case-presentation");
  await expect(detail).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(presentation).toHaveAttribute("data-album-id", selected.id);
  await expect(presentation).toHaveAttribute("data-presentation", "closed");
  await expect(shelf).toHaveAttribute("data-belt-animation-enabled", "false");
  const pausedPosition = await position();
  await expect(crate).toBeHidden();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await position()).toBe(pausedPosition);

  await detail.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(detail).toHaveCount(0);
  await expect(source).toBeFocused();
  await expect(shelf).toHaveAttribute("data-belt-animation-enabled", "true");
  const returnedPosition = await position();
  // The restored focus keeps the belt stationary until the reader leaves it.
  await crate.getByRole("button", { name: "Página siguiente", exact: true }).focus();
  await page.mouse.move(0, 0);
  await expect.poll(position).not.toBe(returnedPosition);
  expect(requests.play).toHaveLength(0);
  await saveRecord(testInfo, "batea-cases-detail-and-focus", { visible, selected, pausedPosition, returnedPosition, resumed: await position() });
});
