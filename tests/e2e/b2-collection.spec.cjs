const { test, expect, collection, cards, functionalFixture, openRail, go, saveEvidence, observeHttp } = require("./support/b2-harness.cjs");
const { makeAlbum, coverage } = require("../fixtures/collection-filters.cjs");

let http;
test.beforeEach(async ({ page }) => { await functionalFixture(page); http = observeHttp(page); });
test.afterEach(async ({ page }, testInfo) => { await saveEvidence(page, testInfo, { http }); });
const genreRow = (page) => collection(page).locator('[aria-label="Filtrar por género"]');
const decadeRow = (page) => collection(page).locator('[aria-label="Filtrar por década"]');
const genreStatus = (page) => collection(page).getByRole("status").filter({ hasText: /géneros|asociados/i });
const headers = (state, resolved, total) => ({ "X-CDV-Genres-State": state, "X-CDV-Genres-Resolved-Artists": String(resolved), "X-CDV-Genres-Total-Artists": String(total) });
const small = () => [makeAlbum("b2-radar-jazz", "2012", ["jazz"], { name: "Radar A" }), makeAlbum("b2-radar-ambient", "2012", ["ambient"], { name: "Radar B" }), makeAlbum("b2-seventies", "1973", ["krautrock"], { name: "Archivo 1973" })];
async function intercept(page, albums, enriched) {
  await page.route("**/api/collection?*", (route) => new URL(route.request().url()).searchParams.get("includeGenres") === "1" ? enriched(route) : route.fulfill({ json: albums.map((album) => ({ ...album, genres: [], genreMetadata: undefined })), headers: headers("not-requested", 0, albums.length) }));
}
async function openCollection(page) { await openRail(page); await go(page, "Colección", 3); await expect(cards(page).first()).toBeVisible(); }
async function loadGenres(page) { await expect(collection(page).getByRole("button", { name: "Cargar géneros", exact: true })).toHaveCount(0); }

test("géneros vacíos explican TODOS sin presentar una carga completa como catálogo de géneros", async ({ page }) => {
  const albums = small();
  await intercept(page, albums, (route) => route.fulfill({ json: albums.map((album) => ({ ...album, genres: [], genreMetadata: coverage("complete", 1, 1) })), headers: headers("empty", 3, 3) }));
  await openCollection(page); await loadGenres(page);
  await expect(genreRow(page)).toBeVisible();
  await expect(genreRow(page)).toHaveValue("all");
  await expect(genreStatus(page)).toContainText(/sin géneros|no.*géneros|géneros.*disponibles/i);
  await expect(cards(page)).toHaveCount(3);
  await expect(collection(page)).toContainText("Género del artista");
});

test("cobertura parcial conserva álbumes, avisa y permite completar géneros al reintentar", async ({ page }) => {
  const albums = small();
  let requests = 0;
  await intercept(page, albums, (route) => {
    requests++;
    const partial = requests === 1;
    return route.fulfill({ json: albums.map((album, index) => ({ ...album, genres: partial && index > 0 ? [] : album.genres, genreMetadata: coverage(partial && index > 0 ? "unavailable" : "complete", partial && index > 0 ? 0 : 1, 1) })), headers: headers(partial ? "partial" : "complete", partial ? 1 : 3, 3) });
  });
  await openCollection(page); await loadGenres(page);
  await expect(genreStatus(page)).toContainText(/parcial|incomplet/i);
  await expect(cards(page)).toHaveCount(3);
  await expect(genreRow(page).locator('option[value="jazz"]')).toHaveText("JAZZ");
  await genreRow(page).selectOption("jazz");
  await expect(cards(page)).toHaveCount(1);
  await collection(page).getByRole("button", { name: "Reintentar géneros", exact: true }).click();
  await expect(genreRow(page).locator('option[value="ambient"]')).toHaveText("AMBIENT");
  await expect(genreRow(page)).toHaveValue("jazz");
  await expect(cards(page)).toHaveCount(1);
  expect(requests).toBe(2);
});

test("fallo de géneros se informa y reintentar no borra el catálogo base", async ({ page }) => {
  const albums = small();
  let requests = 0;
  await intercept(page, albums, (route) => ++requests === 1 ? route.fulfill({ status: 503, json: { error: "GENRES_UNAVAILABLE" }, headers: { ...headers("error", 0, 3), "Retry-After": "0" } }) : route.fulfill({ json: albums.map((album) => ({ ...album, genreMetadata: coverage("complete", 1, 1) })), headers: headers("complete", 3, 3) }));
  await openCollection(page); await loadGenres(page);
  await expect(collection(page).getByRole("alert")).toContainText(/géneros/i);
  await expect(cards(page)).toHaveCount(3);
  await collection(page).getByRole("button", { name: "Reintentar géneros", exact: true }).click();
  await expect(genreRow(page).locator('option[value="jazz"]')).toHaveText("JAZZ");
  await expect(cards(page)).toHaveCount(3);
  expect(requests).toBe(2);
});

