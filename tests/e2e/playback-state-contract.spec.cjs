const { test, expect, openRail, go, collection } = require("./support/b2-harness.cjs");
const albums = require("../../src/mocks/collection.json");

const initial = albums.find((album) => album.id === "mock-album-01");
const target = albums.find((album) => album.id === "mock-album-02");
const detail = (page) => page.getByTestId("album-detail-page");
const overlay = (page) => page.locator("[data-rail-overlay]");
const flight = (page) => page.getByTestId("rail-flying-disc");
const transport = (page, name) => page.locator("[data-physical-deck]").getByRole("button", { name, exact: true });

async function expectSnapshot(page, title, artist, playing) {
  await expect(page.getByTestId("deck-now-playing-track")).toHaveText(title, { timeout: 15_000 });
  await expect(page.getByTestId("deck-now-playing-artist")).toHaveText(artist);
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", String(playing));
}

async function chooseAndPlay(page) {
  await go(page, "Colección", 3);
  await collection(page).locator(`[data-collection-album-id="${target.id}"]`).click();
  await expect(detail(page)).toHaveAccessibleName(`${target.name} — ${target.artists[0].name}`);
  await detail(page).getByRole("button", { name: "Abrir caja", exact: true }).click();
  await expect(detail(page).getByRole("button", { name: "Cerrar caja", exact: true })).toHaveAttribute("aria-expanded", "true");
  await detail(page).getByRole("button", { name: `Reproducir ${target.name}`, exact: true }).click();
}

test.describe("contrato visible de reproducción", () => {
  test.skip(process.env.RAIL_FLAG === "0", "Los controles físicos requieren el rail desktop.");

  test.beforeEach(async ({ page }) => {
    await openRail(page);
    await go(page, "Deck", 0);
    await expectSnapshot(page, "Ventana de neón", initial.artists[0].name, true);
  });

  test("carga la pista inicial en el visor del equipo", async ({ page }) => {
    await expect(page.locator("[data-physical-deck] [data-deck-display-mirror] strong")).toHaveText("Ventana de neón");
    await expect(transport(page, "Pausar/reanudar equipo")).toHaveAttribute("aria-pressed", "true");
  });

  test("pausa y reanuda sin cambiar de pista", async ({ page }) => {
    const toggle = transport(page, "Pausar/reanudar equipo");
    await toggle.click();
    await expectSnapshot(page, "Ventana de neón", initial.artists[0].name, false);
    await toggle.click();
    await expectSnapshot(page, "Ventana de neón", initial.artists[0].name, true);
  });

  test("siguiente y anterior recorren las pistas del mismo disco", async ({ page }) => {
    await transport(page, "Pista siguiente del equipo").click();
    await expectSnapshot(page, "Ascensor azul", initial.artists[0].name, true);
    await transport(page, "Pista anterior del equipo").click();
    await expectSnapshot(page, "Ventana de neón", initial.artists[0].name, true);
  });

  test("un fallo de red conserva la pista anterior y un nuevo intento confirma el disco elegido", async ({ page }) => {
    const requests = [];
    await page.route("**/api/play", (route) => {
      requests.push(route.request().postDataJSON());
      return requests.length === 1 ? route.abort("failed") : route.continue();
    });

    await chooseAndPlay(page);
    await expect(detail(page).getByRole("alert")).toContainText(/conectar con Spotify|conexión/i, { timeout: 30_000 });
    await expect(overlay(page)).toHaveAttribute("data-playback-phase", "failed");
    await expect(overlay(page)).toHaveAttribute("data-confirmed-attempt", "");
    await expect(flight(page)).toHaveCount(0);
    await expect(page.locator("html")).toHaveAttribute("data-chapter", "3");
    await detail(page).getByRole("button", { name: "Volver", exact: true }).click();
    await expect(detail(page)).toHaveCount(0);
    await go(page, "Deck", 0);
    await expectSnapshot(page, "Ventana de neón", initial.artists[0].name, true);

    await chooseAndPlay(page);
    await expect(flight(page)).toBeVisible();
    await expect(flight(page)).toHaveCount(0, { timeout: 30_000 });
    await expect(overlay(page)).toHaveAttribute("data-playback-phase", "confirmed", { timeout: 10_000 });
    await expect(page.locator("html")).toHaveAttribute("data-chapter", "0");
    await expectSnapshot(page, "Antena del sur", target.artists[0].name, true);
    expect(requests).toHaveLength(2);
    expect(requests.map(({ uri }) => uri)).toEqual([target.uri, target.uri]);
    expect(requests[1].attemptId).not.toBe(requests[0].attemptId);
    await expect(overlay(page)).toHaveAttribute("data-confirmed-attempt", requests[1].attemptId);
  });
});
