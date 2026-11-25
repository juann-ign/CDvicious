const { test, expect, booklet, lyricFaces, functionalFixture, openRail, go, installMock, setTrack, visibleLyrics, saveEvidence, observeHttp } = require("./support/b2-harness.cjs");

let http;
test.beforeEach(async ({ page }) => { await functionalFixture(page); http = observeHttp(page); });
test.afterEach(async ({ page }, testInfo) => { await saveEvidence(page, testInfo, { http }); });

test("HTTP 200 recibido fuera de Split se presenta al entrar sin pedir la letra otra vez", async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const text = "B2 LETRA CONFIRMADA FUERA DE SPLIT\nPrimera línea de prueba.\nSegunda línea de prueba.";
  await page.route("**/api/lyrics?*", async (route) => { await gate; await route.fulfill({ status: 200, json: { lyrics: text } }); });
  await openRail(page);
  await go(page, "Colección", 3);
  const response = page.waitForResponse((item) => item.url().includes("/api/lyrics?") && item.status() === 200);
  release();
  await (await response).finished();
  const requests = http.filter((row) => row.type === "request").length;
  await go(page, "Split", 1);
  await expect(lyricFaces(page).first()).toContainText("B2 LETRA CONFIRMADA FUERA DE SPLIT");
  expect(await visibleLyrics(page)).toBe(text);
  expect(http.filter((row) => row.type === "request").length).toBe(requests);
});

test("respuesta tardía de A no reemplaza la letra ni el encabezado de B", async ({ page }) => {
  let releaseOld;
  let oldDone;
  const oldGate = new Promise((resolve) => { releaseOld = resolve; });
  const oldSettled = new Promise((resolve) => { oldDone = resolve; });
  await page.route("**/api/lyrics?*", async (route) => {
    const title = new URL(route.request().url()).searchParams.get("title");
    if (title === "B2 PISTA A") {
      await oldGate;
      await route.fulfill({ json: { lyrics: "B2 RESPUESTA VIEJA A" } }).catch(() => {});
      oldDone();
    } else await route.fulfill({ json: { lyrics: title === "B2 PISTA B" ? "B2 LETRA ACTUAL B" : "B2 LETRA INICIAL" } });
  });
  await openRail(page); await installMock(page); await go(page, "Split", 1);
  const requestA = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/lyrics" && new URL(request.url()).searchParams.get("title") === "B2 PISTA A");
  await setTrack(page, "b2-track-a", "B2 PISTA A"); await requestA;
  await setTrack(page, "b2-track-b", "B2 PISTA B");
  await expect(lyricFaces(page).first()).toContainText("B2 LETRA ACTUAL B");
  releaseOld(); await oldSettled;
  // Let the fulfilled old request's React continuation complete before reading.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(lyricFaces(page).first()).toContainText("B2 LETRA ACTUAL B");
  await expect(booklet(page).getByRole("heading")).toHaveText("B2 PISTA B");
  expect(await visibleLyrics(page)).not.toContain("RESPUESTA VIEJA");
});

test("HTTP 200 con whitespace muestra estado sin letra en lugar de páginas vacías", async ({ page }) => {
  await page.route("**/api/lyrics?*", (route) => route.fulfill({ status: 200, json: { lyrics: " \n\t\n " } }));
  await openRail(page); await go(page, "Split", 1);
  await expect(booklet(page)).toContainText(/no.*letra|letra.*no.*disponible|sin letra/i);
});

test("la letra pagina mientras otra fuente sigue pendiente, y se ajusta al quedar lista", async ({ page }) => {
  await page.addInitScript(() => {
    const originalReady = document.fonts.ready;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    window.__lyricFontReadyPending = true;
    Object.defineProperty(document.fonts, "ready", { configurable: true, value: gate.then(() => originalReady) });
    window.__releaseLyricFontReady = () => { window.__lyricFontReadyPending = false; release(); };
  });
  const lyrics = Array.from({ length: 40 }, (_, index) => `Verso ${index + 1}`).join("\n");
  await page.route("**/api/lyrics?*", route => route.fulfill({ json: { lyrics } }));
  await openRail(page); await go(page, "Split", 1);
  const root = page.getByTestId("lyrics-booklet");
  await expect(root).toHaveAttribute("data-pagination-state", "ready");
  await expect(lyricFaces(page).first()).toContainText("Verso 1");
  expect(await page.evaluate(() => window.__lyricFontReadyPending)).toBe(true);
  const count = Number(await root.getAttribute("data-pagination-count"));
  await page.addStyleTag({ content: '[data-testid="lyrics-booklet"] :is([class*="bookletLyrics"], [class*="bookletMeasureLyrics"], [class*="bookletLineMeasureSource"]) { line-height: 2.75 !important; }' });
  await page.evaluate(() => window.__releaseLyricFontReady());
  await expect.poll(async () => Number(await root.getAttribute("data-pagination-count"))).toBeGreaterThan(count);
  await expect(root).toHaveAttribute("data-pagination-state", "ready");
  await expect(lyricFaces(page).first()).toContainText("Verso 1");
});

