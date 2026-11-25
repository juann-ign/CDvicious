const { test, expect } = require("./support/qa-evidence.cjs");
const { functionalFixture, go } = require("./support/b2-harness.cjs");

const collection = (page) => page.getByRole("region", { name: "La Colección", exact: true });
const view = (page) => page.getByTestId("artist-discography");
const scene = (page) => page.getByTestId("artist-disc-scene");
const detail = (page) => page.getByTestId("album-detail-page");
const presentation = (page) => page.getByTestId("jewel-case-presentation");
const selected = (page) => page.getByTestId("artist-selected-case");
const position = (page) => view(page).getByRole("slider", { name: "Posición en la discografía" });
const nav = (page) => page.getByRole("button", { name: "Ir al capítulo Colección", exact: true });
const collectionCard = (page) => collection(page).locator('[data-collection-album-id="mock-album-01"]').first();

async function boot(page, path = "/") {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-rail-ready="true"]')).toBeVisible({ timeout: 90000 });
  const chapter = Number(await page.locator("html").getAttribute("data-chapter"));
  if (chapter <= 1) {
    await expect(page.getByRole("button", { name: "Pausar/reanudar equipo", exact: true })).toBeEnabled();
  } else {
    await expect(page.getByTestId("deck-now-playing-track")).toBeVisible();
  }
}
async function openCollection(page) {
  await boot(page);
  await go(page, "Colección", 3);
  await expect(collectionCard(page)).toBeVisible();
}
async function openArtist(page) {
  await openCollection(page);
  await collection(page).getByRole("button", { name: "Buscar artista", exact: true }).click();
  await page.getByRole("searchbox", { name: "Buscar artistas", exact: true }).fill("Vertice");
  await collection(page).locator('[aria-label="Resultados de artistas"]').getByRole("button").first().click();
  await expect(scene(page)).toBeVisible();
}
async function releaseFocusAndPointer(page) {
  await nav(page).focus();
  await page.mouse.move(2, 2);
}
async function hingeAngle(page) {
  return presentation(page).getByTestId("jewel-case-hinge").evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return Math.round(Math.atan2(-matrix.m13, matrix.m11) * 180 / Math.PI);
  });
}
async function uniqueEditionControls(page) {
  const ids = await scene(page).locator("button[data-album-id]").evaluateAll((nodes) => nodes.map((node) => node.dataset.albumId));
  expect(new Set(ids).size).toBe(ids.length);
  expect(await scene(page).locator('[data-copy="true"] button').count()).toBe(0);
}
async function assertOpenCaseSides(page) {
  const tracks = await presentation(page).getByTestId("jewel-case-tracklist").boundingBox();
  const tray = await presentation(page).getByTestId("jewel-case-tray").boundingBox();
  expect(tracks.x + tracks.width / 2).toBeLessThan(tray.x + tray.width / 2);
  expect(await presentation(page).getByRole("list", { name: "Lista de pistas", exact: true }).evaluate((node) => node.clientHeight)).toBeGreaterThan(30);
  const frame = await detail(page).boundingBox();
  const cd = await presentation(page).getByRole("slider", { name: "Girar CD", exact: true }).boundingBox();
  for (const box of [tracks, tray, cd]) {
    expect(box.y).toBeGreaterThanOrEqual(frame.y - 1);
    expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
    expect(box.x).toBeGreaterThanOrEqual(frame.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
  }
}

test.describe("shared-case: contratos de estado y geometría con fixture WebGL explícita", () => {
  test.beforeEach(async ({ page }) => { await functionalFixture(page); });

  test("entrada A y reautenticación eligen una sola vez el capítulo sin alterar la navegación posterior", async ({ page }) => {
    await boot(page, "/?entry=collection");
    await expect(page.locator("html")).toHaveAttribute("data-chapter", "3");
    await expect.poll(() => new URL(page.url()).searchParams.has("entry")).toBe(false);
    await go(page, "Split", 1);
    // Explicit DOM fixture: exercise reauth link gestures without contacting
    // Spotify or pretending that a mock session is a real OAuth session.
    await page.evaluate(() => {
      const link = document.createElement("a");
      link.href = "/api/auth/login";
      link.id = "qa-reauth-probe";
      link.textContent = "Reautenticar QA";
      document.body.append(link);
    });
    const reauth = page.locator("#qa-reauth-probe");
    for (const gesture of ["contextmenu", "auxclick"]) {
      await reauth.evaluate((node) => { node.href = "/api/auth/login"; delete node.dataset.authReturnManaged; });
      await reauth.dispatchEvent(gesture, { button: gesture === "auxclick" ? 1 : 2 });
      expect(new URL(await reauth.getAttribute("href"), page.url()).searchParams.get("returnTo")).toBe("/?chapter=1");
    }
    await reauth.evaluate((node) => node.remove());
    const toggle = page.getByRole("button", { name: "Play/Pause", exact: true });
    await toggle.click();
    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-chapter", "1");
    await boot(page, "/?chapter=4");
    await expect(page.locator("html")).toHaveAttribute("data-chapter", "4");
    await expect.poll(() => new URL(page.url()).searchParams.has("chapter")).toBe(false);
    await go(page, "Batea", 2);
    await expect(page.locator("html")).toHaveAttribute("data-chapter", "2");
  });

  test("Colección y Batea comparten la ficha, la misma bisagra y el foco de regreso", async ({ page }) => {
    await openCollection(page);
    const angles = [];
    for (const chapter of ["Colección", "Batea"]) {
      if (chapter === "Batea") await go(page, chapter, 2);
      let source = collectionCard(page);
      if (chapter === "Batea") {
        const crate = page.locator('[data-rail-wrapper] > div > section').nth(2);
        await crate.locator('[class*="stage"]').first().hover();
        const candidates = crate.getByRole("button", { name: "Vértice Magnético — Neon Rooms", exact: true });
        const visible = await candidates.evaluateAll((nodes) => nodes.findIndex((node) => {
          const viewport = node.closest('[class*="viewport"]')?.getBoundingClientRect();
          const box = node.getBoundingClientRect();
          const x = box.left + box.width / 2, y = box.top + box.height / 2;
          return viewport && box.width > 0 && x >= viewport.left + 4 && x <= viewport.right - 4 && y >= viewport.top + 4 && y <= viewport.bottom - 4;
        }));
        expect(visible).toBeGreaterThanOrEqual(0);
        source = candidates.nth(visible);
        const target = await source.boundingBox();
        await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
      } else await source.click();
      const dialog = page.getByTestId("album-detail-page");
      await expect(dialog).toBeVisible();
      await expect(presentation(page)).toHaveAttribute("data-variant", "modal");
      await expect(presentation(page)).toHaveAttribute("data-case-open", "false");
      const edge = presentation(page).getByTestId("jewel-case-open-target");
      const box = await edge.boundingBox();
      await edge.click({ position: { x: 2, y: box.height / 2 } });
      await expect(presentation(page)).toHaveAttribute("data-presentation", "open");
      angles.push(await hingeAngle(page));
      await assertOpenCaseSides(page);
      await expect(presentation(page)).toContainText("Ventana de neón");
      const cd = presentation(page).getByRole("slider", { name: "Girar CD", exact: true });
      await expect(cd).toHaveCount(1);
      await cd.focus();
      const before = await cd.getAttribute("aria-valuenow");
      await page.keyboard.press("ArrowRight");
      await expect(cd).not.toHaveAttribute("aria-valuenow", before);
      const restingScale = await cd.evaluate((node) => getComputedStyle(node).scale);
      await page.keyboard.press("Enter");
      await expect(cd).toHaveAttribute("data-inspecting", "true");
      await expect.poll(() => cd.evaluate((node) => getComputedStyle(node).scale)).toBe("1.07");
      await page.keyboard.press("Space");
      await expect(cd).toHaveAttribute("data-inspecting", "false");
      await expect.poll(() => cd.evaluate((node) => getComputedStyle(node).scale)).toBe(restingScale);
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(source).toBeFocused();
    }
    expect(angles).toEqual([-168, -168]);
  });

  test("Batea y la ficha de guardados conservan los filtros de Colección", async ({ page }) => {
    await openCollection(page);
    const search = collection(page).getByRole("searchbox", { name: "Buscar artista o álbum", exact: true });
    await search.fill("neon");
    const before = await collectionCard(page).getAttribute("data-collection-album-id");
    await go(page, "Batea", 2);
    const crate = page.locator('[data-rail-wrapper] > div > section').nth(2);
    await crate.locator('[class*="stage"]').first().hover();
    const cards = crate.getByRole("button", { name: "Vértice Magnético — Neon Rooms", exact: true });
    const visible = await cards.evaluateAll((nodes) => nodes.findIndex((node) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return node.contains(document.elementFromPoint(x + width / 2, y + height / 2));
    }));
    expect(visible).toBeGreaterThanOrEqual(0);
    const card = cards.nth(visible);
    await card.click();
    await expect(presentation(page)).toHaveAttribute("data-variant", "modal");
    await page.keyboard.press("Escape");
    await expect(card).toBeFocused();
    await go(page, "Colección", 3);
    await expect(search).toHaveValue("neon");
    expect(await collectionCard(page).getAttribute("data-collection-album-id")).toBe(before);
  });

  test("reanudar desde el control fijo avanza sin retirar su foco; enfocar una caja pausa", async ({ page }) => {
    await openArtist(page);
    await releaseFocusAndPointer(page);
    await expect(scene(page)).toHaveAttribute("data-drifting", "true");
    await view(page).getByRole("button", { name: "PAUSAR RECORRIDO", exact: true }).click();
    await expect(scene(page)).toHaveAttribute("data-drifting", "false");
    const stopped = await scene(page).getAttribute("data-cycle-phase");
    await page.waitForTimeout(200);
    await expect(scene(page)).toHaveAttribute("data-cycle-phase", stopped);
    await view(page).getByRole("button", { name: "REANUDAR RECORRIDO", exact: true }).click();
    await expect(view(page).getByRole("button", { name: "PAUSAR RECORRIDO", exact: true })).toBeFocused();
    await expect(scene(page)).toHaveAttribute("data-drifting", "true");
    await expect.poll(() => scene(page).getAttribute("data-cycle-phase")).not.toBe(stopped);
    await scene(page).locator('button[data-album-id][data-offset="0"]').focus();
    await expect(scene(page)).toHaveAttribute("data-drifting", "false");
  });

  test("Tab no desplaza cajas fuera del clip; End, Enter y Escape conservan centro, ID y foco", async ({ page }) => {
    const items = Array.from({ length: 31 }, (_, index) => ({
      id: `tab-fixture-${index}`, name: `Edición de teclado ${index + 1}`, release_date: `${1990 + index}`,
      artists: [{ id: "demo-vertice", name: "Vértice Magnético" }], images: [], uri: `spotify:album:tab-fixture-${index}`, album_group: "album",
    }));
    await page.route("**/api/artists/demo-vertice/albums?*", (route) => route.fulfill({ json: { items, total: items.length, nextOffset: null } }));
    await openArtist(page);
    await scene(page).focus();
    for (let step = 0; step < 6; step++) {
      await page.keyboard.press("Tab");
      expect(await scene(page).evaluate((node) => node.scrollLeft)).toBe(0);
      await expect(page.locator("html")).toHaveAttribute("data-chapter", "3");
    }
    await scene(page).focus();
    await page.keyboard.press("End");
    await expect(selected(page)).toHaveAttribute("data-album-id", "tab-fixture-30");
    await expect(selected(page)).toBeFocused();
    await expect.poll(async () => {
      const box = await selected(page).boundingBox();
      const frame = await scene(page).boundingBox();
      return Math.abs(box.x + box.width / 2 - frame.x - frame.width / 2);
    }).toBeLessThan(2);
    await page.keyboard.press("Enter");
    await expect(presentation(page)).toHaveAttribute("data-album-id", "tab-fixture-30");
    await expect(presentation(page)).toHaveAttribute("data-presentation", "closed");
    await page.keyboard.press("Escape");
    await expect(detail(page)).toHaveCount(0);
    await expect(scene(page)).toHaveAttribute("data-mode", "selected");
    await expect(selected(page)).toBeFocused();
    expect(await scene(page).evaluate((node) => node.scrollLeft)).toBe(0);
  });

  test("hojas, CD y scroll nativo de pistas funcionan en la ficha a 1280×800 y 1280×600", async ({ page }) => {
    // Exercise a list that needs scrolling even in the taller case layout.
    const fixtureTracks = Array.from({ length: 64 }, (_, position) => ({
      id: `scroll-track-${position + 1}`,
      uri: `spotify:track:scroll-track-${position + 1}`,
      name: `Pista de la edición larga ${position + 1}`,
      duration_ms: 182000,
      disc_number: Math.floor(position / 32) + 1,
      track_number: position % 32 + 1,
      position,
      playable: true,
    }));
    await page.route("**/api/album/demo-vertice-album-0/tracks", (route) => route.fulfill({ json: { tracks: fixtureTracks } }));
    await openArtist(page);
    await scene(page).hover({ position: { x: 8, y: 28 } });
    await scene(page).getByRole("button", { name: "Seleccionar Campo magnético", exact: true }).click();
    await detail(page).getByRole("button", { name: "Abrir caja", exact: true }).click();
    await expect(presentation(page)).toHaveAttribute("data-presentation", "open");
    const list = presentation(page).getByRole("list", { name: "Lista de pistas", exact: true });
    await expect(list.locator("li")).toHaveCount(fixtureTracks.length);
    for (const height of [800, 600]) {
      await page.setViewportSize({ width: 1280, height });
      await presentation(page).getByTestId("jewel-case-tracklist").scrollIntoViewIfNeeded();
      await assertOpenCaseSides(page);
      expect(await list.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
      await list.focus();
      await page.keyboard.press("Home");
      await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBe(0);
      await list.hover();
      await page.mouse.wheel(0, 650);
      await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      await expect(list.locator("li").last()).toBeInViewport({ ratio: .5 });
      await page.keyboard.press("Home");
      await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBe(0);
      await page.keyboard.press("End");
      await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      await expect(list.locator("li").last()).toBeInViewport({ ratio: .5 });
      await expect(page.locator("html")).toHaveAttribute("data-chapter", "3");
      expect(await scene(page).evaluate((node) => node.scrollLeft)).toBe(0);
      const close = detail(page).getByRole("button", { name: "Cerrar caja", exact: true });
      await close.scrollIntoViewIfNeeded();
      await expect(close).toBeInViewport({ ratio: 1 });
      await expect(detail(page).getByRole("button", { name: "Reproducir Campo magnético", exact: true })).toBeInViewport({ ratio: 1 });
    }
  });

  for (const count of [1, 3, 31]) {
    test(`catálogo de ${count}: identidad, pausa con foco y ciclo continuo al cruzar la última edición`, async ({ page }) => {
      const items = Array.from({ length: count }, (_, index) => ({
        id: `case-fixture-${index}`, name: index === count - 1 ? "Un título extraordinariamente largo conserva todas sus palabras al recibir el foco" : `Edición ${index + 1}`,
        artists: [{ id: "demo-vertice", name: "Vértice Magnético" }], images: [], uri: `spotify:album:case-fixture-${index}`,
        release_date: `${1990 + index}-01-01`, album_group: "album",
      }));
      await page.route("**/api/artists/demo-vertice/albums?*", (route) => route.fulfill({ json: { items: [...items].reverse(), total: count, nextOffset: null } }));
      await openArtist(page);
      await expect(position(page)).toHaveAttribute("max", String(count));
      await scene(page).focus();
      await page.keyboard.press("End");
      await expect(selected(page)).toHaveAttribute("data-album-id", `case-fixture-${count - 1}`);
      await selected(page).focus();
      await expect(scene(page)).toHaveAttribute("data-drifting", "false");
      await expect(page.getByTestId("artist-full-title")).toContainText(items[count - 1].name);
      await uniqueEditionControls(page);
      await page.keyboard.press("Escape");
      await expect(scene(page)).toHaveAttribute("data-mode", "browse");
      await releaseFocusAndPointer(page);
      if (count === 1) {
        await expect(scene(page)).toHaveAttribute("data-drifting", "false");
        await expect(position(page)).toHaveValue("1");
      } else {
        await expect(scene(page)).toHaveAttribute("data-drifting", "true");
        const seam = await scene(page).evaluate(async (node, last) => {
          const samples = [];
          const started = performance.now();
          let crossed = false;
          while (performance.now() - started < 7000) {
            await new Promise(requestAnimationFrame);
            const control = node.querySelector('button[data-album-id="case-fixture-0"]');
            if (!control) throw new Error("La edición pierde su control en el cruce");
            const index = Number(node.dataset.cycleIndex);
            samples.push({ index, left: control.getBoundingClientRect().left });
            if (samples.some((sample) => sample.index === last) && index === 0) { crossed = true; break; }
          }
          return { crossed, maxJump: Math.max(0, ...samples.slice(1).map((sample, index) => Math.abs(sample.left - samples[index].left))) };
        }, count - 1);
        expect(seam.crossed).toBe(true);
        expect(seam.maxJump).toBeLessThan(24);
        await expect(position(page)).toHaveValue("1");
        await uniqueEditionControls(page);
        await scene(page).focus();
        await expect(scene(page)).toHaveAttribute("data-drifting", "false");
        const current = await position(page).inputValue();
        const pausedPhase = await scene(page).getAttribute("data-cycle-phase");
        await page.waitForTimeout(200);
        await expect(position(page)).toHaveValue(current);
        await expect(scene(page)).toHaveAttribute("data-cycle-phase", pausedPhase);
        await releaseFocusAndPointer(page);
        await expect(scene(page)).toHaveAttribute("data-drifting", "true");
        await expect.poll(() => scene(page).getAttribute("data-cycle-phase")).not.toBe(pausedPhase);
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(scene(page)).toHaveAttribute("data-drifting", "false");
    });
  }
});

test("shared-case: mock normal buscar artista, seleccionar, abrir la bisagra y reproducir una sola vez", async ({ page }) => {
  // Normal app: no catalog, tracks, lyrics, playback or WebGL interceptors.
  const requests = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/play") requests.push(request.postDataJSON()); });
  await openArtist(page);
  await scene(page).hover({ position: { x: 8, y: 28 } });
  const source = scene(page).getByRole("button", { name: "Seleccionar Campo magnético", exact: true });
  const id = await source.getAttribute("data-album-id");
  await source.click();
  await expect(detail(page)).toHaveAttribute("data-album-id", id);
  await expect(presentation(page)).toHaveAttribute("data-presentation", "closed");
  await detail(page).getByRole("button", { name: "Abrir caja", exact: true }).click();
  await expect(presentation(page)).toHaveAttribute("data-presentation", "open");
  expect(await hingeAngle(page)).toBe(-168);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-rail-ready]")).toHaveAttribute("data-album-detail-open", "true");
  await expect(scene(page)).toBeHidden();
  await expect(scene(page)).toHaveAttribute("data-drifting", "false");
  const frame = await presentation(page).boundingBox();
  await assertOpenCaseSides(page);
  const rail = await page.locator("[data-global-player]").boundingBox();
  expect(frame.y + frame.height).toBeLessThanOrEqual(rail.y);
  await detail(page).getByRole("button", { name: "Reproducir Campo magnético", exact: true }).dblclick();
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "true");
  await expect(page.locator("html")).toHaveAttribute("data-chapter", "0", { timeout: 20000 });
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].uri).toBe(`spotify:album:${id}`);
  await go(page, "Colección", 3);
  await expect(selected(page)).toHaveAttribute("data-album-id", id);
  await expect(selected(page)).toBeFocused();
});

