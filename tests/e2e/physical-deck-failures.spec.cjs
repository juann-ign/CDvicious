const { test, expect } = require("./support/qa-evidence.cjs");
const { openRail, go, installMock } = require("./support/b2-harness.cjs");

// Exercise the measured flight using the desktop's normal ANGLE renderer.
// Existing assertion deadlines, retries and the software-renderer suites remain unchanged.
test.use({ launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });

const ALBUM_ID = "mock-album-02";
const ORIGINAL_VOLUME = .37;
const collection = (page) => page.getByRole("region", { name: "La Colección", exact: true });
const dialog = (page) => page.getByRole("dialog", { name: "Nocturnal FM — Satélite Sur", exact: true });
const presentation = (page) => dialog(page).getByTestId("jewel-case-presentation");
const play = (page) => dialog(page).getByRole("button", { name: "Reproducir Nocturnal FM", exact: true });
const display = (page) => page.getByTestId("deck-now-playing");
const overlay = (page) => page.locator("[data-rail-overlay]");
const flight = (page) => page.getByTestId("rail-flying-disc");
const evidence = new WeakMap();

test.beforeEach(async ({ page }) => {
  const rows = [];
  evidence.set(page, rows);
  page.on("pageerror", (error) => rows.push({ type: "pageerror", message: error.message }));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/play") rows.push({ type: "play-request", at: Date.now(), body: request.postDataJSON() });
    if (/api\.spotify\.com/.test(request.url())) rows.push({ type: "unexpected-provider", url: request.url() });
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/play") rows.push({ type: "play-response", at: Date.now(), status: response.status() });
  });
  await page.addInitScript(() => {
    window.__deckFailureEvents = [];
    for (const name of ["started", "arrived", "done", "playback-ready", "playback-started", "cancelled"]) {
      window.addEventListener(`cdvicious:disc-flight-${name}`, (event) => {
        const box = document.querySelector('[data-testid="jewel-case-presentation"]');
        const cd = box?.querySelector('[data-testid="jewel-case-cd"]');
        const hinge = box?.querySelector('[data-testid="jewel-case-hinge"]');
        const hingeTransform = hinge ? getComputedStyle(hinge).transform : null;
        const matrix = hingeTransform ? new DOMMatrixReadOnly(hingeTransform) : null;
        window.__deckFailureEvents.push({
          name, at: performance.now(), attemptId: event.detail?.attemptId,
          chapter: document.documentElement.dataset.chapter,
          presentation: box?.getAttribute("data-presentation"),
          hinge: hingeTransform,
          hingeAngle: matrix ? Math.atan2(-matrix.m13, matrix.m11) * 180 / Math.PI : null,
          hingeTransitions: hinge?.getAnimations().filter((animation) => animation.transitionProperty === "transform").map((animation) => ({
            playState: animation.playState, pending: animation.pending, currentTime: animation.currentTime, startTime: animation.startTime,
          })),
          cdRect: cd?.getBoundingClientRect().toJSON(),
          snapshot: event.detail?.snapshot,
        });
      });
    }
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const state = await page.evaluate(async () => ({
    events: window.__deckFailureEvents,
    chapter: document.documentElement.dataset.chapter,
    phase: document.querySelector("[data-rail-overlay]")?.dataset.playbackPhase,
    attempt: document.querySelector("[data-rail-overlay]")?.dataset.playbackAttempt,
    confirmed: document.querySelector("[data-rail-overlay]")?.dataset.confirmedAttempt,
    vfd: document.querySelector('[data-testid="deck-now-playing"]')?.textContent,
    playing: document.querySelector('[data-testid="deck-now-playing"]')?.dataset.isPlaying,
    focused: document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent,
    alert: document.querySelector('[role="dialog"] [role="alert"]')?.textContent,
    volume: await window.__b2Mock?.mockSpotifyPlayer.getVolume(),
    mock: window.__b2Mock?.getSnapshot(),
  })).catch((error) => ({ evidenceError: error.message }));
  await testInfo.attach("physical-deck-failure-state", {
    body: JSON.stringify({ status: testInfo.status, rows: evidence.get(page), state }, null, 2), contentType: "application/json",
  });
  if (!page.isClosed()) {
    await testInfo.attach("physical-deck-recovery", { body: await page.screenshot(), contentType: "image/png" });
    await page.evaluate(async () => {
      if (!window.__b2Mock || !window.__deckFailureFixture) return;
      window.__b2Mock.restoreMockSnapshot(window.__deckFailureFixture.snapshot);
      await window.__b2Mock.mockSpotifyPlayer.setVolume(window.__deckFailureFixture.volume);
    }).catch(() => undefined);
  }
  expect((evidence.get(page) ?? []).filter((row) => row.type === "unexpected-provider")).toEqual([]);
});

