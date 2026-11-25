const { test, expect } = require("./support/qa-evidence.cjs");
const { collection, functionalFixture, openRail, go } = require("./support/b2-harness.cjs");

const shelf = (page) => page.getByTestId("artist-discography").locator("[data-artist-shelf]");
const editions = (page) => shelf(page).locator("button[data-batea-album-id]");
const edition = (page, index) => shelf(page).locator(`button[data-batea-album-id="artist-cycle-${index}"]`);
const navigation = (page) => page.getByRole("button", { name: "Ir al capítulo Colección", exact: true });
const covers = [["album", 27], ["single", 13], ["compilation", 3]].flatMap(([group, count]) =>
  Array.from({ length: count }, (_, index) => index === 8 ? [] : [`/images/discography/releases/${group}-${index}.webp`]).flat(),
);

async function openFixtureArtist(page, count, verifyFirstPage) {
  // Explicit catalog and no-WebGL fixtures test DOM layout, not Spotify data or
  // rendering capability. Other routes and the production shelf stay unchanged.
  await functionalFixture(page);
  const albums = Array.from({ length: count }, (_, index) => ({
    id: `artist-cycle-${index}`,
    name: `Edición ${index + 1}`,
    artists: [{ id: "demo-vertice", name: "Vértice Magnético" }],
    images: [{ url: covers[index], width: 480, height: 480 }],
    release_date: `${1980 + index}-01-01`, release_date_precision: "day", album_group: "album", album_type: "album",
    total_tracks: 6, uri: `spotify:album:artist-cycle-${index}`, artworkSource: "demo", genres: ["electronic"],
  }));
  let releaseAppend;
  let signalAppend;
  const appendGate = verifyFirstPage ? new Promise((resolve) => { releaseAppend = resolve; }) : null;
  const appendStarted = verifyFirstPage ? new Promise((resolve) => { signalAppend = resolve; }) : null;
  const catalog = verifyFirstPage ? [...albums].reverse() : albums;
  await page.route("**/api/artists/demo-vertice/albums?*", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const offset = Number(query.get("offset") || 0);
    const records = query.get("group") === "album" ? catalog : [];
    if (offset > 0 && appendGate) {
      signalAppend();
      await appendGate;
    }
    const end = offset + 20;
    await route.fulfill({ json: { items: records.slice(offset, end), total: records.length, nextOffset: end < records.length ? end : null } });
  });
  await openRail(page); await go(page, "Colección", 3);
  await page.getByRole("combobox", { name: "Buscar discos o artistas", exact: true }).fill("Vertice");
  await page.getByRole("option", { name: "Explorar artista Vértice Magnético", exact: true }).click();
  if (verifyFirstPage) {
    try { await appendStarted; await verifyFirstPage(); }
    finally { releaseAppend(); }
  }
  await expect(shelf(page)).toHaveAttribute("data-artist-edition-count", String(count));
  await expect(shelf(page)).toHaveAttribute("data-artist-shelf-layout", "cycle");
  await expect(editions(page)).toHaveCount(count);
  expect(await editions(page).evaluateAll((nodes) => nodes.map((node) => node.dataset.bateaAlbumId)))
    .toEqual(albums.map((album) => album.id));
  await navigation(page).focus(); await page.mouse.move(2, 2);
}

test.use({ viewport: { width: 1440, height: 900 } });

