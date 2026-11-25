const { test, expect, go, observeRequests, physicalToggle } = require("./support/prototype-harness.cjs");
const { openRail } = require("./support/b2-harness.cjs");

test.use({ launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });

const toggle = (page) => page.getByRole("button", { name: "Next listen", exact: true });
const overlay = (page) => page.locator("[data-rail-overlay]");
const shelf = (page) => page.locator("[data-next-listen-panel]");
const hardware = (page) => page.locator("[data-physical-deck]");
const preferredAlbum = (page) => shelf(page).getByRole("button", { name: /Frecuencia cero/ });

async function geometry(page) {
  return overlay(page).evaluate((layer) => {
    const surfaces = [...layer.querySelectorAll("[data-deck-surface]")].map((node) => node.getBoundingClientRect());
    const top = Math.min(...surfaces.map((rect) => rect.top));
    const bottom = Math.max(...surfaces.map((rect) => rect.bottom));
    const left = Math.min(...surfaces.map((rect) => rect.left));
    const right = Math.max(...surfaces.map((rect) => rect.right));
    const shelf = layer.querySelector("[data-next-listen-panel]").getBoundingClientRect();
    const footer = document.querySelector("[data-global-player]").getBoundingClientRect();
    const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
    return { top, bottom, left, right, shelfLeft: shelf.left, shelfRight: shelf.right, shelfTop: shelf.top, shelfBottom: shelf.bottom, footerTop: footer.top,
      leftSpeaker: rect('[data-speaker-side="left"]'), rightSpeaker: rect('[data-speaker-side="right"]'),
      stage: layer.getBoundingClientRect().toJSON(), listing: rect('[data-track-listing-placement] button'), next: rect('[data-deck-next-discs] button') };
  });
}

async function openListeningView(page, chapter) {
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  const listing = await page.getByRole("button", { name: "Track listing", exact: true }).boundingBox();
  const next = await toggle(page).boundingBox();
  expect(Math.abs(next.y - listing.y)).toBeLessThan(1);
  await toggle(page).click();
  await expect(shelf(page)).toBeVisible();
  await expect(overlay(page)).toHaveAttribute("data-next-listen-motion", "false");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("html")).toHaveAttribute("data-chapter", String(chapter));
  await expect(page.locator("[data-rail-ready]")).toHaveAttribute("data-rail-moving", "false");
  await expect(preferredAlbum(page)).toBeVisible();
  await expect(shelf(page).locator('[data-shelf-presentation="metal"]')).toBeVisible();
}

async function expectAligned(page) {
  const g = await geometry(page);
  expect(Math.abs(g.left - g.shelfLeft)).toBeLessThan(2);
  expect(Math.abs(g.right - g.shelfRight)).toBeLessThan(2);
  expect(g.shelfTop - g.bottom).toBeGreaterThan(35);
  expect(g.shelfBottom).toBeLessThanOrEqual(g.footerTop + 1);
  const pair = page.locator("[data-deck-speakers]");
  await expect(pair).toHaveAttribute("data-speakers-visible", "true");
  await expect(pair.locator("[data-speaker-side]")).toHaveCount(2);
  const { leftSpeaker: l, rightSpeaker: r } = g;
  expect(l.height).toBeGreaterThan(60);
  expect(l.height).toBeCloseTo(r.height, 1);
  expect(Math.abs(l.x + l.width / 2 + r.x + r.width / 2 - g.stage.width)).toBeLessThan(2);
  expect(l.left).toBeGreaterThanOrEqual(g.stage.left + 16);
  expect(r.right).toBeLessThanOrEqual(g.stage.right - 16);
  expect(l.top).toBeGreaterThanOrEqual(g.stage.top);
  expect(l.bottom).toBeLessThan(g.shelfTop - 12);
  expect(r.bottom).toBeLessThan(g.shelfTop - 12);
  expect(l.right - g.left).toBeGreaterThan(l.width * .2);
  expect(g.right - r.left).toBeGreaterThan(r.width * .2);
  expect(l.right - g.left).toBeLessThan(l.width * .75);
  expect(g.right - r.left).toBeLessThan(r.width * .75);
  const disjoint = (a, b) => a.right + 4 <= b.left || b.right + 4 <= a.left || a.bottom + 4 <= b.top || b.bottom + 4 <= a.top;
  expect(disjoint(l, g.listing) && disjoint(r, g.next)).toBe(true);
  return g;
}

