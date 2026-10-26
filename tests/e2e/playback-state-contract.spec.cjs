const { test, expect } = require("@playwright/test");
const mockCollection = require("../../src/mocks/collection.json");

const RAIL_ENABLED = process.env.RAIL_FLAG === "1";
const NAV_LABEL = "Navegación por capítulos";
const INITIAL_ALBUM = mockCollection[0];
const ALBUM_IN_COLLECTION = mockCollection.find((album) => album.name === "Nocturnal FM");

const chapterButton = (page, name) =>
  page.getByRole("button", { name: "Ir al capítulo " + name });
const panels = (page) => page.locator("[data-rail-wrapper] > div > section");
const dialog = (page) => page.getByRole("dialog");
const flightDisc = (page) => page.getByTestId("rail-flying-disc");
const deckDisplay = (page) => page.getByTestId("deck-now-playing");
const deckTrack = (page) => page.getByTestId("deck-now-playing-track");
const deckArtist = (page) => page.getByTestId("deck-now-playing-artist");

function albumButtonName(album) {
  return album.artists.map((artist) => artist.name).join(", ") + " — " + album.name;
}

function modalLabel(album) {
  return album.name + " — " + album.artists.map((artist) => artist.name).join(", ");
}

async function waitForDeck(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  test.skip(!RAIL_ENABLED, "El contrato de estado se comprueba con el rail desktop habilitado.");
  await expect(page.getByRole("navigation", { name: NAV_LABEL })).toBeVisible({ timeout: 90_000 });
  await expect(panels(page)).toHaveCount(5, { timeout: 90_000 });
  await expect(page.locator('[data-rail-ready="true"]')).toBeVisible({ timeout: 90_000 });
  await expect(deckTrack(page)).toHaveText("DEMO TRACK 01", { timeout: 15_000 });
  await expect(deckArtist(page)).toHaveText(INITIAL_ALBUM.artists[0].name, { timeout: 15_000 });
}

async function goToChapter(page, name, index, timeout = 12_000) {
  await chapterButton(page, name).click();
  await expect(chapterButton(page, name)).toHaveAttribute("aria-current", "location", { timeout });
  await expect(page.locator("html")).toHaveAttribute("data-chapter", String(index), { timeout });
  await expect(panels(page).nth(index)).toHaveAttribute("data-chapter-active", "true", { timeout });
}

async function chooseFromCollection(page, album) {
  await goToChapter(page, "Colección", 3);
  const collection = page.getByRole("region", { name: "La Colección" });
  const card = collection.getByRole("button", {
    name: albumButtonName(album),
    exact: true,
  });
  await expect(card).toBeVisible();
  await card.click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toHaveAttribute("aria-label", modalLabel(album));
}

async function openCaseAndPlay(page, album) {
  await page.getByRole("button", { name: "Abrir caja", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cerrar caja", exact: true }))
    .toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", {
    name: "Reproducir " + album.name,
    exact: true,
  }).click();
}

async function returnToDeck(page) {
  await expect(dialog(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator("html")).not.toHaveAttribute("data-modal-open", "true", { timeout: 30_000 });
  await expect(flightDisc(page)).toHaveCount(0, { timeout: 30_000 });
  await goToChapter(page, "Deck", 0, 20_000);
  await expect(deckDisplay(page)).toBeVisible();
}

test.describe("EP2-T2 — contrato observable de estado de playback", () => {
  test.beforeEach(async ({ page }) => {
    await waitForDeck(page);
    await expect(deckDisplay(page)).toHaveAttribute("data-is-playing", "true");
  });

  test("carga inicial: track y reproducción reflejan el snapshot inicial", async ({ page }) => {
    await expect(deckTrack).toHaveText("DEMO TRACK 01");
    await expect(deckArtist).toHaveText(INITIAL_ALBUM.artists[0].name);
    await expect(deckDisplay(page)).toHaveAttribute("data-is-playing", "true");
  });

  test("pausa y reanudación conservan la identidad de la pista", async ({ page }) => {
    const initialTrack = await deckTrack.textContent();
    const initialArtist = await deckArtist.textContent();

    await page.getByRole("button", { name: "Play/Pause" }).click();
    await expect(deckDisplay(page)).toHaveAttribute("data-is-playing", "false");
    await expect(deckTrack).toHaveText(initialTrack);
    await expect(deckArtist).toHaveText(initialArtist);

    await page.getByRole("button", { name: "Play/Pause" }).click();
    await expect(deckDisplay(page)).toHaveAttribute("data-is-playing", "true");
    await expect(deckTrack).toHaveText(initialTrack);
    await expect(deckArtist).toHaveText(initialArtist);
  });

  test("cambio de pista: Next/Previous actualiza la pista sin inventar otro álbum", async ({ page }) => {
    const initialArtist = await deckArtist.textContent();

    await page.getByRole("button", { name: "Next" }).click();
    await expect(deckTrack).toHaveText("DEMO TRACK 02");
    await expect(deckArtist).toHaveText(initialArtist);
    await expect(deckDisplay(page)).toHaveAttribute("data-is-playing", "true");

    await page.getByRole("button", { name: "Previous" }).click();
    await expect(deckTrack).toHaveText("DEMO TRACK 01");
    await expect(deckArtist).toHaveText(initialArtist);
    await expect(deckDisplay(page)).toHaveAttribute("data-is-playing", "true");
  });

  test("error de red y reintento: conserva el estado previo y confirma el nuevo álbum solo tras el éxito", async ({ page }) => {
    let playRequestCount = 0;
    await page.route("**/api/play", async (route) => {
      playRequestCount += 1;

      if (playRequestCount === 1) {
        await route.abort("failed");
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await chooseFromCollection(page, ALBUM_IN_COLLECTION);
    await openCaseAndPlay(page, ALBUM_IN_COLLECTION);

    await expect(dialog(page)).toBeVisible({ timeout: 30_000 });
    await expect(dialog(page).getByRole("alert"))
      .toContainText(/no se pudo conectar con Spotify|conexión/i);
    await expect(flightDisc(page)).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-chapter", "3");

    // The failed attempt must not become the new confirmed snapshot.
    await page.getByRole("button", { name: "Cerrar", exact: true }).last().click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveAttribute("data-modal-open", "true");
    await returnToDeck(page);
    await expect(deckTrack).toHaveText("DEMO TRACK 01");
    await expect(deckArtist).toHaveText(INITIAL_ALBUM.artists[0].name);
    await expect(deckDisplay(page)).toHaveAttribute("data-is-playing", "true");

    // Start a genuinely new attempt. The route now responds successfully.
    await chooseFromCollection(page, ALBUM_IN_COLLECTION);
    await openCaseAndPlay(page, ALBUM_IN_COLLECTION);
    await expect(flightDisc(page)).toBeVisible();
    await expect(flightDisc(page)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator("html")).toHaveAttribute("data-chapter", "0", {
      timeout: 30_000,
    });
    await expect(deckArtist).toHaveText(ALBUM_IN_COLLECTION.artists[0].name, {
      timeout: 10_000,
    });
    await expect(deckDisplay(page)).toHaveAttribute("data-is-playing", "true", {
      timeout: 10_000,
    });
    expect(playRequestCount).toBe(2);
  });
});
