const {
  test, expect, go, bootPrototype, collection, observeRequests, saveRecord,
} = require("./support/prototype-harness.cjs");
const mockCollection = require("../../src/mocks/collection.json");

test.use({ viewport: { width: 1440, height: 900 }, launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });

test("Batea normal: archived drawer stays hidden, angled jewel cases open the album page and regain focus", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  // An old bookmarked prototype URL still leads to Collection.
  await bootPrototype(page, "collection-tray");
  await expect(page.getByTestId("collection-batea-prototype")).toHaveCount(0);
  await expect(collection(page).getByRole("button", { name: /Batea en Colección|Batea \(prototipo\)/i })).toHaveCount(0);
  await go(page, "Batea", 2);

  const crate = page.getByRole("region", { name: "La Batea", exact: true });
  const shelf = page.locator("[data-batea-animation-enabled] [data-belt-animation-enabled]");
  const stage = crate.locator("[data-batea-tray]");
  const cases = shelf.locator("button[data-batea-album-id]");
  const position = () => shelf.locator('[class*="track"]').evaluate((node) => node.style.transform);
  await expect(shelf).toHaveAttribute("data-belt-animation-enabled", "true");
  await expect(shelf).toHaveAttribute("data-shelf-presentation", "metal");
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
    expect(album.label.trim()).toBe("");
    const fixture = mockCollection.find(({ id }) => id === album.id);
    await expect(cases.nth(album.index)).toHaveAccessibleName(`${fixture.artists.map(({ name }) => name).join(", ")} — ${fixture.name}`);
    expect(album.width).toBeGreaterThan(150);
    expect(album.width).toBe(album.height);
    expect(album.angle).toMatch(/^matrix3d\(/);
    expect(album.spineArt).toContain("url(");
  }
  expect(new Set(visible.map((album) => album.spineArt)).size).toBe(visible.length);
  await page.screenshot({ path: testInfo.outputPath("Batea-1440x900.png") });

  const selected = visible[1];
  const source = cases.nth(selected.index);
  const casePose = () => cases.evaluateAll((nodes, index) => nodes.slice(index - 1, index + 2).map((button) => {
    const slot = button.getBoundingClientRect();
    const acrylic = button.querySelector(":scope > [aria-hidden]").getBoundingClientRect();
    return { slotX: slot.left, center: (acrylic.left + acrylic.right) / 2, width: acrylic.width };
  }), selected.index);
  const resting = await casePose();
  await source.hover();
  const flyout = page.locator("[data-batea-flyout]");
  await expect(flyout).toBeVisible();
  const album = mockCollection.find(({ id }) => id === selected.id);
  await expect(flyout.getByText(album.name, { exact: true })).toBeVisible();
  await expect(flyout.getByText(album.artists.map(({ name }) => name).join(", "), { exact: true })).toBeVisible();
  await expect(flyout.locator("time")).toHaveText(album.release_date.slice(0, 4));
  await expect.poll(async () => {
    const pose = await casePose();
    return pose[1].width - resting[1].width;
  }).toBeGreaterThan(20);
  const hovered = await casePose();
  expect(hovered.map(({ slotX }) => slotX)).toEqual(resting.map(({ slotX }) => slotX));
  expect(hovered[0].center).toBeLessThan(resting[0].center - 5);
  expect(hovered[2].center).toBeGreaterThan(resting[2].center + 5);
  await page.screenshot({ path: testInfo.outputPath("Batea-ficha-1440x900.png") });

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
  await saveRecord(testInfo, "batea-cases-detail-and-focus", { visible, selected, resting, hovered, pausedPosition, returnedPosition, resumed: await position() });
});

test("Batea grips follow the held mouse across the seam and release the chapter rail", async ({ page }, testInfo) => {
  await page.goto("/?chapter=batea", { waitUntil: "domcontentloaded" });
  const rail = page.locator('[data-rail-ready="true"]');
  await expect(rail).toHaveAttribute("data-chapter", "2", { timeout: 90000 });
  const crate = page.getByRole("region", { name: "La Batea", exact: true });
  const shelf = crate.locator('[data-shelf-chapter="2"]');
  const stage = shelf.locator("[data-batea-tray]");
  const viewport = stage.locator('[class*="viewport"]');
  const track = stage.locator('[class*="track"]');
  await expect(stage).toBeVisible();
  await expect(shelf).toHaveAttribute("data-belt-animation-enabled", "true");
  const toggle = shelf.getByRole("button", { name: "Desplazamiento automático" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await shelf.getByRole("tab").first().click();

  const read = () => track.evaluate((node) => ({
    x: new DOMMatrixReadOnly(getComputedStyle(node).transform).m41,
    length: node.firstElementChild.offsetWidth + parseFloat(getComputedStyle(node).columnGap),
  }));
  const distance = (from, to) => {
    const length = from.length;
    return ((to.x - from.x + length / 2) % length + length) % length - length / 2;
  };
  await expect.poll(async () => {
    const { x, length } = await read();
    return Math.min(Math.abs(x), Math.abs(length + x));
  }).toBeLessThan(0.01);

  const bounds = await stage.boundingBox();
  const center = bounds.x + bounds.width / 2;
  const observations = [];
  for (const [y, dx, releaseY] of [
    [bounds.y + 22, 180, bounds.y - 20],
    [bounds.y + bounds.height - 24, -220, bounds.y + bounds.height + 20],
  ]) {
    await page.mouse.move(center, y);
    expect(await viewport.evaluate((node, point) => document.elementFromPoint(...point) === node, [center, y])).toBe(true);
    const before = await read();
    await page.mouse.down();
    await page.mouse.move(center + dx, y, { steps: 8 });
    await expect(viewport).toHaveClass(/dragging/);
    const moved = await read();
    expect(distance(before, moved)).toBeCloseTo(dx, 0);
    await page.waitForTimeout(250);
    const held = await read();
    expect(distance(moved, held)).toBeCloseTo(0, 2);
    await page.mouse.move(center + dx, releaseY);
    await page.mouse.up();
    await expect(viewport).not.toHaveClass(/dragging/);
    await page.waitForTimeout(250);
    const released = await read();
    expect(distance(held, released)).toBeCloseTo(0, 2);
    await expect(page.getByTestId("album-detail-page")).toHaveCount(0);
    observations.push({ dx, before, moved, held, released });
  }
  // Both gestures cross the copy boundary, not the visible end of a fixed list.
  expect(observations[0].released.x).toBeLessThan(-observations[0].before.length / 2);
  expect(observations[1].released.x).toBeGreaterThan(-100);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(center, bounds.y - 50);
  const resumed = await read();
  await expect.poll(async () => distance(resumed, await read())).toBeLessThan(-10);
  await page.mouse.wheel(0, 700);
  await expect(rail).toHaveAttribute("data-chapter", "3", { timeout: 12000 });
  await saveRecord(testInfo, "batea-grip-drag", observations);
});
