const {
  test, expect, go, bootPrototype, collection, grid, gridCards, title, observeRequests, observeArrival, expectOneArrival, saveRecord,
} = require("./support/prototype-harness.cjs");

// The normal saved catalog, genres, track lists, lyrics and playback all reach
// the app through its own mock APIs. These cases install no request routes.
test.use({ viewport: { width: 1440, height: 900 }, launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });

const tray = (page) => page.getByTestId("collection-batea-prototype");
const trayCards = (page) => tray(page).locator("[data-collection-album-id]");
const openToggle = (page) => collection(page).getByRole("button", { name: "Mostrar Batea en Colección", exact: true });
const closeToggle = (page) => collection(page).getByRole("button", { name: "Ocultar Batea en Colección", exact: true });
const query = (page) => collection(page).getByRole("searchbox", { name: "Buscar artista o álbum", exact: true });
const genre = (page) => collection(page).getByRole("combobox", { name: "Filtrar por género", exact: true });
const decade = (page) => collection(page).getByRole("combobox", { name: "Filtrar por década", exact: true });
const year = (page) => collection(page).getByRole("combobox", { name: "Filtrar por año de edición", exact: true });
const albumId = "demo-vertice-album-0";

async function filters(page) {
  await expect(genre(page).locator('option[value="electronic"]')).toHaveCount(1);
  await query(page).fill("VÉRTICE");
  await genre(page).selectOption("electronic");
  await decade(page).selectOption("1990s");
  await year(page).selectOption("1994");
  await expect(gridCards(page)).toHaveCount(1);
  await expect(gridCards(page)).toHaveAttribute("data-collection-album-id", albumId);
}

async function expectFilters(page) {
  await expect(query(page)).toHaveValue("VÉRTICE");
  await expect(genre(page)).toHaveValue("electronic");
  await expect(decade(page)).toHaveValue("1990s");
  await expect(year(page)).toHaveValue("1994");
  await expect(gridCards(page)).toHaveCount(1);
  await expect(gridCards(page)).toHaveAttribute("data-collection-album-id", albumId);
}

async function currentPage(page) {
  const label = collection(page).locator('[class*="pageLabel"]');
  if (!await label.count()) return { page: 1, total: 1 };
  const [, current, total] = (await label.textContent()).match(/Página (\d+) de (\d+)/);
  return { page: Number(current), total: Number(total) };
}

async function assertPageValid(page) {
  const state = await currentPage(page);
  expect(state.page).toBeGreaterThanOrEqual(1);
  expect(state.page).toBeLessThanOrEqual(state.total);
  return state;
}

test("P2 normal: lateral tray changes grid width, reuses Batea saved identities and preserves all four filters and focus", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  await bootPrototype(page, "collection-tray");
  await expect(page.locator('button[aria-label="Elevar CD del equipo"]')).toHaveCount(0);
  await filters(page);
  const before = await grid(page).boundingBox();
  await gridCards(page).focus();
  await openToggle(page).click();
  await expect(tray(page)).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Batea", exact: true })).toBeVisible();
  await expect(closeToggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect.poll(async () => (await grid(page).boundingBox()).width).toBeLessThan(before.width - 200);
  await expectFilters(page);
  await expect(trayCards(page)).toHaveCount(18);
  await expect.poll(() => requests.collectionResponses.filter((row) => Array.isArray(row.albums)).length).toBe(2);
  const saved = requests.collectionResponses.find((row) => row.url.includes("includeGenres=0")).albums.slice(0, 18);
  const savedIds = saved.map((album) => album.id);
  expect(await trayCards(page).evaluateAll((nodes) => nodes.map((node) => node.dataset.collectionAlbumId))).toEqual(savedIds);
  expect(new Set(savedIds).size).toBe(18);
  const traySource = tray(page).locator('[data-collection-album-id="mock-album-01"]');
  await traySource.click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByTestId("jewel-case-presentation")).toHaveAttribute("data-variant", "modal");
  await expect(modal.getByTestId("jewel-case-presentation")).toHaveAttribute("data-album-id", "mock-album-01");
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(traySource).toBeFocused();
  await tray(page).getByRole("button", { name: "Cerrar Batea", exact: true }).click();
  await expect(tray(page)).toBeHidden();
  await expect(openToggle(page)).toBeFocused();
  await expectFilters(page);
  await expect.poll(async () => (await grid(page).boundingBox()).width).toBe(before.width);
  await go(page, "Batea", 2);
  const oldBatea = page.getByRole("region", { name: "La Batea", exact: true });
  // The unchanged belt repeats its eighteen saved editions for its wraparound.
  // Its accessible labels retain the identities of the very same API payload.
  const beltLabels = await oldBatea.locator("button[aria-label]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
  for (const album of saved) expect(beltLabels).toContain(`${album.artists.map((artist) => artist.name).join(", ")} — ${album.name}`);
  await go(page, "Colección", 3);
  await openToggle(page).click();
  await expect(trayCards(page)).toHaveCount(18);
  expect(requests.collectionRequests.filter((url) => url.includes("includeGenres=0"))).toHaveLength(1);
  expect(requests.collectionRequests.filter((url) => url.includes("includeGenres=1"))).toHaveLength(1);
  expect(requests.play).toHaveLength(0);
  await saveRecord(testInfo, "shared-saved-identities-and-filters", { savedIds, before, after: await grid(page).boundingBox(), collectionRequests: requests.collectionRequests, page: await assertPageValid(page) });
});

