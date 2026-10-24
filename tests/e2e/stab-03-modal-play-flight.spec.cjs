const { test, expect } = require("@playwright/test");
const mockCollection = require("../../src/mocks/collection.json");

const RAIL_ENABLED = process.env.RAIL_FLAG === "1";
const NAV_LABEL = "Navegación por capítulos";
const ALBUM_IN_COLLECTION = mockCollection.find((album) => album.name === "Nocturnal FM");
const ALBUM_IN_CRATE = mockCollection.find((album) => album.name === "Ciudad de Vidrio");
const INITIAL_ALBUM = mockCollection[0];

const chapterButton = (page, name) =>
  page.getByRole("button", { name: "Ir al capítulo " + name });
const panels = (page) => page.locator("[data-rail-wrapper] > div > section");
const dialog = (page) => page.getByRole("dialog");
const flightDisc = (page) => page.getByTestId("rail-flying-disc");
const deckDisplay = (page) => page.getByTestId("deck-now-playing");
const deckArtist = (page) => page.getByTestId("deck-now-playing-artist");

function albumButtonName(album) {
  return album.artists.map((artist) => artist.name).join(", ") + " — " + album.name;
}

function modalLabel(album) {
  return album.name + " — " + album.artists.map((artist) => artist.name).join(", ");
}

