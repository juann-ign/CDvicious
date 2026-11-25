const { test, expect, go, hardware, observeRequests, canonicalState } = require("./support/prototype-harness.cjs");
const { openRail, booklet } = require("./support/b2-harness.cjs");

test.use({ viewport: { width: 1440, height: 900 },
  launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });

const trigger = (page) => page.getByRole("button", { name: "Pistas", exact: true });
const panel = (page) => page.getByRole("region", { name: "Pistas del álbum", exact: true });
const track = (page, name) => panel(page).getByRole("button", { name });

test("Pistas salta dentro del álbum y comparte selección, transporte y letras entre Deck y Split", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  const lists = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/album/mock-album-01/tracks") lists.push(path);
  });
  await openRail(page);
  await go(page, "Deck", 0);
  await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
  await trigger(page).click();
  await expect(panel(page).getByRole("button")).toHaveCount(10);
  await expect(track(page, /Ventana de neón/)).toHaveAttribute("aria-current", "true");
  await expect(track(page, /Mapa de azoteas/)).toContainText("05:21");

  const knob = hardware(page).getByRole("slider", { name: "Volumen del equipo", exact: true });
  const previousVolume = await knob.getAttribute("aria-valuenow");
  await track(page, /Mapa de azoteas/).click();
  await expect(page.getByTestId("deck-now-playing-track")).toHaveText("Mapa de azoteas");
  await expect(track(page, /Mapa de azoteas/)).toHaveAttribute("aria-current", "true");
  expect((await canonicalState(page)).duration).toBe(321);
  await expect(knob).toHaveAttribute("aria-valuenow", previousVolume);
  await expect(page.getByTestId("rail-flying-disc")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("Deck-pistas-1440x900.png") });

  await go(page, "Split", 1);
  await expect(panel(page)).toBeVisible();
  await expect(track(page, /Mapa de azoteas/)).toHaveAttribute("aria-current", "true");
  await expect(booklet(page).getByRole("heading", { name: "Mapa de azoteas", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 720 });
  const separation = await panel(page).evaluate((list) => ({
    top: list.getBoundingClientRect().top,
    front: document.querySelector("[data-deck-front]").getBoundingClientRect().bottom,
    paper: document.querySelector("[data-testid=lyrics-paper]").getBoundingClientRect().left,
    right: list.getBoundingClientRect().right,
  }));
  expect(separation.top).toBeGreaterThan(separation.front);
  expect(separation.right).toBeLessThan(separation.paper);
  await page.screenshot({ path: testInfo.outputPath("Split-pistas-1280x720.png") });
  await track(page, /Interludio de vidrio/).click();
  await expect(track(page, /Interludio de vidrio/)).toHaveAttribute("aria-current", "true");
  await expect(booklet(page).getByText(/pista instrumental/i)).toBeVisible();
  expect(requests.play).toHaveLength(0);
  expect(lists).toHaveLength(1);

  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
});

test("Pistas permite reintentar la lista y muestra el nuevo álbum al volver al Deck", async ({ page }) => {
  let failures = 0;
  await page.route("**/api/album/mock-album-01/tracks", (route) => {
    if (failures++ === 0) return route.fulfill({ status: 502, json: { error: "fixture" } });
    return route.continue();
  });
  await openRail(page);
  await go(page, "Deck", 0);
  await trigger(page).click();
  await expect(panel(page).getByRole("alert")).toContainText("No se pudieron cargar las pistas.");
  await panel(page).getByRole("button", { name: "Reintentar" }).click();
  await expect(track(page, /Ventana de neón/)).toHaveAttribute("aria-current", "true");

  await page.getByRole("button", { name: "Siguiente disco", exact: true }).click();
  const shelf = page.getByRole("region", { name: "Discos guardados para seguir escuchando" });
  await shelf.getByRole("button", { name: /Frecuencia cero/ }).click();
  const detail = page.getByTestId("album-detail-page");
  await detail.getByRole("button", { name: "Reproducir Frecuencia cero", exact: true }).click();
  await expect(page.locator("[data-rail-overlay]")).toHaveAttribute("data-playback-phase", "confirmed");
  await expect(panel(page)).toContainText("Frecuencia cero");
  await expect(track(page, /Dial en cero/)).toHaveAttribute("aria-current", "true");
  await expect(track(page, /Ventana de neón/)).toHaveCount(0);
  await expect(page.getByTestId("rail-flying-disc")).toHaveCount(0);
});
