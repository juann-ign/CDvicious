const { test, expect } = require("./support/qa-evidence.cjs");
const collection = (page) => page.getByRole("region", { name: "La Colección" });
const view = (page) => page.getByTestId("artist-discography");
const scene = (page) => page.getByTestId("artist-disc-scene");
const selected = (page) => page.getByTestId("artist-selected-case");
const opened = (page) => page.getByTestId("artist-inline-case");
const next = (page) => view(page).getByRole("button", { name: "SIGUIENTE ▷", exact: true });
const slider = (page) => view(page).getByRole("slider", { name: "Posición en la discografía" });
const results = (page) => collection(page).locator('[aria-label="Resultados de artistas"]');

test.beforeEach(async ({ page }) => {
  test.skip(process.env.RAIL_FLAG !== "1", "Discografía contextual del rail desktop");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-rail-ready="true"]')).toBeVisible({ timeout: 90000 });
  // Settle each chapter during cold WebGL startup. Long jumps have their own
  // existing regression; this fixture prepares a precisely aligned Collection.
  for (const [name, index] of [["Split", 1], ["Batea", 2], ["Colección", 3]]) {
    await page.getByRole("button", { name: `Ir al capítulo ${name}` }).click();
    await expect.poll(() => page.locator("[data-rail-wrapper] > div > section").nth(index).evaluate((node) => Math.abs(node.getBoundingClientRect().left)), { timeout: 15000 }).toBeLessThan(2);
  }
});
async function search(page, query) {
  await collection(page).getByRole("button", { name: /EXPLORAR ARTISTA/ }).click();
  await page.getByRole("searchbox", { name: "Buscar artistas", exact: true }).fill(query);
  await expect(results(page).getByRole("button").first()).toBeVisible();
}
async function artist(page, query = "Vértice") {
  await search(page, query);
  await results(page).getByRole("button").first().click();
  await expect(view(page).locator("header [role=status]")).toContainText("27 LANZAMIENTOS");
  // Pointer entry pauses the physical shelf before targeting a moving lomo.
  // Playwright waits for target stability before moving its pointer to click.
  await scene(page).hover({ position: { x: 8, y: 28 } });
  await expect(scene(page)).toHaveAttribute("data-drifting", "false");
}
async function assertShell(page) {
  await expect(page.getByTestId("deck-now-playing")).toHaveCount(1);
  await expect(page.locator("[data-global-player]")).toHaveCount(1);
  const bounds = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    return { nav: rect("[data-shell-header]"), scene: rect('[data-testid="artist-disc-scene"]'), view: rect('[data-testid="artist-discography"]'), player: rect("[data-global-player]") };
  });
  expect(bounds.view.top).toBeGreaterThanOrEqual(bounds.nav.bottom);
  expect(bounds.view.bottom).toBeLessThanOrEqual(bounds.player.top);
  expect(bounds.scene.top).toBeGreaterThanOrEqual(bounds.nav.bottom);
  expect(bounds.scene.bottom).toBeLessThanOrEqual(bounds.player.top);
}
const release = (id, name, year, artistId) => ({ id, name, release_date: year, artists: [{ id: artistId, name: artistId }], images: [], uri: `spotify:album:${id}`, album_group: "album" });