async function openRail(page) {
  await page.addInitScript(() => {
    const eventNames = [
      "cdvicious:disc-flight-started",
      "cdvicious:disc-flight-arrived",
      "cdvicious:disc-flight-done",
      "cdvicious:disc-flight-cancelled",
      "cdvicious:disc-flight-playback-ready",
      "cdvicious:disc-flight-playback-started",
    ];
    window.__cdvFlightEvents = [];
    for (const name of eventNames) {
      window.addEventListener(name, () => {
        window.__cdvFlightEvents.push({
          name,
          at: performance.now(),
          chapter: document.documentElement.dataset.chapter ?? null,
          modalOpen: document.documentElement.dataset.modalOpen === "true",
          playbackReady:
            document.documentElement.dataset.discFlightPlaybackReady === "true",
        });
      });
    }
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  test.skip(!RAIL_ENABLED, "El flujo flying-disc requiere el rail desktop habilitado.");
  await expect(page.getByRole("navigation", { name: NAV_LABEL })).toBeVisible();
  await expect(panels(page)).toHaveCount(5);
  await expect(deckArtist(page)).toHaveText(INITIAL_ALBUM.artists[0].name, {
    timeout: 8_000,
  });
}

async function goToChapter(page, name, index) {
  await chapterButton(page, name).click();
  await expect(chapterButton(page, name)).toHaveAttribute("aria-current", "location");
  await expect(page.locator("html")).toHaveAttribute("data-chapter", String(index));
  await expect(panels(page).nth(index)).toHaveAttribute("data-chapter-active", "true");
  await expect
    .poll(
      () =>
        panels(page)
          .nth(index)
          .evaluate((panel) => Math.abs(panel.getBoundingClientRect().left)),
      { timeout: 8_000 },
    )
    .toBeLessThan(2);
}

async function openCollection(page) {
  await goToChapter(page, "Colección", 3);
  await expect(
    page.locator('section[aria-label="La Colección"] button[aria-label*=" — "]').first(),
  ).toBeVisible();
}

async function chooseFromCollection(page, album) {
  await openCollection(page);
  const card = page.getByRole("button", {
    name: albumButtonName(album),
    exact: true,
  });
  await expect(card).toBeVisible();
  await card.click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toHaveAttribute("aria-label", modalLabel(album));
  return card;
}

async function chooseFromCrate(page, album) {
  await openCollection(page); // Collection cache is shared and loaded lazily.
  await goToChapter(page, "Batea", 2);

  const candidates = page
    .locator('section[aria-label="La Batea"] button[aria-label="' + albumButtonName(album) + '"]');
  const index = await candidates.evaluateAll((nodes) => {
    const viewport = nodes[0]?.closest('[class*="viewport"]');
    const bounds = viewport?.getBoundingClientRect();
    if (!bounds) return -1;

    return nodes.findIndex((node) => {
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return rect.width > 0 && rect.height > 0 &&
        x >= bounds.left + 4 && x <= bounds.right - 4 &&
        y >= bounds.top + 4 && y <= bounds.bottom - 4;
    });
  });
  expect(index, "El lomo de " + album.name + " debe tener un hitbox dentro de la batea visible").toBeGreaterThanOrEqual(0);

  const spine = candidates.nth(index);
  await spine.hover(); // Pauses the decorative belt before interaction.
  await spine.click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toHaveAttribute("aria-label", modalLabel(album));
  return spine;
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

function createPlayGate(page) {
  let resolveOutcome;
  let resolveRequest;
  const outcomePromise = new Promise((resolve) => {
    resolveOutcome = resolve;
  });
  const requestSeen = new Promise((resolve) => {
    resolveRequest = resolve;
  });

  page.route("**/api/play", async (route) => {
    resolveRequest({
      url: route.request().url(),
      body: route.request().postDataJSON(),
    });
    const outcome = await outcomePromise;
    if (outcome.kind === "abort") {
      await route.abort("failed");
      return;
    }
    await route.fulfill({
      status: outcome.status,
      contentType: "application/json",
      body: JSON.stringify(outcome.body),
    });
  });

  return { requestSeen, respond: resolveOutcome };
}

async function assertCancelledAndRestored(page, album, sourceChapter, messagePattern) {
  await expect(dialog(page)).toBeVisible({ timeout: 8_000 });
  await expect(dialog(page)).toHaveAttribute("aria-label", modalLabel(album));
  await expect(page.getByRole("alert")).toContainText(messagePattern);
  await expect(flightDisc(page)).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-chapter", String(sourceChapter));
  await expect(panels(page).nth(sourceChapter)).toHaveAttribute("data-chapter-active", "true");
  await expect(deckArtist(page)).toHaveText(INITIAL_ALBUM.artists[0].name);
  await expect(deckDisplay(page)).toHaveAttribute("data-is-playing", "true");
  expect(
    await page.locator("html").getAttribute("data-disc-flight-playback-ready"),
    "Una reproducción rechazada no debe dejar el Deck esperando la confirmación",
  ).toBeNull();

  const events = await page.evaluate(() => window.__cdvFlightEvents ?? []);
  const started = events.findIndex((event) => event.name === "cdvicious:disc-flight-started");
  const cancelled = events.findIndex((event) => event.name === "cdvicious:disc-flight-cancelled");
  expect(started, JSON.stringify(events)).toBeGreaterThanOrEqual(0);
  expect(cancelled, JSON.stringify(events)).toBeGreaterThan(started);
  expect(
    events.some((event) => event.name === "cdvicious:disc-flight-playback-started"),
    "No debe anunciarse playback-started si Spotify no confirmó",
  ).toBe(false);
}

test("Batea y Colección seleccionan álbum; mouse y teclado cierran el modal y restauran foco", async ({ page }) => {
  test.skip(!RAIL_ENABLED, "El flujo modal del rail requiere RAIL_FLAG=1.");
  await openRail(page);

  const spine = await chooseFromCrate(page, ALBUM_IN_CRATE);
  await page.getByRole("button", { name: "Cerrar", exact: true }).last().click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-modal-open", "true");

  await goToChapter(page, "Colección", 3);
  const card = page.getByRole("button", {
    name: albumButtonName(ALBUM_IN_COLLECTION),
    exact: true,
  });
  await expect(card).toBeVisible();
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toHaveAttribute("aria-label", modalLabel(ALBUM_IN_COLLECTION));
  await expect(page.getByRole("button", { name: "Cerrar", exact: true }).last()).toBeFocused();

  // Escape closes the modal and restores focus to the selected album card.
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-modal-open", "true");
  await expect(card).toBeFocused();
  await expect(spine).toHaveCount(3); // The Batea belt renders three copies of each album.
});

test("play confirmado desde Colección: vuelo, acople y Now Playing terminan sincronizados", async ({ page }) => {
  test.skip(!RAIL_ENABLED, "El flujo flying-disc requiere RAIL_FLAG=1.");
  await openRail(page);
  const gate = createPlayGate(page);
  await chooseFromCollection(page, ALBUM_IN_COLLECTION);
  await openCaseAndPlay(page, ALBUM_IN_COLLECTION);

  const request = await gate.requestSeen;
  expect(request.body).toEqual({
    uri: ALBUM_IN_COLLECTION.uri,
    deviceId: "cdvicious-mock-device",
  });
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-modal-open", "true");
  await expect(flightDisc(page)).toBeVisible();
  await expect(deckArtist(page)).toHaveText(INITIAL_ALBUM.artists[0].name);
  await expect(deckDisplay(page)).toHaveAttribute("data-is-playing", "false");

  // The Deck must remain in its in-flight presentation until the mocked Spotify
  // endpoint explicitly confirms success.
  const beforeConfirmation = await page.evaluate(() => window.__cdvFlightEvents ?? []);
  expect(beforeConfirmation.some((event) => event.name === "cdvicious:disc-flight-started")).toBe(true);
  expect(beforeConfirmation.some((event) => event.name === "cdvicious:disc-flight-arrived")).toBe(false);

  gate.respond({ kind: "response", status: 200, body: { success: true } });

  await expect(deckArtist(page)).toHaveText(ALBUM_IN_COLLECTION.artists[0].name, {
    timeout: 15_000,
  });
  await expect(deckDisplay(page)).toHaveAttribute("data-is-playing", "true", {
    timeout: 8_000,
  });
  await expect(flightDisc(page)).toHaveCount(0, { timeout: 8_000 });
  await expect(page.locator("html")).toHaveAttribute("data-chapter", "0", {
    timeout: 8_000,
  });

  const events = await page.evaluate(() => window.__cdvFlightEvents ?? []);
  const eventIndex = (name) => events.findIndex((event) => event.name === name);
  const started = eventIndex("cdvicious:disc-flight-started");
  const arrived = eventIndex("cdvicious:disc-flight-arrived");
  const ready = eventIndex("cdvicious:disc-flight-playback-ready");
  const playbackStarted = eventIndex("cdvicious:disc-flight-playback-started");
  expect(started, JSON.stringify(events)).toBeGreaterThanOrEqual(0);
  expect(arrived, JSON.stringify(events)).toBeGreaterThan(started);
  expect(ready, JSON.stringify(events)).toBeGreaterThan(arrived);
  expect(playbackStarted, JSON.stringify(events)).toBeGreaterThan(ready);
});

const failureScenarios = [
  {
    name: "autenticación rechazada",
    source: "Batea",
    chapter: 2,
    album: ALBUM_IN_CRATE,
    outcome: {
      kind: "response",
      status: 401,
      body: {
        success: false,
        error: "AUTH_REQUIRED",
        message: "Tu sesión de Spotify expiró. Volvé a iniciar sesión.",
      },
    },
    message: /sesión de Spotify expiró|iniciar sesión/i,
  },
  {
    name: "dispositivo no disponible",
    source: "Colección",
    chapter: 3,
    album: ALBUM_IN_COLLECTION,
    outcome: {
      kind: "response",
      status: 409,
      body: {
        success: false,
        error: "DEVICE_NOT_AVAILABLE",
        message: "El dispositivo de Spotify no está disponible. Activá un dispositivo e intentá de nuevo.",
      },
    },
    message: /dispositivo de Spotify no está disponible/i,
  },
  {
    name: "Spotify no confirma la reproducción",
    source: "Colección",
    chapter: 3,
    album: ALBUM_IN_COLLECTION,
    outcome: {
      kind: "response",
      status: 502,
      body: {
        success: false,
        error: "SPOTIFY_PLAY_FAILED",
        message: "Spotify no confirmó la reproducción. No se inició el vuelo; podés intentarlo de nuevo.",
      },
    },
    message: /Spotify no confirmó la reproducción/i,
  },
  {
    name: "fallo de red",
    source: "Batea",
    chapter: 2,
    album: ALBUM_IN_CRATE,
    outcome: { kind: "abort" },
    message: /no se pudo conectar con Spotify|conexión/i,
  },
];

for (const scenario of failureScenarios) {
  test("play rechazado (" + scenario.name + "): cancelar vuelo, restaurar modal y Deck", async ({ page }) => {
    test.skip(!RAIL_ENABLED, "El flujo flying-disc requiere RAIL_FLAG=1.");
    await openRail(page);
    const gate = createPlayGate(page);

    if (scenario.source === "Batea") {
      await chooseFromCrate(page, scenario.album);
    } else {
      await chooseFromCollection(page, scenario.album);
    }
    await openCaseAndPlay(page, scenario.album);

    const request = await gate.requestSeen;
    expect(request.body.uri).toBe(scenario.album.uri);
    await expect(flightDisc(page)).toBeVisible();
    await expect(dialog(page)).toHaveCount(0);
    await expect(deckDisplay(page)).toHaveAttribute("data-is-playing", "false");

    gate.respond(scenario.outcome);
    await assertCancelledAndRestored(page, scenario.album, scenario.chapter, scenario.message);
  });
}
