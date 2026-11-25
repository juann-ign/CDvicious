const { test, expect } = require("./support/qa-evidence.cjs");
const { openRail, go, functionalFixture, installMock } = require("./support/b2-harness.cjs");

// Normal desktop renderer. Only the two explicitly named fallback cases
// override motion/WebGL; catalog, lyrics, playback and snapshots stay normal.
test.use({ launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });
const collection = (page) => page.getByRole("region", { name: "La Colección", exact: true });
const hardware = (page) => page.locator("[data-physical-deck]");
const display = (page) => page.getByTestId("deck-now-playing");
const title = (page) => page.getByTestId("deck-now-playing-track");
const flight = (page) => page.getByTestId("rail-flying-disc");
const detail = (page) => page.getByTestId("album-detail-page");
const quad = async (locator, attribute = "data-disc-pose-corner") => locator.evaluate((node, attr) =>
  Object.fromEntries(["tl", "tr", "bl", "br"].map((key) => {
    const marker = node.querySelector(`[${attr}="${key}"]`);
    const box = marker.getBoundingClientRect(); return [key, { x: box.left, y: box.top }];
  })), attribute);
const distance = (a, b) => Math.max(...["tl", "tr", "bl", "br"].map((key) => Math.hypot(a[key].x - b[key].x, a[key].y - b[key].y)));

async function observe(page) {
  await page.addInitScript(() => {
    window.__deckReview = { events: [], source: null, firstFlight: null };
    const read = (node, attr = "data-disc-pose-corner") => {
      if (!node) return null;
      const points = {};
      for (const key of ["tl", "tr", "bl", "br"]) {
        const marker = node.querySelector(`[${attr}="${key}"]`);
        if (!marker) return null;
        const box = marker.getBoundingClientRect(); points[key] = { x: box.left, y: box.top };
      }
      return points;
    };
    for (const name of ["started", "arrived", "done", "playback-ready", "playback-started", "cancelled"]) {
      window.addEventListener(`cdvicious:disc-flight-${name}`, (event) => {
        const detail = event.detail;
        if (name === "started") {
          const source = [...document.querySelectorAll('[data-testid="jewel-case-cd"], [data-testid="artist-case-cd"]')]
            .find((node) => node.getBoundingClientRect().width > 0 && getComputedStyle(node).opacity !== "0");
          window.__deckReview.source = read(source);
        }
        window.__deckReview.events.push({ name, at: performance.now(), attemptId: detail?.attemptId,
          target: name === "arrived" ? read(document.querySelector("[data-deck-disc-target]")) : null,
          flight: name === "arrived" ? read(document.querySelector('[data-testid="rail-flying-disc"]'), "data-flight-pose-corner") : null,
          title: document.querySelector('[data-testid="deck-now-playing-track"]')?.textContent,
        });
      });
    }
    window.addEventListener("DOMContentLoaded", () => {
      const observer = new MutationObserver(() => {
        if (window.__deckReview.firstFlight) return;
        const node = document.querySelector('[data-testid="rail-flying-disc"]');
        if (!node || !getComputedStyle(node).transform.startsWith("matrix3d")) return;
        const points = read(node, "data-flight-pose-corner");
        if (points) { window.__deckReview.firstFlight = points; observer.disconnect(); }
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });
    });
  });
}