async function contextState(page) {
  return collection(page).evaluate((node) => ({
    query: node.querySelector('[aria-label="Buscar artista o álbum"]')?.value,
    genre: node.querySelector('[aria-label="Filtrar por género"]')?.value,
    decade: node.querySelector('[aria-label="Filtrar por década"]')?.value,
    year: node.querySelector('[aria-label="Filtrar por año de edición"]')?.value,
    activeFilters: node.querySelector('[aria-label="Filtros activos"]')?.textContent,
    pagination: node.querySelector('[class*="pageLabel"]')?.textContent ?? null,
    albums: [...node.querySelectorAll('[data-collection-album-id]')].filter((card) => card.getClientRects().length).map((card) => card.dataset.collectionAlbumId),
    scroll: node.querySelector('[class*="gridFrame"]')?.scrollTop ?? 0,
  }));
}

async function prepare(page) {
  await openRail(page);
  await installMock(page);
  await page.evaluate(async (volume) => {
    window.__deckFailureFixture = { snapshot: structuredClone(window.__b2Mock.getSnapshot()), volume: await window.__b2Mock.mockSpotifyPlayer.getVolume() };
    const paused = structuredClone(window.__deckFailureFixture.snapshot);
    paused.data.isPlaying = false;
    paused.data.progressMs = 12_000;
    window.__b2Mock.restoreMockSnapshot(paused);
    await window.__b2Mock.mockSpotifyPlayer.setVolume(volume);
  }, ORIGINAL_VOLUME);
  await expect(display(page)).toHaveAttribute("data-is-playing", "false");
  const prior = await page.evaluate(() => structuredClone(window.__b2Mock.getSnapshot().data));
  await go(page, "Colección", 3);
  await expect(collection(page).getByRole("combobox", { name: "Filtrar por género", exact: true }).locator('option[value="electronic"]')).toHaveCount(1);
  await collection(page).getByRole("searchbox", { name: "Buscar artista o álbum", exact: true }).fill("Nocturnal");
  await collection(page).getByRole("combobox", { name: "Filtrar por género", exact: true }).selectOption("electronic");
  await collection(page).getByRole("combobox", { name: "Filtrar por década", exact: true }).selectOption("2020s");
  await collection(page).getByRole("combobox", { name: "Filtrar por año de edición", exact: true }).selectOption("2023");
  const card = collection(page).locator(`[data-collection-album-id="${ALBUM_ID}"]`);
  await expect(card).toBeVisible();
  const context = await contextState(page);
  await card.click();
  await expect(dialog(page)).toBeVisible();
  await expect(presentation(page)).toHaveAttribute("data-presentation", "closed");
  return { prior, context };
}

async function holdPlayRequests(page) {
  const held = [];
  await page.route("**/api/play", async (route) => {
    const body = route.request().postDataJSON();
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const entry = { body, release, outcome: "pending" };
    held.push(entry);
    evidence.get(page).push({ type: "held-play", body });
    const response = await pending;
    try {
      await route.fulfill({ status: response.status, contentType: "application/json", body: JSON.stringify(response.body) });
      entry.outcome = "fulfilled";
    } catch (error) {
      // An aborted request can no longer receive the intentionally late reply.
      entry.outcome = "already-aborted";
      evidence.get(page).push({ type: "late-response-after-abort", attemptId: body.attemptId, message: error.message });
    }
  });
  return {
    held,
    async release(index, status = 200, body = { success: true }) {
      held[index].release({ status, body });
      await expect.poll(() => held[index].outcome).not.toBe("pending");
    },
    releaseAll() { for (const request of held) request.release({ status: 200, body: { success: true } }); },
  };
}