test("buscar explícitamente, paginar, abrir inline y conservar colección, artista, albumId y foco", async ({ page }) => {
  const urls = [];
  page.on("request", (request) => { if (request.url().includes("/api/artists/")) urls.push(request.url()); });
  const filter = collection(page).getByRole("searchbox", { name: "Buscar artista o álbum", exact: true });
  await filter.fill("Nocturnal");
  await search(page, "Vértice");
  await expect(view(page)).toHaveCount(0); // A name alone never opens an artist.
  await results(page).getByRole("button").first().click();
  await expect(view(page).locator("header [role=status]")).toContainText("27 LANZAMIENTOS");
  expect(urls.some((url) => url.includes("offset=10"))).toBe(true);
  expect(urls.some((url) => url.includes("offset=20"))).toBe(true);
  expect(urls.every((url) => new URL(url).searchParams.get("group") === "album")).toBe(true);
  await expect(view(page).getByRole("button", { name: "SINGLES / EP", exact: true })).toHaveCount(0);
  await expect(slider(page)).toHaveAttribute("max", "27");
  await expect(scene(page)).toHaveAttribute("data-mode", "browse");
  await next(page).click();
  await expect(selected(page)).toHaveAccessibleName("Abrir caja de Frecuencia cero");
  await scene(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect(selected(page)).toHaveAccessibleName("Abrir caja de Órbita interior");
  const albumId = await selected(page).getAttribute("data-album-id");
  await selected(page).click();
  await expect(opened(page)).toHaveAttribute("data-album-id", albumId);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-modal-open", "true");
  await page.keyboard.press("Escape");
  await expect(scene(page)).toHaveAttribute("data-mode", "selected");
  await expect(selected(page)).toHaveAttribute("data-album-id", albumId);
  await expect(selected(page)).toBeFocused();
  await view(page).getByRole("button", { name: /VOLVER A RESULTADOS/ }).click();
  await expect(page.getByRole("searchbox", { name: "Buscar artistas", exact: true })).toHaveValue("Vértice");
  await results(page).getByRole("button").first().click();
  await expect(selected(page)).toHaveAttribute("data-album-id", albumId);
  await expect(slider(page)).toHaveValue("3");
  await view(page).getByRole("button", { name: /TU COLECCIÓN/ }).click();
  await expect(filter).toHaveValue("Nocturnal");
  await collection(page).getByRole("button", { name: /EXPLORAR ARTISTA/ }).click();
  await expect(selected(page)).toHaveAttribute("data-album-id", albumId);
  await expect(selected(page)).toBeFocused();
});

test("primer clic selecciona, segundo abre; texto y CD no cierran; Escape baja un nivel", async ({ page }) => {
  await artist(page);
  const playing = await page.getByTestId("deck-now-playing-track").textContent();
  const playingArtist = await page.getByTestId("deck-now-playing-artist").textContent();
  await scene(page).getByRole("button", { name: "Seleccionar Frecuencia cero", exact: true }).click();
  await expect(scene(page)).toHaveAttribute("data-mode", "selected");
  await expect(opened(page)).toHaveCount(0);
  await expect(selected(page)).toHaveAttribute("data-album-id", "demo-vertice-album-1");
  await selected(page).click();
  await expect(scene(page)).toHaveAttribute("data-mode", "open");
  await expect(opened(page)).toHaveAttribute("data-album-id", "demo-vertice-album-1");
  await opened(page).getByRole("heading").first().click();
  await expect(scene(page)).toHaveAttribute("data-mode", "open");
  await view(page).getByRole("button", { name: "GIRAR CD", exact: true }).click();
  await expect(page.getByTestId("artist-case-cd")).toHaveAttribute("data-flipped", "true");
  await page.getByTestId("artist-case-cd").click();
  await expect(scene(page)).toHaveAttribute("data-mode", "open");
  await expect(page.getByTestId("deck-now-playing-track")).toHaveText(playing);
  await expect(page.getByTestId("deck-now-playing-artist")).toHaveText(playingArtist);
  await expect(page.getByTestId("deck-now-playing")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(scene(page)).toHaveAttribute("data-mode", "selected");
  await expect(selected(page)).toHaveAttribute("data-album-id", "demo-vertice-album-1");
  await page.keyboard.press("Escape");
  await expect(scene(page)).toHaveAttribute("data-mode", "browse");
  await expect(slider(page)).toHaveValue("2");
});

test("respuestas atrasadas, duplicados por ID y ediciones distintas", async ({ page }) => {
  await page.route("**/api/artists/demo-vertice/albums?*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({ json: { items: [release("old", "RESPUESTA VIEJA", "2000", "demo-vertice")], total: 1, nextOffset: null } }).catch(() => {});
  });
  await page.route("**/api/artists/demo-satelite/albums?*", (route) => {
    const offset = new URL(route.request().url()).searchParams.get("offset");
    return route.fulfill({ json: { items: offset === "0" ? [release("new-a", "Misma edición", "2001", "demo-satelite")] : [release("new-a", "Misma edición", "2001", "demo-satelite"), release("new-b", "Misma edición", "1999", "demo-satelite")], total: 3, nextOffset: offset === "0" ? 10 : null } });
  });
  await search(page, "Vértice");
  await results(page).getByRole("button").first().click();
  await view(page).getByRole("button", { name: /VOLVER A RESULTADOS/ }).click();
  await page.getByRole("searchbox", { name: "Buscar artistas", exact: true }).fill("Satélite");
  await results(page).getByRole("button").first().click();
  await expect(view(page)).toHaveAttribute("data-artist-id", "demo-satelite");
  await expect(view(page).locator("header [role=status]")).toContainText("2 LANZAMIENTOS");
  await page.waitForTimeout(1400);
  await expect(view(page)).not.toContainText("RESPUESTA VIEJA");
  await expect(slider(page)).toHaveAttribute("max", "2");
  await scene(page).hover({ position: { x: 8, y: 28 } });
  await scene(page).getByRole("button", { name: "Seleccionar Misma edición", exact: true }).first().click();
  await expect(selected(page)).toHaveAttribute("data-album-id", "new-b"); // Earlier edition first.
  await next(page).click();
  await expect(selected(page)).toHaveAttribute("data-album-id", "new-a");
});

test("interacción antes de completar páginas conserva albumId al insertar una edición anterior", async ({ page }) => {
  let completeSecondPage;
  const secondPage = new Promise((resolve) => { completeSecondPage = resolve; });
  await page.route("**/api/artists/demo-vertice/albums?*", async (route) => {
    const offset = new URL(route.request().url()).searchParams.get("offset");
    if (offset !== "0") await secondPage;
    await route.fulfill({ json: { items: offset === "0" ? [release("chosen", "Álbum que estoy mirando", "2001", "demo-vertice")] : [release("earlier", "Edición anterior", "1990", "demo-vertice")], total: 2, nextOffset: offset === "0" ? 10 : null } });
  });
  await search(page, "Vértice");
  await results(page).getByRole("button").first().click();
  await scene(page).hover({ position: { x: 8, y: 28 } });
  await scene(page).getByRole("button", { name: "Seleccionar Álbum que estoy mirando", exact: true }).click();
  await expect(selected(page)).toHaveAttribute("data-album-id", "chosen");
  await selected(page).click();
  await expect(opened(page)).toHaveAttribute("data-album-id", "chosen");
  completeSecondPage();
  await expect(view(page).locator("header [role=status]")).toContainText("2 LANZAMIENTOS");
  await expect(opened(page)).toHaveAttribute("data-album-id", "chosen");
  await view(page).getByRole("button", { name: "CERRAR CAJA", exact: true }).click();
  await expect(selected(page)).toHaveAttribute("data-album-id", "chosen");
  await expect(slider(page)).toHaveValue("2");
});

test("selecciones rápidas no abren cajas antiguas ni acumulan callbacks", async ({ page }) => {
  await artist(page);
  await scene(page).focus();
  for (const key of ["ArrowRight", "ArrowRight", "ArrowLeft", "End", "Home"]) await page.keyboard.press(key);
  await expect(selected(page)).toHaveAttribute("data-album-id", "demo-vertice-album-0");
  await selected(page).click();
  await expect(opened(page)).toHaveAttribute("data-album-id", "demo-vertice-album-0");
  await view(page).getByRole("button", { name: "CERRAR CAJA", exact: true }).click();
  await next(page).click();
  await expect(selected(page)).toHaveAttribute("data-album-id", "demo-vertice-album-1");
  await expect(opened(page)).toHaveCount(0);
});

test("arrastrar la caja frontal conserva su dueño y suprime la apertura accidental", async ({ page }) => {
  await artist(page);
  await next(page).click();
  await selected(page).hover();
  const box = await selected(page).boundingBox();
  const x = box.x + box.width * .55;
  const y = box.y + box.height * .45;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y + 3, { steps: 6 });
  await page.mouse.up();
  await expect(scene(page)).toHaveAttribute("data-mode", "selected");
  await expect(selected(page)).toHaveAttribute("data-album-id", "demo-vertice-album-1");
  await expect(slider(page)).toHaveValue("2");
  await expect(opened(page)).toHaveCount(0);
  await selected(page).click();
  await expect(opened(page)).toHaveAttribute("data-album-id", "demo-vertice-album-1");
});