test("HTTP 200 con álbum inválido se informa sin crash y permite recuperar la colección", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const albums = small();
  let requests = 0;
  await page.route("**/api/collection?*", (route) => {
    const enriched = route.request().url().includes("includeGenres=1");
    if (enriched) return route.fulfill({ json: albums.map((album) => ({ ...album, genres: [], genreMetadata: coverage("complete", 1, 1) })), headers: headers("empty", 3, 3) });
    return route.fulfill({ status: 200, json: ++requests === 1 ? [{}] : albums.map((album) => ({ ...album, genres: [] })), headers: headers("not-requested", 0, 3) });
  });
  await openRail(page); await go(page, "Colección", 3);
  await expect(collection(page).getByRole("alert")).toContainText("La respuesta de la colección no es válida");
  await expect(cards(page)).toHaveCount(0);
  await collection(page).getByRole("button", { name: "Reintentar colección", exact: true }).click();
  await expect(cards(page)).toHaveCount(3);
  expect(requests).toBe(2);
  expect(errors).toEqual([]);
});

function large() {
  return [
    ...Array.from({ length: 34 }, (_, index) => makeAlbum(`b2-filler-${index}`, "2011", ["rock"], { name: `Disco ${index}` })),
    makeAlbum("b2-target", "2012", ["jazz"], { name: "Radar A" }),
    makeAlbum("b2-other-genre", "2012", ["ambient"], { name: "Radar B" }),
    makeAlbum("b2-other-decade", "2024", ["jazz"], { name: "Radar C" }),
    makeAlbum("b2-other-query", "2012", ["jazz"], { name: "Otro disco" }),
    makeAlbum("b2-artist-match", "2015", ["jazz"], { name: "Canción D", artists: [{ id: "b2-radar-artist", name: "Radar Ensemble" }] }),
    makeAlbum("b2-seventies", "1973", ["krautrock"], { name: "Historia 1973" }),
    makeAlbum("b2-nineties", "1997", ["trip hop"], { name: "Historia 1997" }),
    makeAlbum("b2-missing", undefined, ["jazz"], { name: "Sin fecha" }),
    makeAlbum("b2-empty-date", "", ["jazz"], { name: "Fecha vacía" }),
    makeAlbum("b2-invalid-date", "not-a-date", ["jazz"], { name: "Fecha inválida" }),
  ];
}
test("décadas y géneros son globales; búsqueda, década y género se combinan con AND", async ({ page }) => {
  const albums = large();
  await intercept(page, albums, (route) => route.fulfill({ json: albums.map((album) => ({ ...album, genreMetadata: coverage("complete", 1, 1) })), headers: headers("complete", 44, 44) }));
  await openCollection(page); await loadGenres(page);
  for (const label of ["1970s", "1990s", "2010s", "2020s", "SIN FECHA"]) await expect(decadeRow(page).getByRole("option", { name: label, exact: true })).toHaveCount(1);
  await expect(genreRow(page).locator('option[value="krautrock"]')).toHaveText("KRAUTROCK");
  await collection(page).getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(collection(page)).toContainText("Página 2 de 4");
  await collection(page).getByRole("searchbox", { name: "Buscar artista o álbum", exact: true }).fill("Radar");
  await expect(collection(page).getByRole("button", { name: "Siguiente", exact: true })).toHaveCount(0);
  await expect(decadeRow(page).getByRole("option", { name: "1970s", exact: true })).toHaveCount(1);
  await expect(genreRow(page).locator('option[value="krautrock"]')).toHaveText("KRAUTROCK");
  await decadeRow(page).selectOption("2010s");
  await genreRow(page).selectOption("jazz");
  await expect(cards(page)).toHaveCount(2);
  const labels = await cards(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
  expect(labels).toHaveLength(2);
  expect(labels.some((label) => label.endsWith(" — Radar A"))).toBe(true);
  expect(labels.some((label) => label === "Radar Ensemble — Canción D")).toBe(true);
  await genreRow(page).selectOption("all");
  await expect(cards(page)).toHaveCount(3); // Query and decade still apply.
  await genreRow(page).selectOption("jazz");
  await expect(cards(page)).toHaveCount(2);
  await collection(page).getByRole("searchbox", { name: "Buscar artista o álbum", exact: true }).fill("imposible");
  await expect(collection(page)).toContainText("Sin resultados para estos filtros");
  await expect(cards(page)).toHaveCount(0);
  await expect(decadeRow(page).getByRole("option", { name: "1970s", exact: true })).toHaveCount(1);
  await expect(genreRow(page).locator('option[value="krautrock"]')).toHaveText("KRAUTROCK");
  await collection(page).getByRole("button", { name: "Limpiar filtros", exact: true }).click();
  await expect(collection(page).getByRole("searchbox", { name: "Buscar artista o álbum", exact: true })).toHaveValue("");
  await expect(cards(page)).toHaveCount(14);
  await expect(collection(page)).toContainText("Página 1 de 4");
  await expect(collection(page).locator("header [role=status]")).toHaveCount(0);
  await collection(page).getByRole("searchbox", { name: "Buscar artista o álbum", exact: true }).fill("");
  await genreRow(page).selectOption("all");
  await decadeRow(page).selectOption("unknown");
  await expect(cards(page)).toHaveCount(3);
  const undated = await cards(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label").split(" — ").at(-1)));
  expect(undated.sort()).toEqual(["Sin fecha", "Fecha vacía", "Fecha inválida"].sort());
});