test("pausa y reanudación conservan el texto y la página sin otra solicitud", async ({ page }) => {
  const lyrics = Array.from({ length: 70 }, (_, index) => `B2 VERSO ${String(index + 1).padStart(3, "0")} — texto de prueba.`).join("\n");
  await page.route("**/api/lyrics?*", (route) => route.fulfill({ json: { lyrics } }));
  await openRail(page); await go(page, "Split", 1);
  await expect(lyricFaces(page).first()).toContainText("B2 VERSO 001");
  await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-pagination-state", "ready");
  await booklet(page).getByRole("button", { name: "Páginas siguientes", exact: true }).click();
  const before = await visibleLyrics(page);
  const count = http.filter((row) => row.type === "request").length;
  const toggle = page.locator("[data-physical-deck]").getByRole("button", { name: "Pausar/reanudar equipo", exact: true });
  await toggle.click();
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "false");
  expect(await visibleLyrics(page)).toBe(before);
  await toggle.click();
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "true");
  expect(await visibleLyrics(page)).toBe(before);
  expect(http.filter((row) => row.type === "request").length).toBe(count);
});

async function collectPages(page) {
  const text = [];
  const seen = new Set();
  for (let step = 0; step < 100; step++) {
    // A measured page must fit its actual face; the full-text fallback is
    // intentionally scrollable and is tested separately in the zero fixture.
    await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-pagination-state", "ready");
    await expect.poll(() => lyricFaces(page).evaluateAll((nodes) => nodes.map((node, index) => {
      const visibleText = [...node.childNodes].filter(child => child.nodeType === Node.TEXT_NODE || !child.hidden).map(child => child.textContent).join("");
      const boundaryMarkers = [...node.querySelectorAll('[data-lyric-boundary]')];
      return { index, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight,
        leadingBlank: /^(?:[^\S\n]*\n)+/.test(visibleText), trailingBlank: /(?:\n[^\S\n]*)+$/.test(visibleText),
        visibleBoundary: boundaryMarkers.some(marker => getComputedStyle(marker).display !== "none" || marker.getAttribute("aria-hidden") !== "true") };
    }).filter(item => item.scrollHeight > item.clientHeight + 2 || item.leadingBlank || item.trailingBlank || item.visibleBoundary))).toEqual([]);
    const spread = await visibleLyrics(page);
    if (seen.has(spread)) throw new Error("La navegación repitió un spread sin avanzar");
    seen.add(spread); text.push(spread);
    const next = booklet(page).getByRole("button", { name: "Páginas siguientes", exact: true });
    if (await next.count() === 0 || await next.isDisabled()) return text.join("");
    await next.click();
    await expect.poll(() => visibleLyrics(page)).not.toBe(spread);
  }
  throw new Error("El booklet no terminó después de 100 spreads");
}

test("las estrofas paginan con wrapping íntegro y sin blancos al iniciar una hoja", async ({ page }) => {
  const lyrics = Array.from({ length: 16 }, (_, index) => `ESTROFA ${index + 1}\nUna señal cruza el cristal y vuelve al sur hasta que cae lentamente la noche.\nTodavía me acuerdo.`).join("\n\n\n");
  await page.route("**/api/lyrics?*", route => route.fulfill({ json: { lyrics } }));
  await openRail(page); await go(page, "Split", 1);
  const root = page.getByTestId("lyrics-booklet");
  await expect(root).toHaveAttribute("data-pagination-state", "ready");
  expect(Number(await root.getAttribute("data-pagination-count"))).toBeGreaterThan(2);
  expect(await lyricFaces(page).locator('[data-lyric-boundary="trailing"]').count()).toBeGreaterThan(0);
  expect(await collectPages(page)).toBe(lyrics);
});
test("letra extensa y título largo conservan todos los versos al paginar y redimensionar", async ({ page }) => {
  const lyrics = Array.from({ length: 115 }, (_, index) => `B2 LINEA ${String(index + 1).padStart(3, "0")} — Una señal cruza el cristal y vuelve al sur.`).join("\n");
  await page.route("**/api/lyrics?*", (route) => route.fulfill({ json: { lyrics } }));
  await openRail(page); await installMock(page); await go(page, "Split", 1);
  await setTrack(page, "b2-long-track", "B2 TÍTULO MUY LARGO / ".repeat(16));
  await expect(lyricFaces(page).first()).toContainText("B2 LINEA 001");
  await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-pagination-state", "ready");
  expect(Number(await page.getByTestId("lyrics-booklet").getAttribute("data-pagination-count"))).toBeGreaterThan(2);
  expect(await collectPages(page)).toBe(lyrics);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-pagination-state", "ready");
  const previous = booklet(page).getByRole("button", { name: "Páginas anteriores", exact: true });
  for (let index = 0; index < 100 && await previous.count() && !await previous.isDisabled(); index++) await previous.click();
  await expect(lyricFaces(page).first()).toContainText("B2 LINEA 001");
  expect(await collectPages(page)).toBe(lyrics);
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-pagination-state", "ready");
  for (let index = 0; index < 100 && await previous.count() && !await previous.isDisabled(); index++) await previous.click();
  await expect(lyricFaces(page).first()).toContainText("B2 LINEA 001");
  expect(await collectPages(page)).toBe(lyrics);
});