async function startLoad(page, requests, count = 1) {
  await play(page).click();
  await expect(display(page)).toHaveAttribute("data-playback-state", "loading");
  await expect(page.getByTestId("deck-now-playing-track")).toHaveText("CARGANDO");
  await expect(display(page)).toHaveAttribute("data-is-playing", "false");
  await expect(overlay(page)).toHaveAttribute("data-confirmed-attempt", "");
  await expect.poll(() => requests.held.length).toBe(count);
  const attemptId = await overlay(page).getAttribute("data-playback-attempt");
  expect(attemptId).toBeTruthy();
  expect(requests.held[count - 1].body).toMatchObject({ attemptId, uri: "spotify:album:mock-02", deviceId: "cdvicious-mock-device" });
  expect(await page.evaluate(() => window.__b2Mock.mockSpotifyPlayer.getVolume())).toBe(0);
  const start = await page.evaluate((id) => window.__deckFailureEvents.find((event) => event.name === "started" && event.attemptId === id), attemptId);
  // onOpened can launch before React commits the queued phase attribute. The
  // rendered hinge must nevertheless be fully open, with no pending motion.
  expect(start.hingeAngle).not.toBeNull();
  expect(Math.abs(start.hingeAngle - -168)).toBeLessThan(.5);
  expect(start.hingeTransitions.filter((animation) => animation.pending || animation.playState === "running")).toEqual([]);
  expect(start.cdRect.width).toBeGreaterThan(0);
  expect(start.cdRect.height).toBeGreaterThan(0);
  return attemptId;
}

async function expectRecovered(page, setup, phase, message) {
  await expect(overlay(page)).toHaveAttribute("data-playback-phase", phase);
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole("alert")).toContainText(message);
  await expect(play(page)).toBeEnabled();
  await expect(play(page)).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-chapter", "3");
  await expect(page.locator("[data-rail-wrapper]").locator("..")).toHaveAttribute("data-rail-moving", "false");
  await expect(flight(page)).toHaveCount(0);
  await expect(display(page)).toHaveAttribute("data-playback-state", "settled");
  await expect(display(page)).toHaveAttribute("data-is-playing", "false");
  await expect(page.getByTestId("deck-now-playing-track")).toHaveText(setup.prior.track.name);
  await expect(overlay(page)).toHaveAttribute("data-confirmed-attempt", "");
  expect(await page.evaluate(() => window.__b2Mock.mockSpotifyPlayer.getVolume())).toBe(ORIGINAL_VOLUME);
  expect(await contextState(page)).toEqual(setup.context);
  const current = await page.evaluate(() => window.__b2Mock.getSnapshot().data);
  expect(current.track.id).toBe(setup.prior.track.id);
  expect(current.track.album.id).toBe(setup.prior.track.album.id);
}

for (const status of [403, 429]) {
  test(`physical-deck: HTTP ${status} restores the original volume, origin and Collection context`, async ({ page }) => {
    const setup = await prepare(page), requests = await holdPlayRequests(page);
    try {
      const attemptId = await startLoad(page, requests);
      const message = status === 403 ? "El dispositivo no permite reproducir este álbum." : "Spotify está limitando las solicitudes. Esperá antes de reintentar.";
      await requests.release(0, status, { success: false, message });
      await expectRecovered(page, setup, "failed", message);
      const confirmed = await page.evaluate((id) => window.__deckFailureEvents.filter((event) => event.name === "playback-started" && event.attemptId === id), attemptId);
      expect(confirmed).toEqual([]);
    } finally { requests.releaseAll(); }
  });
}

