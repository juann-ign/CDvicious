const fs = require("node:fs");
const path = require("node:path");
const { test, expect, collection, cards, functionalFixture, openRail, go } = require("./support/b2-harness.cjs");
const { makeAlbum, coverage } = require("../fixtures/collection-filters.cjs");

const genre = (page) => collection(page).getByRole("combobox", { name: "Filtrar por género", exact: true });
const decade = (page) => collection(page).getByRole("combobox", { name: "Filtrar por década", exact: true });
const year = (page) => collection(page).getByRole("combobox", { name: "Filtrar por año de edición", exact: true });
const query = (page) => collection(page).getByRole("searchbox", { name: "Buscar artista o álbum", exact: true });
const ids = (page) => cards(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-collection-album-id")));
async function openCollection(page) { await openRail(page); await go(page, "Colección", 3); await expect(cards(page).first()).toBeVisible(); }
async function loadGenres(page) { await expect(genre(page).locator('option[value="electronic"], option[value="rock"]').first()).toHaveCount(1); }

test.beforeEach(async ({ page }) => { await functionalFixture(page); });
test.afterEach(async ({ page }, testInfo) => {
  const state = await page.evaluate(() => ({
    inputs: [...document.querySelectorAll('[aria-label="La Colección"] :is(input,select)')].map((node) => ({ label: node.getAttribute("aria-label"), value: node.value })),
    cards: [...document.querySelectorAll('[data-collection-album-id]')].map((node) => ({ id: node.getAttribute("data-collection-album-id"), rect: node.getBoundingClientRect().toJSON() })),
    focus: document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent,
    text: document.querySelector('[aria-label="La Colección"]')?.textContent,
  }));
  const directory = path.resolve(".qa/readability/collection-tests");
  fs.mkdirSync(directory, { recursive: true });
  const stem = testInfo.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-");
  fs.writeFileSync(path.join(directory, `${stem}.json`), JSON.stringify({ status: testInfo.status, state }, null, 2));
  await page.screenshot({ path: path.join(directory, `${stem}.png`), animations: "disabled" });
});

test("Colección normal: búsqueda sin tildes, cuatro filtros y chips removibles respetan la edición", async ({ page }) => {
  await openCollection(page);
  await expect(cards(page)).toHaveCount(14);
  await expect(collection(page).locator("header [role=status]")).toHaveCount(0);
  await expect(collection(page).getByRole("button", { name: "Tu colección", exact: true })).toBeVisible();
  await expect(collection(page).getByRole("button", { name: "Buscar artista", exact: true })).toBeVisible();
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    await expect(cards(page)).toHaveCount(viewport.height <= 850 ? 14 : 16);
    const geometry = await collection(page).evaluate((node) => {
      const frame = node.querySelector('[class*="gridFrame"]').getBoundingClientRect();
      const faces = [...node.querySelectorAll('[data-collection-album-id] [class*="caseFace"]')].map((face) => face.getBoundingClientRect());
      const firstRow = faces.filter((face) => Math.abs(face.y - faces[0].y) < 2);
      return { width: faces[0].width, gaps: firstRow.slice(1).map((face, index) => face.x - firstRow[index].right), withinFrame: faces.every((face) => face.top >= frame.top && face.bottom <= frame.bottom) };
    });
    expect(geometry.width).toBeGreaterThanOrEqual(148);
    expect(geometry.gaps.every((gap) => gap >= 8 && gap <= 16)).toBe(true);
    expect(geometry.withinFrame).toBe(true);
  }
  const material = await collection(page).locator('[class*="gridFrame"]').evaluate((node) => ({ image: getComputedStyle(node).backgroundImage, color: getComputedStyle(node).backgroundColor }));
  expect(material).toEqual({ image: "none", color: "rgba(0, 0, 0, 0)" });
  await loadGenres(page);
  await genre(page).selectOption("electronic");
  await decade(page).selectOption("1990s");
  expect(await year(page).locator("option").evaluateAll((nodes) => nodes.map((node) => node.value))).toEqual(["all", "1995", "1994"]);
  await year(page).selectOption("1994");
  await query(page).fill("vertice");
  await expect(cards(page)).toHaveCount(1);
  expect(await ids(page)).toEqual(["demo-vertice-album-0"]);
  await expect(cards(page)).toContainText("Vértice Magnético");
  await expect(cards(page)).toContainText("1994");
  await expect(collection(page).getByRole("button", { name: "Siguiente", exact: true })).toHaveCount(0);
  await expect(collection(page).locator('[aria-label="Filtros activos"] button')).toHaveCount(5);
  await collection(page).getByRole("button", { name: "Quitar género: electronic", exact: true }).click();
  await expect(genre(page)).toHaveValue("all");
  await expect(year(page)).toHaveValue("1994");
  await expect(query(page)).toHaveValue("vertice");
  expect(await ids(page)).toEqual(["demo-vertice-album-0"]);
  await collection(page).getByRole("button", { name: "Quitar búsqueda: vertice", exact: true }).click();
  await expect(cards(page)).toHaveCount(2);
  await decade(page).selectOption("2020s");
  await expect(year(page)).toHaveValue("all");
  expect(await year(page).locator("option").evaluateAll((nodes) => nodes.map((node) => node.value))).toEqual(["all", "2024", "2023", "2022", "2021", "2020"]);
  await genre(page).selectOption("rock");
  await year(page).selectOption("2022");
  expect(await ids(page)).toEqual(["mock-album-03"]);
  await query(page).fill("sin coincidencia");
  await expect(collection(page).getByRole("status").filter({ hasText: "Sin resultados para estos filtros" })).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  await collection(page).getByRole("button", { name: "Limpiar filtros", exact: true }).click();
  await expect(cards(page)).toHaveCount(14);
  await expect(collection(page)).toContainText("Página 1 de 2");
  await expect(collection(page).locator('[aria-label="Filtros activos"]')).toHaveCount(0);
});