test("shared-case: mock normal abre, cierra y reproduce desde Colección con confirmación del álbum", async ({ page }) => {
  const plays = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/play") plays.push(request.postDataJSON()); });
  const catalogResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/collection");
  await openCollection(page);
  const savedAlbums = await (await catalogResponse).json();
  const savedAlbum = savedAlbums.find((album) => album.id === "mock-album-02");
  expect(savedAlbum).toBeTruthy();
  await collection(page).locator('[data-collection-album-id="mock-album-02"]').click();
  await presentation(page).getByTestId("jewel-case-open-target").click();
  await expect(presentation(page)).toHaveAttribute("data-presentation", "open");
  await page.getByTestId("album-detail-page").getByRole("button", { name: "Cerrar caja", exact: true }).click();
  await expect(presentation(page)).toHaveAttribute("data-presentation", "closed");
  await page.getByTestId("album-detail-page").getByRole("button", { name: "Abrir caja", exact: true }).click();
  await expect(presentation(page)).toHaveAttribute("data-presentation", "open");
  await page.getByTestId("album-detail-page").getByRole("button", { name: "Reproducir Nocturnal FM", exact: true }).dblclick();
  await expect(page.getByTestId("album-detail-page")).toHaveCount(0);
  await expect(page.getByTestId("deck-now-playing-artist")).toHaveText("Satélite Sur", { timeout: 20000 });
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "true");
  await expect(page.locator("html")).toHaveAttribute("data-chapter", "0");
  await expect(page.getByTestId("rail-flying-disc")).toHaveCount(0);
  expect(plays).toHaveLength(1);
  expect(plays[0].uri).toBe(savedAlbum.uri);
});