test("physical-deck: the real 25-second POST timeout returns to the same open box", async ({ page }) => {
  const setup = await prepare(page), requests = await holdPlayRequests(page);
  try {
    const attemptId = await startLoad(page, requests);
    // Only this scenario extends an assertion deadline: the product's real
    // 25-second timeout runs unchanged, with no fake timers or forced event.
    await expect(overlay(page)).toHaveAttribute("data-playback-phase", "failed", { timeout: 30_000 });
    await expectRecovered(page, setup, "failed", "Spotify no confirmó la reproducción a tiempo");
    const elapsed = await page.evaluate((id) => performance.now() - window.__deckFailureEvents.find((event) => event.name === "started" && event.attemptId === id).at, attemptId);
    evidence.get(page).push({ type: "real-timeout-elapsed", attemptId, elapsed });
    expect(elapsed).toBeGreaterThanOrEqual(24_900);
    await requests.release(0);
    await expect(overlay(page)).toHaveAttribute("data-playback-phase", "failed");
    await expect(overlay(page)).toHaveAttribute("data-confirmed-attempt", "");
  } finally { requests.releaseAll(); }
});

test("physical-deck: Cancelar carga aborts a retained POST and restores the same origin", async ({ page }) => {
  const setup = await prepare(page), requests = await holdPlayRequests(page);
  try {
    await startLoad(page, requests);
    await expect(page.locator("html")).toHaveAttribute("data-chapter", "0");
    await page.getByRole("button", { name: "CANCELAR CARGA", exact: true }).click();
    await expectRecovered(page, setup, "cancelled", "Carga cancelada");
    await requests.release(0);
    await expectRecovered(page, setup, "cancelled", "Carga cancelada");
  } finally { requests.releaseAll(); }
});

test("physical-deck: Escape in flight and old replies or events cannot release the next attempt", async ({ page }) => {
  const setup = await prepare(page), requests = await holdPlayRequests(page);
  try {
    const oldId = await startLoad(page, requests);
    await expect(flight(page)).toBeVisible();
    expect(Number(await flight(page).getAttribute("data-flight-progress"))).toBeLessThan(1);
    await page.keyboard.press("Escape");
    await expectRecovered(page, setup, "cancelled", "Carga cancelada");

    const newId = await startLoad(page, requests, 2);
    expect(newId).not.toBe(oldId);
    await requests.release(0);
    await page.evaluate((attemptId) => {
      window.dispatchEvent(new CustomEvent("cdvicious:disc-flight-playback-ready", { detail: { attemptId } }));
      window.dispatchEvent(new CustomEvent("cdvicious:disc-flight-cancelled", { detail: { attemptId } }));
    }, oldId);
    await expect(overlay(page)).toHaveAttribute("data-playback-attempt", newId);
    await expect(display(page)).toHaveAttribute("data-playback-state", "loading");
    await expect(overlay(page)).toHaveAttribute("data-confirmed-attempt", "");
    const beforeRelease = await page.evaluate(() => window.__b2Mock.getSnapshot().data);
    expect(beforeRelease.track.album.id).toBe(setup.prior.track.album.id);
    await requests.release(1);
    await expect(overlay(page)).toHaveAttribute("data-confirmed-attempt", newId);
    await expect(page.getByTestId("deck-now-playing-track")).toHaveText("Antena del sur");
    await expect(display(page)).toHaveAttribute("data-is-playing", "true");
    expect(await page.evaluate(() => window.__b2Mock.mockSpotifyPlayer.getVolume())).toBe(ORIGINAL_VOLUME);
    const events = await page.evaluate(() => window.__deckFailureEvents);
    expect(events.filter((event) => event.name === "playback-started" && event.attemptId === oldId)).toEqual([]);
    const arrived = events.findIndex((event) => event.name === "arrived" && event.attemptId === newId);
    const confirmed = events.findIndex((event) => event.name === "playback-started" && event.attemptId === newId);
    expect(arrived).toBeGreaterThanOrEqual(0);
    expect(confirmed).toBeGreaterThan(arrived);
    expect(events[confirmed].snapshot.track.album.id).toBe(ALBUM_ID);
    expect(requests.held).toHaveLength(2);
  } finally { requests.releaseAll(); }
});