test("volver de una ficha conserva búsqueda, filtros, página y foco en el mismo ID", async ({ page }) => {
  const albums = Array.from({ length: 40 }, (_, index) => makeAlbum(`readable-${index}`, "1994", ["rock"], { name: `Órbita ${String(index + 1).padStart(2, "0")}`, artists: [{ id: "vertice-fixture", name: "Vértice Magnético" }], images: [{ url: "/images/mock-albums/01.png", width: 600, height: 600 }] }));
  await page.route("**/api/collection?*", (route) => {
    const enriched = new URL(route.request().url()).searchParams.get("includeGenres") === "1";
    return route.fulfill({ json: albums.map((album) => ({ ...album, genres: enriched ? album.genres : [], genreMetadata: enriched ? coverage("complete", 1, 1) : undefined })), headers: { "X-CDV-Genres-State": enriched ? "complete" : "not-requested", "X-CDV-Genres-Resolved-Artists": enriched ? "1" : "0", "X-CDV-Genres-Total-Artists": "1" } });
  });
  await openCollection(page);
  await loadGenres(page);
  await query(page).fill("orbita");
  await genre(page).selectOption("rock");
  await decade(page).selectOption("1990s");
  await year(page).selectOption("1994");
  await collection(page).getByRole("button", { name: "Siguiente", exact: true }).click();
  const pages = Math.ceil(albums.length / Number(await collection(page).locator('[data-page-size]').getAttribute('data-page-size')));
  await expect(collection(page)).toContainText(`Página 2 de ${pages}`);
  const before = await ids(page);
  const chosen = cards(page).nth(3);
  const chosenId = await chosen.getAttribute("data-collection-album-id");
  await chosen.click();
  const detail = page.getByTestId("album-detail-page");
  const rail = page.locator("[data-rail-wrapper]");
  const back = detail.getByRole("button", { name: "Volver", exact: true });
  await expect(detail).toBeVisible();
  await expect(detail).toHaveAttribute("data-album-id", chosenId);
  await expect(detail.getByTestId("jewel-case-presentation")).toHaveAttribute("data-presentation", "closed");
  await expect(rail).toBeHidden();
  await expect(rail).toHaveAttribute("inert", "");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(back).toBeFocused();
  await back.click();
  await expect(detail).toHaveCount(0);
  await expect(query(page)).toHaveValue("orbita");
  await expect(genre(page)).toHaveValue("rock");
  await expect(decade(page)).toHaveValue("1990s");
  await expect(year(page)).toHaveValue("1994");
  await expect(collection(page)).toContainText(`Página 2 de ${pages}`);
  expect(await ids(page)).toEqual(before);
  const restoredCard = collection(page).locator(`[data-collection-album-id="${chosenId}"]`);
  await expect(restoredCard).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(detail).toHaveAttribute("data-album-id", chosenId);
  await expect(back).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(rail).toBeVisible();
  await expect(restoredCard).toBeFocused();

  // Resizing while the selected chapter is hidden changes its page size and
  // rail coordinates. Preserve the exact album anchor and origin chapter.
  const grid = rail.locator("[data-page-size]");
  const originalSize = await grid.getAttribute("data-page-size");
  await page.keyboard.press("Enter");
  await expect(detail).toHaveAttribute("data-album-id", chosenId);
  await page.setViewportSize({ width: 1920, height: 900 });
  await expect(grid).not.toHaveAttribute("data-page-size", originalSize);
  await expect(page.locator("html")).toHaveAttribute("data-chapter", "3");
  await expect(detail).toHaveAttribute("data-album-id", chosenId);
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(query(page)).toHaveValue("orbita");
  await expect(genre(page)).toHaveValue("rock");
  await expect(decade(page)).toHaveValue("1990s");
  await expect(year(page)).toHaveValue("1994");
  await expect(restoredCard).toBeVisible();
  await expect(restoredCard).toBeFocused();
});

test("Artista normal: Vertice y Satelite mantienen nombres, resultados y foco al volver", async ({ page }) => {
  let requests = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/search") requests++; });
  await openCollection(page);
  await query(page).fill("neon");
  await collection(page).getByRole("button", { name: "Buscar artista", exact: true }).click();
  const artistQuery = page.getByRole("searchbox", { name: "Buscar artistas", exact: true });
  await artistQuery.fill("Vertice");
  const results = collection(page).locator('[aria-label="Resultados de artistas"]');
  await expect(results.getByRole("button").first()).toContainText("Vértice Magnético");
  await results.getByRole("button").first().click();
  const view = page.getByTestId("artist-discography");
  await expect(view.locator("header [role=status]")).toContainText("27 LANZAMIENTOS");
  await view.getByRole("button", { name: /VOLVER A RESULTADOS/ }).click();
  await expect(artistQuery).toHaveValue("Vertice");
  await expect(results.getByRole("button").first()).toBeFocused();
  // Allow the existing 300ms debounce to elapse: returning to completed results
  // must not refetch and unmount the button that just regained focus.
  await page.waitForTimeout(450);
  expect(requests).toBe(1);
  await artistQuery.fill("Satelite");
  await expect(results.getByRole("button").first()).toContainText("Satélite Sur");
  await collection(page).getByRole("button", { name: /TU COLECCIÓN/ }).click();
  await expect(query(page)).toHaveValue("neon");
  await expect(cards(page)).toHaveCount(1);
  await expect(collection(page).getByRole("button", { name: "Buscar artista", exact: true })).toBeFocused();
});