test("cerrar y reabrir durante la bisagra termina en el mismo albumId sin callbacks antiguos", async ({ page }) => {
  await artist(page);
  await next(page).click();
  await selected(page).click();
  await expect(scene(page).locator('[data-presentation="open"]')).toBeVisible();
  await view(page).getByRole("button", { name: "CERRAR CAJA", exact: true }).click();
  await expect(scene(page)).toHaveAttribute("data-mode", "selected");
  await view(page).getByRole("button", { name: "ABRIR CAJA", exact: true }).click();
  await expect(scene(page).locator('[data-presentation="open"]')).toBeVisible();
  await expect(opened(page)).toHaveAttribute("data-album-id", "demo-vertice-album-1");
  await expect(scene(page)).toHaveAttribute("data-mode", "open");
  await view(page).getByRole("button", { name: "CERRAR CAJA", exact: true }).click();
  await next(page).click();
  await expect(selected(page)).toHaveAttribute("data-album-id", "demo-vertice-album-2");
  await expect(opened(page)).toHaveCount(0);
});

test("arrastre del fondo y cancelación liberan el rail; rueda conserva capítulos", async ({ page }) => {
  await artist(page);
  const bounds = await scene(page).boundingBox();
  // The upper gutter owns catalog dragging; a case/CD keeps its own gesture.
  const x = bounds.x + bounds.width * .6;
  const y = bounds.y + 4;
  expect(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest("button, [data-gesture-owner]")), { x, y })).toBe(false);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 70, y, { steps: 8 });
  await expect(scene(page)).toHaveAttribute("data-dragging", "true");
  await page.mouse.up();
  await expect(scene(page)).toHaveAttribute("data-dragging", "false");
  await expect(slider(page)).not.toHaveValue("1");
  await expect(opened(page)).toHaveCount(0);
  const position = await slider(page).inputValue();
  for (const event of ["pointercancel", "lostpointercapture"]) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 35, y, { steps: 5 });
    await expect(scene(page)).toHaveAttribute("data-dragging", "true");
    await scene(page).dispatchEvent(event, { pointerId: 1, clientX: x - 35 });
    await page.mouse.up();
    await expect(scene(page)).toHaveAttribute("data-dragging", "false");
    await expect(slider(page)).toHaveValue(position);
    await expect(opened(page)).toHaveCount(0);
  }
  for (const [name, index] of [["Batea", 2], ["Split", 1], ["Deck", 0], ["Split", 1], ["Batea", 2], ["Colección", 3]]) {
    await page.getByRole("button", { name: `Ir al capítulo ${name}` }).click();
    await expect(page.locator("html")).toHaveAttribute("data-chapter", String(index));
    await expect.poll(() => page.locator("[data-rail-wrapper] > div > section").nth(index).evaluate((node) => Math.abs(node.getBoundingClientRect().left)), { timeout: 15000 }).toBeLessThan(2);
  }
  await expect(scene(page)).toBeVisible();
  await scene(page).hover(); await page.mouse.wheel(0, 1200);
  await expect(page.locator("html")).toHaveAttribute("data-chapter", "4", { timeout: 12000 });
  await expect(scene(page)).toHaveAttribute("data-drifting", "false");
});

