const { test, expect, go, hardware, observeRequests, canonicalState } = require("./support/prototype-harness.cjs");
const { openRail, booklet } = require("./support/b2-harness.cjs");

test.use({ viewport: { width: 1440, height: 900 },
  launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });

const trigger = (page) => page.getByRole("button", { name: "Track listing", exact: true });
const panel = (page) => page.getByRole("region", { name: "Pistas del álbum", exact: true });
const track = (page, name) => panel(page).getByRole("button", { name });

async function expectListingAboveControls(page, split = false) {
  const geometry = await panel(page).evaluate((listing) => {
    const bounds = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    const list = listing.getBoundingClientRect().toJSON();
    return {
      list, trigger: bounds("[data-deck-track-selector] > button"), nav: bounds("[data-shell-header]"),
      lid: bounds("[data-deck-lid=left]"), front: bounds("[data-deck-front]"),
      paper: bounds("[data-testid=lyrics-paper]"),
    };
  });
  expect(geometry.trigger.top).toBeGreaterThan(geometry.nav.bottom + 10);
  expect(geometry.trigger.bottom).toBeLessThan(geometry.lid.top);
  expect(geometry.list.top).toBeGreaterThan(geometry.trigger.bottom + 2);
  expect(geometry.list.bottom).toBeLessThan(geometry.front.top - 4);
  if (split) expect(geometry.list.right).toBeLessThan(geometry.paper.left - 8);
}

test("Track listing salta dentro del álbum y comparte selección, transporte y letras entre Deck y Split", async ({ page }, testInfo) => {
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
  const mapTrack = track(page, /Mapa de azoteas/);
  await expect(mapTrack.locator(":scope > span")).toHaveText(["Mapa de azoteas", "05:21"]);
  expect(await mapTrack.evaluate((row) => {
    const [title, time] = [...row.children].map((node) => node.getBoundingClientRect());
    return time.left > title.right && time.left - title.right < 16 && time.top < title.bottom;
  })).toBe(true);
  await expectListingAboveControls(page);

  const knob = hardware(page).getByRole("slider", { name: "Volumen del equipo", exact: true });
  const previousVolume = await knob.getAttribute("aria-valuenow");
  await track(page, /Mapa de azoteas/).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
  await expect(page.getByTestId("deck-now-playing-track")).toHaveText("Mapa de azoteas");
  await trigger(page).click();
  await expect(track(page, /Mapa de azoteas/)).toHaveAttribute("aria-current", "true");
  expect((await canonicalState(page)).duration).toBe(321);
  await expect(knob).toHaveAttribute("aria-valuenow", previousVolume);
  await expect(page.getByTestId("rail-flying-disc")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("Deck-pistas-1440x900.png") });

  await go(page, "Split", 1);
  await expect(panel(page)).toBeVisible();
  await expect(track(page, /Mapa de azoteas/)).toHaveAttribute("aria-current", "true");
  await expect(booklet(page).getByRole("heading", { name: "Mapa de azoteas", exact: true })).toBeVisible();
  await expectListingAboveControls(page, true);
  await page.screenshot({ path: testInfo.outputPath("Split-track-listing-1440x900.png") });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expectListingAboveControls(page, true);
  await page.screenshot({ path: testInfo.outputPath("Split-pistas-1280x720.png") });
  await track(page, /Interludio de vidrio/).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
  await expect(booklet(page).getByText(/pista instrumental/i)).toBeVisible();
  expect(requests.play).toHaveLength(0);
  expect(lists).toHaveLength(1);

  await trigger(page).click();
  await expect(track(page, /Interludio de vidrio/)).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
});

