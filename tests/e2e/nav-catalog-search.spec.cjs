const { test, expect, collection, openRail, go } = require("./support/b2-harness.cjs");
const { makeAlbum, coverage } = require("../fixtures/collection-filters.cjs");

const input = (page) => page.getByRole("combobox", { name: "Buscar discos o artistas", exact: true });
const results = (page) => page.getByRole("listbox", { name: "Resultados de búsqueda", exact: true });
const popup = (page) => page.getByTestId("nav-catalog-search-results");
const grid = (page) => collection(page).locator("[data-collection-album-id]");
const genre = (page) => collection(page).getByRole("combobox", { name: "Filtrar por género", exact: true });
const decade = (page) => collection(page).getByRole("combobox", { name: "Filtrar por década", exact: true });
const year = (page) => collection(page).getByRole("combobox", { name: "Filtrar por año de edición", exact: true });

async function settledCollection(page) {
  await expect.poll(() => page.locator("[data-rail-wrapper] > div > section").nth(3)
    .evaluate((node) => Math.abs(node.getBoundingClientRect().left)), { timeout: 15000 }).toBeLessThan(2);
  await expect(page.locator("[data-rail-wrapper]").locator("..")).toHaveAttribute("data-rail-moving", "false");
}

async function collectionFixture(page, albums) {
  await page.route("**/api/collection?*", (route) => {
    const enriched = new URL(route.request().url()).searchParams.get("includeGenres") === "1";
    return route.fulfill({ json: albums.map((album) => ({ ...album, genres: enriched ? album.genres : [],
      genreMetadata: enriched ? coverage("complete", album.artists.length, album.artists.length) : undefined })),
    headers: { "X-CDV-Genres-State": enriched ? "complete" : "not-requested" } });
  });
}

test("normal mock: the single nav input searches from Deck and Split; Enter submits Collection and typing filters it live", async ({ page }) => {
  await openRail(page);
  await expect(input(page)).toHaveCount(1);
  for (const [chapter, index] of [["Deck", 0], ["Split", 1]]) {
    await go(page, chapter, index);
    await input(page).fill("vertice neon");
    await expect(popup(page)).toBeVisible();
    await expect(results(page).locator('[data-search-kind="album"][data-album-id="mock-album-01"]')).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-chapter", String(index));
    await input(page).press("Enter");
    await settledCollection(page);
    await expect(popup(page)).toHaveCount(0);
    await expect(input(page)).toHaveValue("vertice neon");
    await expect(grid(page)).toHaveCount(1);
    await expect(grid(page)).toHaveAttribute("data-collection-album-id", "mock-album-01");
    await expect(collection(page).getByRole("combobox", { name: "Buscar discos o artistas", exact: true })).toHaveCount(0);
  }
  await input(page).fill("sin coincidencias de catálogo");
  await expect(collection(page).getByText("Sin resultados para estos filtros", { exact: true })).toBeVisible();
  await expect(grid(page)).toHaveCount(0);
  await expect(popup(page).getByRole("status").filter({ hasText: "Sin resultados" })).toBeVisible();
  await expect(results(page).getByRole("option")).toHaveCount(0);
  await input(page).press("Escape");
  await expect(input(page)).toBeFocused();
  await expect(input(page)).toHaveValue("sin coincidencias de catálogo");
  await input(page).fill("NEON");
  await expect(grid(page)).toHaveCount(1);
});

test("normal mock: selecting an album from Split opens its edition and returns to the only Collection box with focus", async ({ page }) => {
  await openRail(page);
  await go(page, "Split", 1);
  await input(page).fill("Neon Rooms");
  const album = results(page).getByRole("option", { name: "Vértice Magnético — Neon Rooms", exact: true });
  await expect(album).toHaveAttribute("data-album-id", "mock-album-01");
  await expect(album.locator("img")).toBeVisible();
  await expect(album.locator("[data-search-year]")).toContainText(/^\d{4}$/);
  await album.click();
  await settledCollection(page);
  const detail = page.getByTestId("album-detail-page");
  await expect(detail).toHaveAttribute("data-album-id", "mock-album-01");
  await expect(popup(page)).toHaveCount(0);
  await detail.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(detail).toHaveCount(0);
  await expect(grid(page)).toHaveCount(1);
  await expect(grid(page)).toHaveAttribute("data-collection-album-id", "mock-album-01");
  await expect(grid(page)).toBeFocused();
});

test("normal mock: artist profile is first, its three album previews show covers and chronology, and keyboard selection opens Batea", async ({ page }) => {
  await openRail(page);
  await go(page, "Deck", 0);
  await input(page).fill("Vertice");
  const profile = results(page).getByRole("option", { name: "Explorar artista Vértice Magnético", exact: true });
  await expect(profile).toHaveAttribute("data-artist-id", "demo-vertice");
  await expect(results(page).getByRole("option").first()).toHaveAttribute("data-search-kind", "artist");
  const previews = results(page).locator('[data-search-kind="album"][data-search-preview="true"]');
  await expect(previews).toHaveCount(3);
  const years = (await previews.locator("[data-search-year]").allTextContents()).map((text) => Number(text.trim()));
  expect(years.every(Number.isFinite)).toBe(true);
  expect(years).toEqual([...years].sort((a, b) => a - b));
  await expect(previews.locator("img")).toHaveCount(3);
  for (const preview of await previews.all()) await expect(preview.locator("img")).toBeVisible();
  const ids = await previews.evaluateAll((nodes) => nodes.map((node) => node.dataset.albumId));
  expect(new Set(ids).size).toBe(3);
  await input(page).press("ArrowDown");
  await expect(profile).toHaveAttribute("aria-selected", "true");
  await expect(input(page)).toBeFocused();
  await input(page).press("Enter");
  await settledCollection(page);
  await expect(collection(page).getByTestId("artist-discography")).toHaveAttribute("data-artist-id", "demo-vertice");
  await expect(collection(page).locator("[data-batea-tray]")).toBeVisible();
  await expect(collection(page).getByRole("button", { name: "Quitar artista: Vértice Magnético", exact: true })).toBeVisible();
  await expect(grid(page).first()).toBeHidden();
  await expect(collection(page).getByRole("button", { name: "Buscar artista", exact: true })).toHaveCount(0);
  await expect(collection(page).getByRole("button", { name: "Tu colección", exact: true })).toHaveCount(0);
});