test("desactivar escena durante un gesto libera el token", async ({ page }) => {
  await artist(page);
  const bounds = await scene(page).boundingBox();
  await page.mouse.move(bounds.x + 200, bounds.y + 4);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 160, bounds.y + 4, { steps: 5 });
  await expect(scene(page)).toHaveAttribute("data-dragging", "true");
  // Trigger an existing control without releasing the mouse first: the scene's
  // deactivation cleanup, rather than pointerup, must release the rail token.
  await view(page).getByRole("button", { name: /VOLVER A RESULTADOS/ }).evaluate((node) => node.click());
  await page.mouse.up();
  await page.getByRole("button", { name: "Ir al capítulo Batea" }).click();
  await expect.poll(() => page.locator("[data-rail-wrapper] > div > section").nth(2).evaluate((node) => Math.abs(node.getBoundingClientRect().left)), { timeout: 15000 }).toBeLessThan(2);
});

test("cancelar arrastre del CD no abre otra caja ni deja bloqueado el rail", async ({ page }) => {
  await artist(page);
  await next(page).click();
  await selected(page).click();
  const cd = page.getByTestId("artist-case-cd");
  await expect(cd).toBeVisible();
  for (const event of ["pointercancel", "lostpointercapture"]) {
    // Resolve layout after the hinge finishes before starting the real pointer.
    await cd.hover();
    const box = await cd.boundingBox();
    const x = box.x + box.width * .65;
    const y = box.y + box.height * .4;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 22, y + 8, { steps: 5 });
    await cd.locator("..").dispatchEvent(event, { pointerId: 1, clientX: x + 22, clientY: y + 8 });
    await page.mouse.up();
    await expect(opened(page)).toHaveAttribute("data-album-id", "demo-vertice-album-1");
    await expect(cd).toHaveAttribute("aria-pressed", "false");
  }
  await page.getByRole("button", { name: "Ir al capítulo Batea" }).click();
  await expect.poll(() => page.locator("[data-rail-wrapper] > div > section").nth(2).evaluate((node) => Math.abs(node.getBoundingClientRect().left)), { timeout: 15000 }).toBeLessThan(2);
});

