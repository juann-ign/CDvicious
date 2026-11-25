const { test, expect, go } = require("./support/prototype-harness.cjs");
const { collection, openRail } = require("./support/b2-harness.cjs");

const filterGenre = (page) => collection(page).getByRole("combobox", { name: "Filtrar por género", exact: true });
const filterDecade = (page) => collection(page).getByRole("combobox", { name: "Filtrar por década", exact: true });
const filterYear = (page) => collection(page).getByRole("combobox", { name: "Filtrar por año de edición", exact: true });
const query = (page) => page.getByRole("combobox", { name: "Buscar discos o artistas", exact: true });
const suggestions = (page) => page.getByRole("listbox", { name: "Resultados de búsqueda", exact: true });
const grid = (page) => collection(page).locator("button[data-collection-album-id]");

test.use({ viewport: { width: 1440, height: 900 },
  launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });

test("the nav search preserves Collection filters and opens the selected artist on a Batea shelf", async ({ page }, testInfo) => {
  await openRail(page);
  await go(page, "Colección", 3);
  const library = collection(page);
  const finder = query(page);
  await expect(grid(page).first()).toBeVisible();
  await expect(filterGenre(page).locator('option[value="electronic"]')).toBeAttached();
  await filterGenre(page).selectOption("electronic");
  await filterDecade(page).selectOption("1990s");
  await finder.evaluate((node) => { window.__sharedCollectionSearch = node; });

  await finder.fill("V");
  await expect(suggestions(page).getByRole("option", { name: "Explorar artista Vértice Magnético", exact: true })).toBeVisible();
  expect(await suggestions(page).getByRole("option").count()).toBeLessThanOrEqual(6);
  await finder.fill("vertice");
  const matchingArtist = suggestions(page).getByRole("option", { name: "Explorar artista Vértice Magnético", exact: true });
  await expect(matchingArtist).toBeVisible();
  expect(await matchingArtist.getAttribute("data-artist-id")).toBe("demo-vertice");
  await page.screenshot({ path: testInfo.outputPath("Coleccion-desplegable-1440x900.png") });
  await finder.press("ArrowDown");
  await finder.press("Enter");

  const artistQuery = finder;
  await expect(library.getByRole("button", { name: "Quitar artista: Vértice Magnético" })).toBeVisible();
  expect(await artistQuery.evaluate((node) => node === window.__sharedCollectionSearch)).toBe(true);
  await expect(library.getByRole("button", { name: "Buscar artista", exact: true })).toHaveCount(0);
  await expect(library.getByRole("button", { name: "Tu colección", exact: true })).toHaveCount(0);
  await expect(library.getByRole("combobox", { name: "Buscar discos o artistas", exact: true })).toHaveCount(0);
  await expect(filterGenre(page)).toHaveValue("electronic");
  await expect(filterDecade(page)).toHaveValue("1990s");
  await expect(filterYear(page)).toBeVisible();
  await expect(suggestions(page)).toHaveCount(0);
  const artist = library.getByRole("region", { name: "Discos de Vértice Magnético", exact: true });
  const tray = artist.locator("[data-batea-tray]");
  await expect(tray).toBeVisible();
  await expect(artist.locator("[data-artist-shelf]")).toHaveAttribute("data-artist-shelf-layout", "static");
  await expect(artist.getByRole("button", { name: "Desplazamiento automático", exact: true })).toHaveCount(0);
  const editions = tray.locator("button[data-batea-album-id]");
  expect(await editions.evaluateAll((nodes) => nodes.every((node) => node.getAttribute("aria-label").includes("Vértice Magnético")))).toBe(true);
  const ids = await editions.evaluateAll((nodes) => nodes.map((node) => node.dataset.bateaAlbumId));
  expect(new Set(ids).size).toBe(ids.length);
  await expect(grid(page).first()).toBeHidden();
  const cards = await editions.evaluateAll((nodes) => {
    const viewport = nodes[0].closest('[class*="viewport"]').getBoundingClientRect();
    return nodes.flatMap((node, index) => {
      const box = node.getBoundingClientRect();
      const x = box.x + box.width / 2;
      return x > viewport.left + 10 && x < viewport.right - 10 ? [{ index, x, y: box.y + box.height / 2 }] : [];
    });
  });
  expect(cards.length).toBeGreaterThan(0);
  const source = editions.nth(cards[0].index);
  const id = await source.getAttribute("data-batea-album-id");
  await page.mouse.move(cards[0].x, cards[0].y);
  await expect(page.locator("[data-batea-flyout]")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("Coleccion-artista-batea-1440x900.png") });
  await tray.evaluate((node) => node.addEventListener("click", (event) => {
    window.__clickedArtistCase = event.target.closest("button[data-batea-album-id]");
  }, { capture: true, once: true }));
  await page.mouse.click(cards[0].x, cards[0].y);
  const detail = page.getByTestId("album-detail-page");
  await expect(detail).toHaveAttribute("data-album-id", id);
  expect(await page.evaluate(() => window.__clickedArtistCase?.dataset.bateaAlbumId)).toBe(id);
  await detail.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(detail).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement === window.__clickedArtistCase)).toBe(true);

  await finder.fill("vertice");
  await finder.press("Enter");
  await expect(finder).toHaveValue("vertice");
  await expect(filterGenre(page)).toHaveValue("electronic");
  await expect(filterDecade(page)).toHaveValue("1990s");
  await expect(grid(page).first()).toBeVisible();
});