test("loading, instrumental, sin letra y error recuperable tienen estados visibles diferentes", async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let errorRequests = 0;
  await page.route("**/api/lyrics?*", async (route) => {
    const title = new URL(route.request().url()).searchParams.get("title");
    if (title === "B2 ESTADO CARGANDO") { await gate; return route.fulfill({ json: { status: "instrumental", lyrics: null, provenance: { provider: "lrclib", match: "exact" } } }); }
    if (title === "B2 ESTADO VACÍO") return route.fulfill({ json: { lyrics: " \n\t " } });
    if (title === "B2 ESTADO ERROR" && ++errorRequests === 1) return route.fulfill({ status: 502, json: { status: "error", lyrics: null, error: "B2 No se pudo consultar el proveedor de letras.", provenance: { provider: "lrclib" } } });
    return route.fulfill({ json: { lyrics: title === "B2 ESTADO ERROR" ? "B2 LETRA RECUPERADA" : "B2 LETRA INICIAL" } });
  });
  await openRail(page); await installMock(page); await go(page, "Split", 1);
  const root = page.getByTestId("lyrics-booklet");
  await setTrack(page, "b2-state-loading", "B2 ESTADO CARGANDO");
  await expect(root).toHaveAttribute("data-status", "loading");
  await expect(page.getByTestId("lyrics-status")).toContainText("CARGANDO LETRA");
  release();
  await expect(root).toHaveAttribute("data-status", "instrumental");
  await expect(page.getByTestId("lyrics-status")).toContainText("PISTA INSTRUMENTAL");
  expect(await visibleLyrics(page)).toBe("");
  await setTrack(page, "b2-state-empty", "B2 ESTADO VACÍO");
  await expect(root).toHaveAttribute("data-status", "unavailable");
  await expect(page.getByTestId("lyrics-status")).toContainText("LETRA NO DISPONIBLE");
  await expect(booklet(page)).not.toContainText("PISTA INSTRUMENTAL");
  await setTrack(page, "b2-state-error", "B2 ESTADO ERROR");
  await expect(root).toHaveAttribute("data-status", "error");
  await expect(booklet(page).getByRole("alert")).toContainText("No se pudo consultar");
  expect(await visibleLyrics(page)).toBe("");
  await booklet(page).getByRole("button", { name: "REINTENTAR", exact: true }).click();
  await expect(root).toHaveAttribute("data-status", "available");
  await expect(lyricFaces(page).first()).toContainText("B2 LETRA RECUPERADA");
  expect(errorRequests).toBe(2);
});

test("fixture controlada: medición de host cero se recupera al restaurar su tamaño", async ({ page }, testInfo) => {
  const text = "B2 CONTENIDO MEDIDO DESPUÉS DE CERO\nVerso uno.\nVerso dos.";
  await page.route("**/api/lyrics?*", (route) => route.fulfill({ json: { lyrics: text } }));
  await openRail(page); await installMock(page); await go(page, "Split", 1);
  // This deliberately imposed layout is a controlled recovery fixture. It is
  // not presented as a naturally observed hidden-Split failure.
  const style = await page.addStyleTag({ content: "[data-rail-booklet] { width: 0 !important; height: 0 !important; }" });
  await setTrack(page, "b2-zero-track", "B2 HOST CERO");
  await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-status", "available");
  const zero = await booklet(page).evaluate((node) => ({ width: node.clientWidth, height: node.clientHeight }));
  expect(zero.height).toBe(0);
  await testInfo.attach("controlled-zero-measurement", { body: JSON.stringify({ controlledFixture: true, ...zero }), contentType: "application/json" });
  const count = http.filter((row) => row.type === "request").length;
  await style.evaluate((node) => node.remove());
  await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-pagination-state", "ready");
  await expect(lyricFaces(page).first()).toContainText("B2 CONTENIDO MEDIDO DESPUÉS DE CERO");
  expect(await visibleLyrics(page)).toBe(text);
  expect(http.filter((row) => row.type === "request").length).toBe(count);
});

test("una línea extensa se reparte sin perder ni duplicar caracteres", async ({ page }) => {
  const lyrics = Array.from({ length: 450 }, (_, index) => `palabra-${String(index).padStart(3, "0")}`).join(" ");
  await page.route("**/api/lyrics?*", (route) => route.fulfill({ json: { lyrics } }));
  await openRail(page); await go(page, "Split", 1);
  await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-pagination-state", "ready");
  expect(Number(await page.getByTestId("lyrics-booklet").getAttribute("data-pagination-count"))).toBeGreaterThan(1);
  expect(await collectPages(page)).toBe(lyrics);
});