test("deriva se pausa al hover, foco, selección y control manual", async ({ page }) => {
  await artist(page);
  await page.mouse.move(2, 2);
  await page.getByRole("button", { name: "Ir al capítulo Colección" }).focus();
  await expect(scene(page)).toHaveAttribute("data-drifting", "true");
  await scene(page).hover();
  await expect(scene(page)).toHaveAttribute("data-drifting", "false");
  await page.mouse.move(2, 2);
  await scene(page).focus();
  await expect(scene(page)).toHaveAttribute("data-drifting", "false");
  await view(page).getByRole("button", { name: "PAUSAR RECORRIDO", exact: true }).click();
  await page.getByRole("button", { name: "Ir al capítulo Colección" }).focus();
  await expect(scene(page)).toHaveAttribute("data-drifting", "false");
  await view(page).getByRole("button", { name: "REANUDAR RECORRIDO", exact: true }).click();
  await next(page).click();
  await expect(scene(page)).toHaveAttribute("data-drifting", "false");
});

test("reproducción explícita, doble clic, vuelo y confirmación del Deck", async ({ page }) => {
  await page.evaluate(() => {
    window.__artistFlightEvents = [];
    for (const name of ["started", "arrived", "done", "playback-ready", "playback-started", "cancelled"]) {
      window.addEventListener(`cdvicious:disc-flight-${name}`, (event) => window.__artistFlightEvents.push({ name, at: performance.now(), detail: event.detail }));
    }
  });
  await artist(page, "Satélite");
  let requests = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/play")) requests++; });
  await next(page).click();
  await view(page).getByRole("button", { name: "REPRODUCIR DISCO ↗", exact: true }).dblclick();
  await expect(page.getByTestId("rail-flying-disc")).toBeVisible();
  await expect(page.getByTestId("deck-now-playing-artist")).not.toHaveText("Satélite Sur");
  await expect(page.getByTestId("deck-now-playing-artist")).toHaveText("Satélite Sur", { timeout: 20000 });
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "true");
  await expect(page.getByTestId("deck-now-playing-artist")).toHaveCount(1);
  await expect(page.getByTestId("rail-flying-disc")).toHaveCount(0);
  expect(requests).toBe(1);
  const flow = await page.evaluate(() => window.__artistFlightEvents);
  const starts = flow.filter((event) => event.name === "started");
  const confirmations = flow.filter((event) => event.name === "playback-started");
  expect(starts).toHaveLength(1);
  expect(confirmations).toHaveLength(1);
  expect(confirmations[0].detail.attemptId).toBe(starts[0].detail.attemptId);
  expect(confirmations[0].detail.snapshot.track.album.id).toBe(starts[0].detail.albumId);
  expect(confirmations[0].detail.snapshot.deviceId).toBe(starts[0].detail.deviceId);
  await expect(page.locator("html")).toHaveAttribute("data-chapter", "0");
});