test("P2 normal: opening and closing the tray preserve the orienting album on a valid partial page", async ({ page }, testInfo) => {
  await bootPrototype(page, "collection-tray");
  await expect(genre(page).locator('option[value="electronic"]')).toHaveCount(1);
  await collection(page).getByRole("button", { name: "Siguiente", exact: true }).click();
  const beforePage = await currentPage(page);
  expect(beforePage.page).toBeGreaterThan(1);
  const beforeSize = Number(await grid(page).getAttribute("data-page-size"));
  // Opening directly after pagination must establish an orienting identity
  // even when no album has received focus yet.
  const firstVisibleId = await gridCards(page).first().getAttribute("data-collection-album-id");
  await openToggle(page).click();
  await expect(tray(page)).toBeVisible();
  await expect.poll(async () => Number(await grid(page).getAttribute("data-page-size"))).toBeLessThan(beforeSize);
  await expect(grid(page).locator(`[data-collection-album-id="${firstVisibleId}"]`)).toBeVisible();
  const duringPage = await assertPageValid(page);
  await tray(page).getByRole("button", { name: "Cerrar Batea", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(tray(page)).toBeHidden();
  await expect(openToggle(page)).toBeFocused();
  await expect(grid(page)).toHaveAttribute("data-page-size", String(beforeSize));
  await expect(grid(page).locator(`[data-collection-album-id="${firstVisibleId}"]`)).toBeVisible();
  const afterPage = await assertPageValid(page);
  expect(afterPage).toEqual(beforePage);
  const chosen = gridCards(page).nth(2);
  const focusedId = await chosen.getAttribute("data-collection-album-id");
  await chosen.focus();
  await openToggle(page).click();
  await expect(grid(page).locator(`[data-collection-album-id="${focusedId}"]`)).toBeVisible();
  await tray(page).getByRole("button", { name: "Cerrar Batea", exact: true }).click();
  await expect(grid(page)).toHaveAttribute("data-page-size", String(beforeSize));
  await expect(grid(page).locator(`[data-collection-album-id="${focusedId}"]`)).toBeVisible();
  expect(await assertPageValid(page)).toEqual(beforePage);
  await saveRecord(testInfo, "pagination-anchor", { firstVisibleId, focusedId, beforeSize, beforePage, duringPage, afterPage });
});

test("P2 normal: tray uses the shared open case, emits one play order and restores collection context after Deck", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  await observeArrival(page);
  await bootPrototype(page, "collection-tray");
  await filters(page);
  await openToggle(page).click();
  await tray(page).locator('[data-collection-album-id="mock-album-02"]').click();
  const modal = page.getByRole("dialog");
  await modal.getByRole("button", { name: "Abrir caja", exact: true }).click();
  await expect(modal.getByTestId("jewel-case-presentation")).toHaveAttribute("data-presentation", "open");
  await expect(modal.getByRole("list", { name: "Lista de pistas", exact: true })).toContainText("Antena del sur");
  await modal.getByRole("button", { name: "Reproducir Nocturnal FM", exact: true }).dblclick();
  await expect(title(page)).toHaveText("CARGANDO");
  await expect(page.locator("[data-rail-overlay]")).toHaveAttribute("data-playback-phase", "confirmed");
  await expect(title(page)).toHaveText("Antena del sur");
  await expect(page.getByTestId("rail-flying-disc")).toHaveCount(0);
  expect(requests.play).toHaveLength(1);
  expect(requests.play[0].uri).toBe("spotify:album:mock-02");
  expect(requests.play[0].deviceId).toBe("cdvicious-mock-device");
  await expect(page.locator("[data-rail-overlay]")).toHaveAttribute("data-confirmed-attempt", requests.play[0].attemptId);
  const arrivals = await expectOneArrival(page, requests.play[0].attemptId);
  await go(page, "Colección", 3);
  await expect(tray(page)).toBeVisible();
  await expectFilters(page);
  await tray(page).getByRole("button", { name: "Cerrar Batea", exact: true }).click();
  await expect(openToggle(page)).toBeFocused();
  await expectFilters(page);
  await assertPageValid(page);
  await saveRecord(testInfo, "tray-shared-playback", { play: requests.play, arrivals, collectionRequests: requests.collectionRequests });
});

test.describe("P2 narrow layout", () => {
  test.use({ viewport: { width: 1000, height: 800 } });
  test("normal saved tray takes over accessibly and returns keyboard focus and filters", async ({ page }) => {
    const requests = observeRequests(page);
    await bootPrototype(page, "collection-tray");
    await filters(page);
    await openToggle(page).click();
    await expect(tray(page)).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("dialog", { name: "Batea", exact: true })).toHaveAttribute("aria-modal", "true");
    await expect(trayCards(page)).toHaveCount(18);
    expect(await grid(page).evaluate((node) => Boolean(node.closest("[inert]")))).toBe(true);
    const close = tray(page).getByRole("button", { name: "Cerrar Batea", exact: true });
    await expect(close).toBeInViewport({ ratio: 1 });
    await close.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(trayCards(page).last()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement.closest('[data-testid="collection-batea-prototype"]')))).toBe(true);
    const source = tray(page).locator('[data-collection-album-id="mock-album-01"]');
    await source.click();
    // The takeover is suspended while the shared detail owns the dialog role.
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page.getByRole("dialog").getByTestId("jewel-case-presentation")).toHaveAttribute("data-album-id", "mock-album-01");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("jewel-case-presentation")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Batea", exact: true })).toBeVisible();
    await expect(source).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(tray(page)).toBeHidden();
    await expect(openToggle(page)).toBeFocused();
    expect(await grid(page).evaluate((node) => Boolean(node.closest("[inert]")))).toBe(false);
    await expectFilters(page);
    expect(requests.play).toHaveLength(0);
  });
});