async function observeIntroduction(page) {
  await page.addInitScript(() => {
    window.__artistIntroduction = { first: null, changes: [], complete: false };
    const record = () => {
      const root = document.querySelector('[data-artist-shelf][data-artist-shelf-layout="cycle"]');
      if (!root || !root.dataset.artistInitialHold) return;
      const state = window.__artistIntroduction;
      if (state.complete) return;
      const first = root.querySelector('[data-artist-slot="artist-cycle-0"]');
      if (!first) return;
      const viewport = first.closest('[data-shelf-viewport]');
      const boxes = [...first.firstElementChild.firstElementChild.children].map((node) => node.getBoundingClientRect());
      const frame = viewport.getBoundingClientRect();
      const leadingEmpty = [...root.querySelectorAll('[data-artist-slot]')].every((slot) =>
        [...slot.firstElementChild.firstElementChild.children].every((node) => node.getBoundingClientRect().left >= frame.left + frame.width / 2 - 1));
      const sample = { at: performance.now(), offset: root.dataset.artistCycleOffset, visibleLeft: Math.min(...boxes.map((box) => box.left)), viewportCenter: frame.left + frame.width / 2, leadingEmpty, hold: root.dataset.artistInitialHold };
      if (!state.first && sample.hold === "true") state.first = sample;
      if (state.first && sample.offset !== state.first.offset) { state.changes.push(sample); state.complete = true; }
      else if (state.first && sample.hold === "true") state.lastQuiet = sample;
    };
    new MutationObserver(record).observe(document, { childList: true, subtree: true, attributes: true,
      attributeFilter: ["data-artist-initial-hold", "data-artist-cycle-offset"] });
  });
}