test("fallo de playback recupera artista, álbum y posición sin confirmar", async ({ page }) => {
  await artist(page, "Satélite");
  await next(page).click();
  await page.route("**/api/play", (route) => route.fulfill({ status: 409, json: { success: false, message: "El dispositivo de Spotify no está disponible." } }));
  await view(page).getByRole("button", { name: "REPRODUCIR DISCO ↗", exact: true }).click();
  await expect(view(page).getByRole("alert")).toContainText("dispositivo");
  await expect(page.locator("html")).toHaveAttribute("data-chapter", "3");
  await expect(selected(page)).toHaveAttribute("data-album-id", "demo-satelite-album-1");
  await expect(slider(page)).toHaveValue("2");
  await expect(page.getByTestId("rail-flying-disc")).toHaveCount(0);
  await page.getByRole("button", { name: "Ir al capítulo Deck" }).click();
  await expect(page.getByTestId("deck-now-playing-artist")).toHaveText("Vértice Magnético");
});

for (const [kind, status, message] of [["sesión vencida", 401, "sesión venció"], ["rate limit", 429, "limitó"], ["red", 0, "conexión"]]) {
  test(`${kind}: error de catálogo visible y reintento conserva búsqueda`, async ({ page }) => {
    await page.route("**/api/artists/*/albums?*", (route) => status === 0 ? route.abort("failed") : route.fulfill({ status, headers: { "Retry-After": "0" }, json: { error: status === 401 ? "AUTH_REQUIRED" : "RATE_LIMITED" } }));
    await search(page, "Vértice");
    await results(page).getByRole("button").first().click();
    await expect(view(page).getByRole("alert")).toContainText(message);
    if (status === 401) await expect(view(page).getByRole("link", { name: "CONECTAR SPOTIFY" })).toBeVisible();
    await page.unroute("**/api/artists/*/albums?*");
    await view(page).getByRole("button", { name: "REINTENTAR", exact: true }).click();
    await expect(view(page).locator("header [role=status]")).toContainText("27 LANZAMIENTOS");
    await expect(scene(page)).toBeVisible();
  });
}
test("artista vacío mantiene un estado distinto al error de catálogo", async ({ page }) => {
  await search(page, "Archivo");
  await results(page).getByRole("button").first().click();
  await expect(view(page)).toContainText("ESTE ARTISTA NO TIENE LANZAMIENTOS");
  await expect(view(page).getByRole("alert")).toHaveCount(0);
});

for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 1280, height: 600 }]) {
  test.describe(`${size.width}×${size.height}`, () => {
    test.use({ viewport: size });
    test(`composición, ventana acotada y controles en ${size.width}×${size.height}`, async ({ page }) => {
      await artist(page);
      await view(page).getByRole("button", { name: "PAUSAR RECORRIDO", exact: true }).click();
      await expect(scene(page)).toHaveAttribute("data-mode", "browse");
      expect(await scene(page).getByRole("button", { name: /^Seleccionar / }).count()).toBeLessThanOrEqual(19);
      await assertShell(page);
      await page.screenshot({ path: `test-results/jewelcase-${size.width}x${size.height}-recorrido.png`, animations: "disabled" });
      await next(page).click();
      const box = await selected(page).boundingBox();
      const frame = await scene(page).boundingBox();
      expect(box.height).toBeGreaterThan(100);
      expect(box.y).toBeGreaterThanOrEqual(frame.y - 1);
      expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
      for (const name of ["ABRIR CAJA", "REPRODUCIR DISCO ↗"]) await expect(view(page).getByRole("button", { name, exact: true })).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: `test-results/jewelcase-${size.width}x${size.height}-frontal.png`, animations: "disabled" });
      await view(page).getByRole("button", { name: "ABRIR CAJA", exact: true }).click();
      await expect(opened(page)).toBeVisible();
      const open = await opened(page).boundingBox();
      expect(open.x).toBeGreaterThanOrEqual(frame.x - 1);
      expect(open.x + open.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
      expect(open.y).toBeGreaterThanOrEqual(frame.y - 1);
      expect(open.y + open.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
      for (const name of ["CERRAR CAJA", "GIRAR CD", "REPRODUCIR DISCO ↗"]) await expect(view(page).getByRole("button", { name, exact: true })).toBeInViewport({ ratio: 1 });
      await assertShell(page);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(scene(page).locator('[data-presentation="open"]')).toBeVisible();
      await page.screenshot({ path: `test-results/jewelcase-${size.width}x${size.height}-abierta.png`, animations: "disabled" });
    });
  });
}