async function dragListeningRack(page) {
  const rack = shelf(page).locator('[data-shelf-presentation="metal"]');
  const viewport = rack.locator('[data-shelf-viewport]');
  const auto = rack.getByRole("button", { name: "Desplazamiento automático" });
  if (await auto.isEnabled() && await auto.getAttribute("aria-pressed") === "true") await auto.click();
  const read = async () => Number(await rack.getAttribute("data-artist-cycle-offset"));
  const length = Number(await rack.getAttribute("data-artist-cycle-length"));
  const difference = (from, to) => ((to - from + length / 2) % length + length) % length - length / 2;
  const bounds = await viewport.boundingBox();
  const center = bounds.x + bounds.width / 2;
  for (const [y, dx] of [[bounds.y + 12, -80], [bounds.y + bounds.height - 14, 80]]) {
    await page.mouse.move(center, y);
    expect(await viewport.evaluate((node, point) => document.elementFromPoint(...point) === node, [center, y])).toBe(true);
    const before = await read();
    await page.mouse.down();
    await page.mouse.move(center + dx, y, { steps: 6 });
    await expect(viewport).toHaveClass(/dragging/);
    const moved = await read();
    expect(difference(before, moved)).toBeCloseTo(-dx, 0);
    await page.waitForTimeout(220);
    expect(await read()).toBe(moved);
    await page.mouse.up();
    await expect(viewport).not.toHaveClass(/dragging/);
    expect(await read()).toBe(moved);
    await expect(page.getByTestId("album-detail-page")).toHaveCount(0);
    await expect(page.locator("[data-rail-ready]")).toHaveAttribute("data-rail-moving", "false");
  }
}