test("artist shelf: eight editions use one DOM node each and re-enter only outside the clip after the complete order", async ({ page }, testInfo) => {
  await observeIntroduction(page);
  await openFixtureArtist(page, 8);
  await expect(shelf(page)).toHaveAttribute("data-shelf-presentation", "metal");
  await expect(shelf(page)).toHaveAttribute("data-artist-drifting", "true");
  await expect.poll(() => page.evaluate(() => window.__artistIntroduction.complete)).toBe(true);
  const introduction = await page.evaluate(() => window.__artistIntroduction);
  await testInfo.attach("artist-initial-centered-hold", { body: JSON.stringify(introduction, null, 2), contentType: "application/json" });
  expect(introduction.first).not.toBeNull();
  expect(Math.abs(introduction.first.visibleLeft - introduction.first.viewportCenter)).toBeLessThan(1);
  expect(introduction.first.leadingEmpty).toBe(true);
  expect(introduction.complete).toBe(true);
  expect(introduction.changes[0].at - introduction.first.at).toBeGreaterThanOrEqual(950);
  expect(introduction.changes[0].hold).toBe("false");
  const result = await shelf(page).evaluate((root) => new Promise((resolve) => {
    const viewport = root.querySelector('[data-shelf-viewport]');
    const controls = [...root.querySelectorAll("button[data-batea-album-id]")];
    const first = controls.find((node) => node.dataset.bateaAlbumId === "artist-cycle-0");
    const visual = first.querySelector('[class*="case"]');
    const identities = [...controls];
    const seen = new Set();
    const start = performance.now();
    let previous = null, seam = null, exitAt = null;
    let minFull = Infinity, maxFull = 0, frames = 0;
    const sample = () => {
      frames++;
      const frame = viewport.getBoundingClientRect();
      const positions = controls.map((node) => ({ id: node.dataset.bateaAlbumId, box: node.querySelector('[class*="case"]').getBoundingClientRect() }));
      const visible = positions.filter(({ box }) => box.right > frame.left && box.left < frame.right);
      visible.forEach(({ id }) => seen.add(id));
      const full = positions.filter(({ box }) => box.left >= frame.left && box.right <= frame.right).length;
      if (root.dataset.artistSequence === 'cycle') minFull = Math.min(minFull, full);
      maxFull = Math.max(maxFull, full);
      const box = visual.getBoundingClientRect();
      const at = performance.now();
      if (exitAt === null && box.right <= frame.left) exitAt = at;
      if (previous && box.left - previous.left > frame.width / 2) {
        seam = { before: previous, after: { left: box.left, right: box.right }, frame: { left: frame.left, right: frame.right } };
      }
      if (seam && box.left < frame.right && box.right > frame.left) {
        return resolve({ complete: true, frames, seen: [...seen], seam, minFull, maxFull,
          gap: at - exitAt, sameNodes: identities.every((node) => node.isConnected && root.querySelector(`button[data-batea-album-id="${node.dataset.bateaAlbumId}"]`) === node),
          nodeCount: root.querySelectorAll("button[data-batea-album-id]").length });
      }
      if (at - start > 45_000) return resolve({ complete: false, frames, seen: [...seen], seam, minFull, maxFull });
      previous = { left: box.left, right: box.right };
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  await testInfo.attach("artist-single-node-cycle", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  expect(result.complete).toBe(true);
  expect(result.nodeCount).toBe(8);
  expect(result.sameNodes).toBe(true);
  expect(new Set(result.seen).size).toBe(8);
  expect(result.seen).toEqual(Array.from({length:8},(_,index)=>`artist-cycle-${index}`));
  expect(result.seam.before.right).toBeLessThanOrEqual(result.seam.frame.left);
  expect(result.seam.after.left).toBeGreaterThanOrEqual(result.seam.frame.right);
  expect(result.gap).toBeGreaterThanOrEqual(1_500);
  expect(result.minFull).toBeGreaterThanOrEqual(4);
  expect(result.maxFull).toBeLessThanOrEqual(7);

  const current = shelf(page).locator('button[data-batea-album-id][tabindex="0"]');
  await current.focus();
  await expect(shelf(page)).toHaveAttribute("data-artist-drifting", "false");
  const paused = await shelf(page).getAttribute("data-artist-cycle-offset");
  await page.waitForTimeout(220);
  expect(await shelf(page).getAttribute("data-artist-cycle-offset")).toBe(paused);
  await navigation(page).focus(); await page.mouse.move(2, 2);
  await expect(shelf(page)).toHaveAttribute("data-artist-drifting", "true");

  // Use the empty floor beneath the cases so dragging cannot open a detail.
  const viewport = shelf(page).locator('[data-shelf-viewport]');
  const box = await viewport.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 23);
  const beforeDrag = Number(await shelf(page).getAttribute("data-artist-cycle-offset"));
  const length = Number(await shelf(page).getAttribute("data-artist-cycle-length"));
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 - 85, box.y + box.height - 23, { steps: 6 });
  await expect(shelf(page)).toHaveAttribute("data-artist-drifting", "false");
  await expect(viewport).toHaveClass(/dragging/);
  const moved = Number(await shelf(page).getAttribute("data-artist-cycle-offset"));
  expect(((moved - beforeDrag) % length + length) % length).toBeCloseTo(85, 0);
  await page.waitForTimeout(220);
  expect(Number(await shelf(page).getAttribute("data-artist-cycle-offset"))).toBe(moved);
  await page.mouse.up();
  await expect(viewport).not.toHaveClass(/dragging/);
  expect(Number(await shelf(page).getAttribute("data-artist-cycle-offset"))).toBe(moved);
  await expect(page.getByTestId("album-detail-page")).toHaveCount(0);
  await navigation(page).focus(); await page.mouse.move(2, 2);
  await expect(shelf(page)).toHaveAttribute("data-artist-drifting", "true");
});

test("artist shelf: paginated catalog starts on the oldest edition and preserves position through resize and detail return", async ({ page }, testInfo) => {
  await observeIntroduction(page);
  const geometry = () => edition(page, 0).evaluate((node) => {
    const slot = node.closest("[data-artist-slot]");
    const viewport = node.closest('[data-shelf-viewport]');
    return { x: slot.getBoundingClientRect().left - viewport.getBoundingClientRect().left, width: viewport.clientWidth };
  });
  await openFixtureArtist(page, 40, async () => {
    await expect(shelf(page)).toHaveCount(0);
    await expect(page.getByTestId("artist-discography").getByRole("status")).toHaveText("Cargando discos…");
  });
  await expect.poll(() => page.evaluate(() => window.__artistIntroduction.complete)).toBe(true);
  const first = await page.evaluate(() => window.__artistIntroduction.first);
  expect(first).not.toBeNull();
  expect(Math.abs(first.visibleLeft - first.viewportCenter)).toBeLessThan(2);
  expect(first.leadingEmpty).toBe(true);
  await expect(shelf(page)).toHaveAttribute("data-artist-initial-hold", "false");
  await expect(shelf(page)).toHaveAttribute("data-artist-initial-hold-remaining", "0");
  await shelf(page).getByRole("button", { name: "Desplazamiento automático", exact: true }).click();
  await expect(shelf(page)).toHaveAttribute("data-artist-drifting", "false");
  const beforeResize = await geometry();
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect.poll(async () => (await geometry()).width).toBeLessThan(beforeResize.width);
  await expect(page.locator("html")).toHaveAttribute("data-chapter", "3");
  await expect(page.locator("[data-rail-wrapper]").locator("..")).toHaveAttribute("data-rail-moving", "false");
  const resized = await geometry();
  expect(Math.abs(resized.x / resized.width - beforeResize.x / beforeResize.width)).toBeLessThan(.002);
  await expect(shelf(page)).toHaveAttribute("data-artist-initial-hold", "false");
  const source = edition(page, 0);
  await expect(source).toBeInViewport();
  await source.focus(); await source.press("Enter");
  const detail = page.getByTestId("album-detail-page");
  await expect(detail).toHaveAttribute("data-album-id", "artist-cycle-0");
  await detail.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(source).toBeFocused();
  const returned = await geometry();
  expect(Math.abs(returned.x - resized.x)).toBeLessThan(1);
  await expect(shelf(page)).toHaveAttribute("data-artist-initial-hold", "false");
  await shelf(page).getByRole("button", { name: "Desplazamiento automático", exact: true }).click();
  await navigation(page).focus(); await page.mouse.move(2, 2);
  await expect(shelf(page)).toHaveAttribute("data-artist-drifting", "true");
  const offset = await shelf(page).getAttribute("data-artist-cycle-offset");
  await expect.poll(() => shelf(page).getAttribute("data-artist-cycle-offset")).not.toBe(offset);
  await testInfo.attach("artist-continuous-lifecycle", { body: JSON.stringify({ first, beforeResize, resized, returned }, null, 2), contentType: "application/json" });
});

test("artist shelf: forty paginated editions stay unique with reduced motion and keyboard focus returns to the same source", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const playRequests = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/play") playRequests.push(request.url()); });
  await openFixtureArtist(page, 40);
  await expect(shelf(page)).toHaveAttribute("data-artist-reduced-motion", "true");
  await expect(shelf(page)).toHaveAttribute("data-artist-drifting", "false");
  await expect(shelf(page).getByRole("tab", { name: "Página 1", exact: true })).toHaveAttribute("aria-selected", "true");
  const offset = await shelf(page).getAttribute("data-artist-cycle-offset");
  await page.waitForTimeout(220);
  expect(await shelf(page).getAttribute("data-artist-cycle-offset")).toBe(offset);
  await editions(page).first().focus();
  await page.keyboard.press("End");
  const last = edition(page, 39);
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await expect(page.locator("[data-batea-flyout]")).toContainText("Edición 40");
  await last.press("ArrowLeft");
  const source = edition(page, 38);
  await expect(source).toBeFocused();
  await expect(source).toBeInViewport();
  const original = await source.evaluate((node) => {
    window.__artistCycleSource = node;
    return { id: node.dataset.bateaAlbumId, offset: node.closest("[data-artist-shelf]").dataset.artistCycleOffset };
  });
  await source.press("Enter");
  const detail = page.getByTestId("album-detail-page");
  await expect(detail).toHaveAttribute("data-album-id", original.id);
  await detail.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(detail).toHaveCount(0);
  await expect(source).toBeFocused();
  expect(await source.evaluate((node) => node === window.__artistCycleSource)).toBe(true);
  expect(await shelf(page).getAttribute("data-artist-cycle-offset")).toBe(original.offset);
  expect(await source.evaluate((node) => node.closest('[data-shelf-viewport]').scrollLeft)).toBe(0);
  await page.keyboard.press("Home");
  await expect(edition(page, 0)).toBeFocused();
  await expect(edition(page, 0)).toBeInViewport();
  expect(playRequests).toEqual([]);
  await testInfo.attach("artist-forty-editions", { body: JSON.stringify({ ids: await editions(page).evaluateAll((nodes) => nodes.map((node) => node.dataset.bateaAlbumId)), returned: original }, null, 2), contentType: "application/json" });
});