test("fixture catalog: dropdown keeps distinct editions, cover and year; external album selection returns to its exact unique box", async ({ page }) => {
  const artist = { id: "fixture-redondos", name: "Patricio Rey y sus Redonditos de Ricota", images: [] };
  const editions = [makeAlbum("fixture-gulp-original", "1985-04-22", ["rock"], { name: "Gulp!", artists: [artist], images: [{ url: "/images/discography/demo-0.png", width: 800, height: 800 }] }),
    makeAlbum("fixture-gulp-reedition", "2024-06-01", ["rock"], { name: "Gulp!", artists: [artist], images: [{ url: "/images/discography/demo-1.png", width: 800, height: 800 }] })];
  await collectionFixture(page, [makeAlbum("unrelated-saved", "1994", ["ambient"]), editions[0]]);
  await page.route("**/api/search?*", (route) => new URL(route.request().url()).searchParams.get("scope") === "catalog"
    ? route.fulfill({ json: { kind: "mixed", artists: [artist], albums: editions } }) : route.continue());
  await openRail(page);
  await go(page, "Deck", 0);
  await input(page).fill("patricio gulp");
  const choices = results(page).locator('[data-search-kind="album"]');
  await expect(choices).toHaveCount(2);
  expect(await choices.evaluateAll((nodes) => nodes.map((node) => node.dataset.albumId))).toEqual(editions.map((album) => album.id));
  expect((await choices.locator("[data-search-year]").allTextContents()).map((value) => value.trim())).toEqual(["1985", "2024"]);
  await expect(choices.locator("img")).toHaveCount(2);
  await results(page).locator('[data-album-id="fixture-gulp-reedition"]').click();
  await settledCollection(page);
  const detail = page.getByTestId("album-detail-page");
  await expect(detail).toHaveAttribute("data-album-id", "fixture-gulp-reedition");
  await detail.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(grid(page)).toHaveCount(1);
  await expect(grid(page)).toHaveAttribute("data-collection-album-id", "fixture-gulp-reedition");
  await expect(grid(page)).toContainText("2024");
  await expect(grid(page)).toBeFocused();
  await input(page).fill("gulp");
  await expect(choices).toHaveCount(2);
  await expect(grid(page)).toHaveCount(1);
  await expect(grid(page)).toHaveAttribute("data-collection-album-id", "fixture-gulp-original");
});

test("fixture collection: nav submission combines filters, preserves pagination and restores focused identity after album return", async ({ page }) => {
  const albums = Array.from({ length: 67 }, (_, index) => makeAlbum(`nav-saved-${index}`, "1994", ["rock"], { name: `Archivo ${index}`, images: [] }));
  await collectionFixture(page, albums);
  await page.route("**/api/search?*", (route) => new URL(route.request().url()).searchParams.get("scope") === "catalog"
    ? route.fulfill({ json: { kind: "empty", artists: [], albums: [] } }) : route.continue());
  await openRail(page);
  await go(page, "Deck", 0);
  await input(page).fill("Archivo");
  await input(page).press("Enter");
  await settledCollection(page);
  await expect(genre(page).locator('option[value="rock"]')).toBeAttached();
  await genre(page).selectOption("rock");
  await decade(page).selectOption("1990s");
  await year(page).selectOption("1994");
  const frame = collection(page).locator("[data-page-size]");
  await expect.poll(() => frame.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return [...node.querySelectorAll("[data-collection-album-id]")].every((card) => card.getBoundingClientRect().bottom <= bounds.bottom + 1);
  })).toBe(true);
  const capacity = Number(await frame.getAttribute("data-page-size"));
  expect(capacity).toBeGreaterThan(4);
  await expect(grid(page)).toHaveCount(capacity);
  await collection(page).getByRole("button", { name: "Siguiente", exact: true }).click();
  const id = await grid(page).nth(3).getAttribute("data-collection-album-id");
  const selected = frame.locator(`[data-collection-album-id="${id}"]`);
  await selected.focus();
  await selected.click();
  const detail = page.getByTestId("album-detail-page");
  await expect(detail).toHaveAttribute("data-album-id", id);
  await detail.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(selected).toBeFocused();
  await expect(input(page)).toHaveValue("Archivo");
  await expect(genre(page)).toHaveValue("rock");
  await expect(decade(page)).toHaveValue("1990s");
  await expect(year(page)).toHaveValue("1994");
  await expect(collection(page).locator("footer")).toContainText(/Página 2 de/);
  await go(page, "Split", 1);
  await go(page, "Colección", 3);
  await expect(selected).toBeVisible();
  await expect(collection(page).locator("footer")).toContainText(/Página 2 de/);
  await expect(input(page)).toHaveValue("Archivo");
});