test("Track listing conserva un lugar accesible y cierra al elegir una pista con el CD elevado", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  const deck = page.locator("[data-physical-deck]");
  const disc = page.locator("[data-prototype-disc=true]");
  const unobstructed = () => panel(page).evaluate((listing) => {
    const triggerBox = listing.parentElement.querySelector("button").getBoundingClientRect();
    const listBox = listing.getBoundingClientRect();
    const physicalParts = [...document.querySelectorAll("[data-deck-surface], [data-prototype-disc=true], [data-latch-mode=dock], [data-global-player]")]
      .map((node) => node.getBoundingClientRect());
    return [triggerBox, listBox].every((box) => box.left >= 16 &&
      physicalParts.every((part) => box.right + 8 <= part.left || box.left - 8 >= part.right ||
        box.bottom + 8 <= part.top || box.top - 8 >= part.bottom));
  });

  await openRail(page);
  await go(page, "Deck", 0);
  const dockedAnchor = await trigger(page).boundingBox();
  await page.getByRole("button", { name: "Elevar CD del equipo", exact: true }).click();
  await expect(deck).toHaveAttribute("data-disc-state", "free");
  await expect(disc).toHaveCount(1);
  await disc.evaluate((node) => { window.__liftedListingDisc = node; });
  await trigger(page).click();
  await expect(track(page, /Ventana de neón/)).toHaveAttribute("aria-current", "true");
  await expect.poll(unobstructed).toBe(true);
  const freeAnchor = await trigger(page).boundingBox();
  expect(Math.abs(freeAnchor.x - dockedAnchor.x)).toBeLessThanOrEqual(28);
  expect(Math.abs(freeAnchor.y - dockedAnchor.y)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("Track-listing-CD-elevado-1440x900.png") });

  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(unobstructed).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("Track-listing-CD-elevado-1280x720.png") });
  await track(page, /Mapa de azoteas/).focus();
  await page.keyboard.press("Enter");
  await expect(panel(page)).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
  await expect(page.getByTestId("deck-now-playing-track")).toHaveText("Mapa de azoteas");
  await expect(deck).toHaveAttribute("data-disc-state", "free");
  expect(await disc.evaluate((node) => node === window.__liftedListingDisc)).toBe(true);

  await trigger(page).click();
  await expect(track(page, /Mapa de azoteas/)).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveCount(0);
  await expect(deck).toHaveAttribute("data-disc-state", "free");
  await page.keyboard.press("Escape");
  await expect(deck).toHaveAttribute("data-disc-state", "docked");
  await expect(trigger(page)).toBeVisible();
  expect(requests.play).toHaveLength(0);
});

test("Track listing acomoda títulos largos, permite reintentar y muestra el nuevo álbum", async ({ page }) => {
  let failures = 0;
  const longName = "Una canción mucho más larga para escuchar mientras recorremos todas las ventanas iluminadas de la ciudad de madrugada";
  await page.route("**/api/album/mock-album-01/tracks", async (route) => {
    if (failures++ === 0) return route.fulfill({ status: 502, json: { error: "fixture" } });
    const response = await route.fetch();
    const data = await response.json();
    data.tracks[1] = { ...data.tracks[1], name: longName };
    return route.fulfill({ response, json: data });
  });
  await openRail(page);
  await go(page, "Deck", 0);
  await trigger(page).click();
  await expect(panel(page).getByRole("alert")).toContainText("No se pudieron cargar las pistas.");
  await panel(page).getByRole("button", { name: "Reintentar" }).click();
  await expect(track(page, /Ventana de neón/)).toHaveAttribute("aria-current", "true");
  const longTrack = track(page, new RegExp(longName));
  await expect(longTrack.locator(":scope > span").last()).toHaveText(/^[0-9]+:[0-9]{2}$/);
  expect(await longTrack.evaluate((row) => {
    const [title, time] = row.children;
    const fragments = [...title.getClientRects()];
    const bounds = row.getBoundingClientRect();
    const duration = time.getBoundingClientRect();
    return fragments.length > 1 && fragments.every((fragment) => fragment.right <= bounds.right)
      && duration.right <= bounds.right && duration.bottom <= bounds.bottom;
  })).toBe(true);

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