test("pocos álbumes y títulos largos conservan selección, controles y texto", async ({ page }) => {
  const title = "Una frecuencia extraordinariamente larga · ".repeat(5).trim();
  await page.route("**/api/artists/demo-vertice/albums?*", (route) => route.fulfill({ json: { items: [release("long-a", title, "1994", "demo-vertice"), release("long-b", title, "1995", "demo-vertice")], total: 2, nextOffset: null } }));
  await search(page, "Vértice");
  await results(page).getByRole("button").first().click();
  await expect(view(page).locator("header [role=status]")).toContainText("2 LANZAMIENTOS");
  await next(page).click();
  await expect(selected(page)).toHaveAttribute("data-album-id", "long-b");
  await view(page).getByRole("button", { name: "ABRIR CAJA", exact: true }).click();
  await expect(opened(page)).toHaveAttribute("data-album-id", "long-b");
  await expect(opened(page).getByRole("heading").first()).toHaveText(title);
  await assertShell(page);
  await expect(view(page).getByRole("button", { name: "CERRAR CAJA", exact: true })).toBeInViewport({ ratio: 1 });
});

test("artwork live conserva portada estática e identifica la caja neutra", async ({ page }) => {
  const album = { ...release("live-artwork", "Portada con procedencia live", "2002", "demo-vertice"), images: [{ url: "/images/discography/demo-0.png", width: 800, height: 800 }] };
  await page.route("**/api/artists/demo-vertice/albums?*", (route) => route.fulfill({ json: { items: [album], total: 1, nextOffset: null } }));
  await search(page, "Vértice");
  await results(page).getByRole("button").first().click();
  await scene(page).hover({ position: { x: 8, y: 28 } });
  await scene(page).getByRole("button", { name: `Seleccionar ${album.name}`, exact: true }).click();
  await expect(selected(page).locator('[data-artwork-source="neutral"]')).toHaveCount(1);
  await expect(scene(page).locator("img")).toHaveCount(0);
  expect(await selected(page).evaluate((node) => node.style.getPropertyValue("--cover"))).toBe("none");
  await expect(view(page).getByRole("img", { name: `Portada de ${album.name}` })).toBeVisible();
  await expect(view(page)).toContainText("PORTADA ESTÁTICA / CAJA NEUTRA");
  await selected(page).click();
  await expect(opened(page)).toHaveAttribute("data-album-id", album.id);
  await expect(opened(page).locator("img")).toHaveCount(0);
});

test("reduced motion conserva giro y navegación sin deriva ni WebGL en la escena", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await artist(page);
  await expect(scene(page)).toHaveAttribute("data-drifting", "false");
  await expect(scene(page).locator("canvas")).toHaveCount(0);
  await next(page).click();
  await expect(slider(page)).toHaveValue("2");
  await selected(page).click();
  await view(page).getByRole("button", { name: "GIRAR CD", exact: true }).click();
  await expect(page.getByTestId("artist-case-cd")).toHaveAttribute("data-flipped", "true");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(scene(page)).toHaveAttribute("data-mode", "browse");
  await expect(scene(page)).toHaveAttribute("data-drifting", "false");
});

test("WebGL no disponible conserva el Deck estático y las cajas operables", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (String(type).includes("webgl")) return null;
      return getContext.call(this, type, ...args);
    };
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-rail-ready="true"]')).toBeVisible();
  await expect(page.getByRole("img", { name: "CD: Neon Rooms" })).toBeVisible();
  await page.getByRole("button", { name: "Ir al capítulo Colección" }).click();
  await expect.poll(() => collection(page).evaluate((node) => Math.abs(node.getBoundingClientRect().left))).toBeLessThan(2);
  await artist(page);
  await next(page).click();
  await expect(slider(page)).toHaveValue("2");
  await selected(page).click();
  await expect(opened(page)).toHaveAttribute("data-album-id", "demo-vertice-album-1");
  await view(page).getByRole("button", { name: "GIRAR CD", exact: true }).click();
  await expect(page.getByTestId("artist-case-cd")).toHaveAttribute("data-flipped", "true");
});