test("one nav search accepts artist, album, and combined words and can replace the selected artist", async ({ page }) => {
  await openRail(page);
  await go(page, "Colección", 3);
  const library = collection(page);
  const savedSearch = query(page);
  await expect(grid(page).first()).toBeVisible();
  for (const input of ["neon", "vertice neon", "Vértice Magnético Neon Rooms"]) {
    await savedSearch.fill(input);
    await expect(grid(page)).toHaveCount(1);
    await expect(grid(page)).toHaveAttribute("data-collection-album-id", "mock-album-01");
  }
  const finder = savedSearch;
  await finder.fill("vertice");
  await suggestions(page).getByRole("option", { name: "Explorar artista Vértice Magnético", exact: true }).click();
  const editions = library.getByTestId("artist-discography").locator("button[data-batea-album-id]");
  await expect(library.getByTestId("artist-discography")).toHaveAttribute("data-artist-id", "demo-vertice");
  await expect(editions.nth(1)).toBeVisible();
  await expect(library.getByRole("button", { name: "Quitar artista: Vértice Magnético" })).toBeVisible();
  await finder.fill("satelite");
  await suggestions(page).getByRole("option", { name: "Explorar artista Satélite Sur", exact: true }).click();
  await expect(library.getByTestId("artist-discography")).toHaveAttribute("data-artist-id", "demo-satelite");
  await expect(editions.first()).toBeVisible();
  await expect(library.getByRole("button", { name: "Quitar artista: Satélite Sur" })).toBeVisible();
  await finder.fill("Vértice Magnético Neon Rooms");
  await finder.press("Enter");
  await expect(savedSearch).toHaveValue("Vértice Magnético Neon Rooms");
  await expect(grid(page)).toHaveCount(1);
});

test("Colección can filter with genre matches verified through Spotify Search when metadata is unavailable", async ({ page }) => {
  await page.route("**/api/collection?*", async (route) => {
    const response = await route.fetch();
    const data = (await response.json()).map((album) => ({ ...album, genres: [], genreMetadata: undefined }));
    const enriched = new URL(route.request().url()).searchParams.get("includeGenres") === "1";
    await route.fulfill({ response, json: data,
      headers: { ...response.headers(), "x-cdv-genres-state": enriched ? "unavailable" : "not-requested" } });
  });
  const requests = [];
  await page.route("**/api/genres/verify", async (route) => {
    const input = route.request().postDataJSON();
    requests.push(input);
    await route.fulfill({ json: { genre: input.genre, matchedArtistIds: input.artists.filter(({ name }) => /Vértice/i.test(name)).map(({ id }) => id),
      checkedArtistIds: input.artists.map(({ id }) => id), partial: false } });
  });
  await openRail(page);
  await go(page, "Colección", 3);
  const library = collection(page);
  await expect(grid(page).first()).toBeVisible();
  const frame = library.locator("[data-page-size]");
  const frameBefore = await frame.boundingBox();
  await expect(filterGenre(page).locator('option[value="__verify"]')).toBeAttached();
  await filterGenre(page).selectOption("__verify");
  await expect(library.getByText("Spotify no informó géneros en las fichas de estos artistas.", { exact: true })).toBeVisible();
  await expect(library.getByRole("button", { name: "Reintentar géneros" })).toBeVisible();
  expect(await frame.boundingBox()).toEqual(frameBefore);
  await library.getByRole("button", { name: "rock", exact: true }).click();
  await expect(library.getByText(/Género comprobado en Spotify/)).toBeVisible();
  await expect(filterGenre(page)).toHaveValue("rock");
  await expect(grid(page).first()).toBeVisible();
  expect(await grid(page).evaluateAll((nodes) => nodes.every((node) => node.getAttribute("aria-label").includes("Vértice Magnético")))).toBe(true);
  expect(requests).toHaveLength(1);
  expect(requests[0].genre).toBe("rock");
  expect(requests[0].artists.length).toBeLessThanOrEqual(24);
  await library.getByRole("button", { name: "Quitar género: rock", exact: true }).click();
  await expect(filterGenre(page)).toHaveValue("all");
});