async function fromCollection(page, album = "Nocturnal FM") {
  await go(page, "Colección", 3);
  await collection(page).getByRole("button", { name: new RegExp(` — ${album}$`) }).first().click();
  await expect(detail(page)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return detail(page).getByRole("button", { name: `Reproducir ${album}`, exact: true });
}
async function openCase(page) {
  await detail(page).getByRole("button", { name: "Abrir caja", exact: true }).click();
  await expect(detail(page).getByTestId("jewel-case-presentation")).toHaveAttribute("data-presentation", "open");
}
async function assertConfirmed(page, artist) {
  await expect(display(page)).toHaveAttribute("data-is-playing", "true");
  await expect(page.getByTestId("deck-now-playing-artist")).toHaveText(artist);
  await expect(page.locator("[data-rail-overlay]")).toHaveAttribute("data-playback-phase", "confirmed");
  await expect(hardware(page)).toHaveAttribute("data-deck-pose", "docked");
  await expect(flight(page)).toHaveCount(0);
  const events = await page.evaluate(() => window.__deckReview.events);
  const names = events.map((event) => event.name);
  const started = events.find((event) => event.name === "started");
  const arrived = events.find((event) => event.name === "arrived");
  const confirmed = events.find((event) => event.name === "playback-started");
  expect(names.filter((name) => name === "started")).toHaveLength(1);
  expect(names.filter((name) => name === "arrived")).toHaveLength(1);
  expect(names.indexOf("arrived")).toBeGreaterThan(names.indexOf("started"));
  expect(names.indexOf("playback-started")).toBeGreaterThan(names.indexOf("arrived"));
  expect(arrived.attemptId).toBe(started.attemptId);
  expect(confirmed.attemptId).toBe(started.attemptId);
  return { events, started, arrived, confirmed };
}

test.afterEach(async ({ page }, testInfo) => {
  const state = await page.evaluate(() => ({
    review: window.__deckReview, chapter: document.documentElement.dataset.chapter,
    phase: document.querySelector("[data-rail-overlay]")?.getAttribute("data-playback-phase"),
    vfd: document.querySelector('[data-testid="deck-now-playing"]')?.textContent,
    sound: document.querySelector("[data-global-player]")?.getAttribute("data-dock-click"),
  })).catch((error) => ({ error: error.message }));
  await testInfo.attach("physical-deck-state", { body: JSON.stringify(state, null, 2), contentType: "application/json" });
});

test("physical-deck: Colección conserva el CD real girado y reverso, carga una vez y acopla antes de confirmar", async ({ page }) => {
  await observe(page); await openRail(page);
  const requests = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/play") requests.push(request.postDataJSON()); });
  const play = await fromCollection(page);
  await openCase(page);
  const source = detail(page).getByTestId("jewel-case-cd");
  await source.focus(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await detail(page).getByRole("button", { name: "GIRAR CD", exact: true }).click();
  await expect(source).toHaveAttribute("data-flipped", "true");
  await expect.poll(() => source.evaluate((node) => node.getAnimations().every((animation) => animation.playState !== "running"))).toBe(true);
  await play.dblclick();
  await expect(title(page)).toHaveText("CARGANDO");
  const result = await assertConfirmed(page, "Satélite Sur");
  expect(requests).toHaveLength(1);
  const origin = await page.evaluate(() => ({ source: window.__deckReview.source, first: window.__deckReview.firstFlight }));
  expect(origin.source).not.toBeNull(); expect(origin.first).not.toBeNull();
  expect(distance(origin.source, origin.first)).toBeLessThan(1);
  expect(distance(result.arrived.target, result.arrived.flight)).toBeLessThan(1);
  await expect(hardware(page).locator("[data-deck-inserted-disc]")).toBeVisible();
  await expect(hardware(page).locator("[data-deck-inserted-disc] img")).toHaveCount(0);
  await expect(page.locator("[data-global-player]")).toHaveAttribute("data-dock-click", "played");
});

test("physical-deck: Artista comparte la ficha, recupera el foco y abre la caja antes de tomar el CD", async ({ page }) => {
  await observe(page); await openRail(page); await go(page, "Colección", 3);
  await collection(page).getByRole("button", { name: "Buscar artista", exact: true }).click();
  await page.getByRole("searchbox", { name: "Buscar artistas", exact: true }).fill("Vertice");
  await collection(page).locator('[aria-label="Resultados de artistas"]').getByRole("button").first().click();
  const scene = page.getByTestId("artist-disc-scene");
  await scene.hover({ position: { x: 8, y: 28 } });
  const album = scene.getByRole("button", { name: "Seleccionar Campo magnético", exact: true });
  const selectedId = await album.getAttribute("data-album-id");
  const source = scene.locator(`button[data-album-id="${selectedId}"]`);
  await album.click();
  await expect(detail(page).getByTestId("jewel-case-presentation")).toHaveAttribute("data-presentation", "closed");
  await detail(page).getByRole("button", { name: /Volver/i }).click();
  await expect(detail(page)).toHaveCount(0);
  await expect(source).toBeFocused();
  await source.click();
  await detail(page).getByRole("button", { name: "Reproducir Campo magnético", exact: true }).dblclick();
  await expect(title(page)).toHaveText("CARGANDO");
  await assertConfirmed(page, "Vértice Magnético");
  await expect(title(page)).toHaveText("Órbita de papel");
  expect(await page.evaluate(() => window.__deckReview.source)).not.toBeNull();
  await go(page, "Colección", 3);
  await expect(source).toHaveAttribute("data-album-id", selectedId);
});

test("physical-deck: Batea comparte el mismo ejecutor y dispositivo confirmado", async ({ page }) => {
  await observe(page); await openRail(page); await go(page, "Batea", 2);
  const crate = page.getByRole("region", { name: "La Batea", exact: true });
  const candidates = crate.getByRole("button", { name: / — Ciudad de Vidrio$/ });
  await expect(candidates.first()).toBeAttached();
  await crate.locator('[class*="stage"]').first().hover();
  const visibleIndex = await candidates.evaluateAll((nodes) => {
    const frame = nodes[0].closest('[class*="viewport"]').getBoundingClientRect();
    return nodes.findIndex((node) => { const box = node.getBoundingClientRect(); return box.left + box.width / 2 > frame.left && box.left + box.width / 2 < frame.right; });
  });
  expect(visibleIndex).toBeGreaterThanOrEqual(0);
  await candidates.nth(visibleIndex).click();
  await expect(detail(page)).toBeVisible();
  await detail(page).getByRole("button", { name: "Reproducir Ciudad de Vidrio", exact: true }).click();
  await expect(title(page)).toHaveText("CARGANDO");
  const result = await assertConfirmed(page, "Los Inerciales");
  expect(result.confirmed.attemptId).toBe(result.started.attemptId);
});

test("physical-deck: redimensionar durante el vuelo usa el eje vigente y Split conserva el mismo equipo y estado", async ({ page }) => {
  await observe(page); await openRail(page);
  const play = await fromCollection(page);
  await openCase(page); await play.click(); await expect(flight(page)).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  const result = await assertConfirmed(page, "Satélite Sur");
  expect(distance(result.arrived.target, result.arrived.flight)).toBeLessThan(1);
  const track = await title(page).textContent();
  await hardware(page).evaluate((node) => { window.__originalDeck = node; });
  await go(page, "Split", 1);
  await expect(title(page)).toHaveText(track);
  expect(await hardware(page).evaluate((node) => node === window.__originalDeck)).toBe(true);
  const physical = await hardware(page).locator("[data-deck-front]").boundingBox();
  const booklet = await page.locator('[data-rail-booklet] [aria-label="Booklet de letras"]').boundingBox();
  expect(physical.x + physical.width).toBeLessThan(booklet.x + 1);
  await expect(page.locator('[data-rail-booklet] [aria-label="Booklet de letras"]')).toBeInViewport();
  const rotor = hardware(page).locator('[data-deck-inserted-disc] > div');
  const angle = () => rotor.evaluate((node) => { const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform); return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI; });
  const before = await angle(); await page.waitForTimeout(180); const after = await angle();
  expect((after - before + 360) % 360).toBeGreaterThan(0);
  expect((after - before + 360) % 360).toBeLessThan(90);
});

test("physical-deck: retorno desde pestaña oculta termina un solo acople del intento vigente", async ({ page }) => {
  // Explicit visibility fixture; no provider or request is intercepted.
  await page.addInitScript(() => {
    window.__deckVisibility = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => window.__deckVisibility });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => window.__deckVisibility !== "visible" });
  });
  await observe(page); await openRail(page);
  const play = await fromCollection(page); await openCase(page); await play.click();
  await expect(flight(page)).toBeVisible();
  await page.evaluate(() => { window.__deckVisibility = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(4100);
  expect(await page.evaluate(() => window.__deckReview.events.filter((event) => event.name === "arrived").length)).toBe(0);
  await page.evaluate(() => { window.__deckVisibility = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
  await assertConfirmed(page, "Satélite Sur");
});

for (const fallback of ["movimiento reducido", "sin WebGL"]) {
  test(`physical-deck: ${fallback} llega inmediatamente, confirma igual y conserva representación estática`, async ({ page }) => {
    if (fallback === "movimiento reducido") await page.emulateMedia({ reducedMotion: "reduce" });
    else await functionalFixture(page);
    await observe(page); await openRail(page);
    const play = await fromCollection(page); await play.click();
    const result = await assertConfirmed(page, "Satélite Sur");
    expect(result.arrived.at - result.started.at).toBeLessThan(600);
    await expect(hardware(page).locator("[data-deck-mechanism]")).toHaveAttribute("data-deck-static", "true");
    await expect(hardware(page).locator("[data-deck-mechanism]")).toHaveAttribute("data-disc-spinning", "false");
  });
}

test("physical-deck: la confirmación entrega el control a Now Playing y no reaparece después de vaciarlo", async ({ page }) => {
  await observe(page); await openRail(page);
  const play = await fromCollection(page); await play.click(); await assertConfirmed(page, "Satélite Sur");
  // Explicit post-confirmation snapshot fixture, exercising ordinary transport.
  await installMock(page);
  await page.evaluate(() => window.__b2Mock.mockSpotifyPlayer.pause());
  await expect(display(page)).toHaveAttribute("data-is-playing", "false");
  await page.evaluate(() => window.__b2Mock.restoreMockSnapshot({ data: null, error: false }));
  await expect(title(page)).toHaveText("INSERT DISC");
  await expect(hardware(page)).toHaveAttribute("data-deck-pose", "wait");
});