test("Next listen opens the saved Batea below the same Deck, restores focus and plays through the shared album page", async ({ page }) => {
  const requests = observeRequests(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRail(page);
  await go(page, "Deck", 0);
  const before = await geometry(page);
  await hardware(page).evaluate((node) => { window.__listeningHardware = node; });
  await expect(shelf(page)).toBeHidden();
  await openListeningView(page, 0);
  expect((await expectAligned(page)).top).toBeLessThan(before.top);
  expect(await hardware(page).evaluate((node) => window.__listeningHardware === node)).toBe(true);
  const cases = await shelf(page).locator("[data-batea-album-id]").evaluateAll((nodes) => nodes.map((node) => node.dataset.bateaAlbumId));
  expect(cases.length).toBeGreaterThan(3);
  expect(new Set(cases).size).toBe(cases.length);
  expect(cases).not.toContain("mock-album-01");

  await dragListeningRack(page);

  const album = preferredAlbum(page);
  const albumId = await album.getAttribute("data-batea-album-id");
  await shelf(page).locator("[data-batea-tray]").hover({ position: { x: 10, y: 8 } });
  await album.click();
  const detail = page.getByTestId("album-detail-page");
  await expect(detail).toHaveAttribute("data-album-id", albumId);
  await expect(shelf(page)).toBeHidden();
  await detail.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(album).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(shelf(page)).toBeHidden();
  await expect(toggle(page)).toBeFocused();
  expect(requests.play).toHaveLength(0);

  await toggle(page).click();
  await shelf(page).locator("[data-batea-tray]").hover({ position: { x: 10, y: 8 } });
  await album.click();
  await page.evaluate(() => {
    window.__nextListenDocked = false;
    window.addEventListener("cdvicious:disc-flight-arrived", () => { window.__nextListenDocked = true; }, { once: true });
  });
  await detail.getByRole("button", { name: /^Reproducir / }).click();
  await expect(overlay(page).getByRole("group", { name: "Pantalla del equipo" })).toContainText("CARGANDO");
  await expect.poll(() => page.evaluate(() => window.__nextListenDocked)).toBe(true);
  await expect(overlay(page)).toHaveAttribute("data-playback-phase", "confirmed");
  await expect(page.getByTestId("rail-flying-disc")).toHaveCount(0);
  await expect(shelf(page)).toBeHidden();
  expect(requests.play).toHaveLength(1);
  await expect(page.locator("html")).toHaveAttribute("data-chapter", "0");
});

test("Next listen fits a short Split, keeps the playing track and returns to the booklet with reduced motion", async ({ page }) => {
  const requests = observeRequests(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 720 });
  await openRail(page);
  await go(page, "Split", 1);
  const booklet = page.getByTestId("lyrics-booklet");
  await expect(booklet).toBeVisible();
  const track = await booklet.getAttribute("data-track-id");
  await openListeningView(page, 1);
  await expect(booklet).toBeHidden();
  expect(await overlay(page).locator("[data-deck-mechanism]").evaluate((node) => getComputedStyle(node).transitionDuration)).toBe("0s");
  await expectAligned(page);
  await dragListeningRack(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(async () => {
    const g = await geometry(page);
    return Math.abs(g.right - g.shelfRight);
  }).toBeLessThan(2);
  await expectAligned(page);
  await preferredAlbum(page).click();
  const detail = page.getByTestId("album-detail-page");
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(preferredAlbum(page)).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-chapter", "1");
  await page.keyboard.press("Escape");
  await expect(booklet).toBeVisible();
  await expect(booklet).toHaveAttribute("data-track-id", track);
  await expect(toggle(page)).toBeFocused();
  await openListeningView(page, 1);
  await go(page, "Colección", 3);
  await expect(shelf(page)).toBeHidden();
  await go(page, "Split", 1);
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  expect(requests.play).toHaveLength(0);
});

// Full-screen normal motion, with no mock interceptors: the same pair follows
// both entries into Next Listen and never competes with the browsing shelf.
test("Next listen stereo stays with the equipment from Deck and Split, and pauses with playback", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openRail(page);
  const pair = page.locator("[data-deck-speakers]");
  await pair.evaluate(node => { window.__nextListenSpeakers = node; });
  for (const [chapter, index] of [["Deck", 0], ["Split", 1]]) {
    await go(page, chapter, index);
    const before = await pair.locator('[data-speaker-side="left"]').boundingBox();
    await openListeningView(page, index);
    await expectAligned(page);
    expect(await pair.evaluate(node => node === window.__nextListenSpeakers)).toBe(true);
    await expect(pair).toHaveAttribute("data-speaker-motion", "playing");
    await page.screenshot({ path: testInfo.outputPath(`Next-listen-${chapter}-1920x1080.png`) });
    await physicalToggle(page).click();
    await expect(pair).toHaveAttribute("data-speaker-motion", "idle");
    await expect.poll(() => pair.locator('[data-speaker-cone^="woofer"]').evaluateAll(nodes => nodes.every(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).a === 1))).toBe(true);
    await physicalToggle(page).click();
    await expect(pair).toHaveAttribute("data-speaker-motion", "playing");
    await toggle(page).click();
    await expect(shelf(page)).toBeHidden();
    await expect(overlay(page)).toHaveAttribute("data-next-listen-motion", "false");
    const after = await pair.locator('[data-speaker-side="left"]').boundingBox();
    for (const key of ["x", "y", "width", "height"]) expect(Math.abs(after[key] - before[key])).toBeLessThan(2);
  }
});
