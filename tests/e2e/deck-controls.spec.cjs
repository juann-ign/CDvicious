const { test, expect } = require("./support/qa-evidence.cjs");
const { openRail, go, installMock } = require("./support/b2-harness.cjs");

// Normal mock APIs and normal desktop renderer. Only the named long-title
// case injects metadata; no normal playback/volume case intercepts requests.
test.use({ viewport: { width: 1280, height: 720 }, launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });

const hardware = (page) => page.getByRole("group", { name: /^Reproductor de CD/ });
const knob = (page) => hardware(page).getByRole("slider", { name: "Volumen del equipo", exact: true });
// The footer remains mounted to preserve canonical state, but is deliberately
// hidden/inert on Deck and Split. Actual footer interaction happens elsewhere.
const footerVolume = (page) => page.locator("[data-global-player]").getByRole("slider", { name: "Volumen del transporte", exact: true, includeHidden: true });
const display = (page) => page.getByTestId("deck-now-playing");
const title = (page) => page.getByTestId("deck-now-playing-track");
const physicalPrevious = (page) => hardware(page).getByRole("button", { name: "Pista anterior del equipo", exact: true });
const physicalNext = (page) => hardware(page).getByRole("button", { name: "Pista siguiente del equipo", exact: true });
const physicalToggle = (page) => hardware(page).getByRole("button", { name: "Pausar/reanudar equipo", exact: true });
const collection = (page) => page.getByRole("region", { name: "La Colección", exact: true });

async function ready(page) {
  await openRail(page);
  await expect(physicalToggle(page)).toBeEnabled();
  await expect(knob(page)).toHaveAttribute("aria-disabled", "false");
}

async function visibleBounds(page) {
  return hardware(page).evaluate((deck) => {
    const surfaces = [...deck.querySelectorAll("[data-deck-surface]")].map((node) => node.getBoundingClientRect());
    const bounds = {
      left: Math.min(...surfaces.map((box) => box.left)),
      right: Math.max(...surfaces.map((box) => box.right)),
      top: Math.min(...surfaces.map((box) => box.top)),
      bottom: Math.max(...surfaces.map((box) => box.bottom)),
    };
    const region = document.querySelector("[data-rail-overlay]").getBoundingClientRect();
    const paper = document.querySelector('[data-testid="lyrics-paper"]')?.getBoundingClientRect();
    return {
      bounds,
      region: region.toJSON(),
      paper: paper?.toJSON(),
      sceneSize: { width: deck.querySelector("[data-deck-design-frame]").clientWidth, height: deck.querySelector("[data-deck-design-frame]").clientHeight },
      controls: [...deck.querySelectorAll('button, [role="slider"]')].map((node) => node.getBoundingClientRect().toJSON()),
      canvasCount: deck.querySelectorAll("canvas").length,
    };
  });
}

async function assertFits(page, split = false) {
  const measurement = await visibleBounds(page);
  const { bounds, region } = measurement;
  expect(bounds.left).toBeGreaterThanOrEqual(region.left + 4);
  expect(bounds.right).toBeLessThanOrEqual(region.right - 4);
  expect(bounds.top).toBeGreaterThanOrEqual(region.top + 4);
  expect(bounds.bottom).toBeLessThanOrEqual(region.bottom - 4);
  expect(bounds.right - bounds.left).toBeGreaterThanOrEqual(region.width * (split ? 0.44 : 0.65));
  if (!split) expect(bounds.right - bounds.left).toBeLessThanOrEqual(region.width * 0.85);
  expect(measurement.sceneSize.width).toBeGreaterThan(0);
  expect(measurement.sceneSize.width / measurement.sceneSize.height).toBeCloseTo(1280 / 660, 3);
  expect(measurement.canvasCount).toBe(0);
  for (const control of measurement.controls) {
    expect(control.width).toBeGreaterThan(0);
    expect(control.height).toBeGreaterThan(0);
    expect(control.top).toBeGreaterThanOrEqual(region.top);
    expect(control.bottom).toBeLessThanOrEqual(region.bottom);
  }
  if (split) {
    expect(measurement.paper).toBeDefined();
    expect(bounds.right).toBeLessThanOrEqual(measurement.paper.left - 4);
    const equipmentCenter = (bounds.top + bounds.bottom) / 2;
    const paperCenter = (measurement.paper.top + measurement.paper.bottom) / 2;
    expect(Math.abs(equipmentCenter - paperCenter)).toBeLessThan(50);
    await expect(page.getByTestId("lyrics-pagination-controls")).toBeInViewport();
  }
  return measurement;
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1280, height: 720 }]) {
  test.describe(`physical controls ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test("the visible equipment fits Deck and balances Split without covering the booklet", async ({ page }, testInfo) => {
      await ready(page);
      const deck = await assertFits(page);
      await hardware(page).evaluate((node) => { window.__persistedPhysicalDeck = node; });
      await go(page, "Split", 1);
      const split = await assertFits(page, true);
      expect(split.sceneSize).toEqual(deck.sceneSize);
      expect(await hardware(page).evaluate((node) => node === window.__persistedPhysicalDeck)).toBe(true);
      await go(page, "Deck", 0);
      await assertFits(page);
      await testInfo.attach("visible-physical-bounds", { body: JSON.stringify({ viewport, deck, split }, null, 2), contentType: "application/json" });
    });
  });
}

test("physical controls: Deck and Split transport reflect the canonical footer and rapid track changes", async ({ page }) => {
  await ready(page);
  const first = await title(page).textContent();
  await physicalToggle(page).click();
  await expect(display(page)).toHaveAttribute("data-is-playing", "false");
  await expect(physicalToggle(page)).toHaveAttribute("aria-pressed", "false");
  await physicalToggle(page).click();
  await expect(display(page)).toHaveAttribute("data-is-playing", "true");
  await physicalNext(page).click();
  await expect(title(page)).not.toHaveText(first);
  const second = await title(page).textContent();
  await physicalPrevious(page).click();
  await expect(title(page)).toHaveText(first);
  await go(page, "Split", 1);
  await physicalNext(page).click();
  await expect(title(page)).toHaveText(second);
  await physicalPrevious(page).click();
  await expect(title(page)).toHaveText(first);
  await physicalNext(page).click();
  await physicalNext(page).click();
  await expect(title(page)).not.toHaveText(second);
  await physicalPrevious(page).click();
  await expect(title(page)).toHaveText(second);
  await expect(hardware(page).locator("[data-deck-display-mirror] strong")).toHaveText(second);
  await go(page, "Colección", 3);
  await page.getByRole("button", { name: "Play/Pause", exact: true }).click();
  await go(page, "Split", 1);
  await expect(physicalToggle(page)).toHaveAttribute("aria-pressed", "false");
});

test("physical controls: volume keyboard, drag, pointer cancellation and lost capture share one value and release the rail", async ({ page }) => {
  await ready(page);
  await knob(page).focus();
  await page.keyboard.press("Home");
  await expect(footerVolume(page)).toHaveValue("0");
  await page.keyboard.press("End");
  await expect(footerVolume(page)).toHaveValue("1");
  await expect(knob(page)).toHaveAttribute("aria-valuenow", "100");
  await page.keyboard.press("Home");
  for (let index = 0; index < 3; index++) await page.keyboard.press("PageUp");
  await expect(footerVolume(page)).toHaveValue("0.3");
  let box = await knob(page).boundingBox();
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const radius = Math.min(box.width, box.height) * 0.35;
  await page.mouse.move(center.x, center.y - radius);
  await page.mouse.down();
  for (const degrees of [-75, -60, -45, -30, -15, 0]) {
    const angle = degrees * Math.PI / 180;
    await page.mouse.move(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius);
  }
  await page.mouse.up();
  await expect.poll(async () => Number(await footerVolume(page).inputValue())).toBeGreaterThan(0.3);
  const dragged = Number(await footerVolume(page).inputValue());
  await expect(knob(page)).toHaveAttribute("aria-valuenow", String(Math.round(dragged * 100)));
  await expect(page.locator("html")).toHaveAttribute("data-chapter", "0");
  for (const [event, destination, index] of [["pointercancel", "Split", 1], ["lostpointercapture", "Deck", 0]]) {
    box = await knob(page).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - Math.min(box.width, box.height) * 0.35);
    await page.mouse.down();
    await expect.poll(() => knob(page).evaluate((node) => getComputedStyle(node).cursor)).toBe("grabbing");
    // Explicit DOM pointer-loss fixture; normal mouse drag above is unmodified.
    await knob(page).dispatchEvent(event, { pointerId: 1, pointerType: "mouse" });
    await page.mouse.up();
    await expect.poll(() => knob(page).evaluate((node) => getComputedStyle(node).cursor)).toBe("grab");
    await go(page, destination, index);
    await expect(knob(page)).toHaveAttribute("aria-valuenow", String(Math.round(dragged * 100)));
  }
  await go(page, "Colección", 3);
  await footerVolume(page).focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await go(page, "Deck", 0);
  await expect(knob(page)).toHaveAttribute("aria-valuenow", "1");
});

async function observeAttempt(page) {
  const requests = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/play") requests.push(request.postDataJSON()); });
  await page.addInitScript(() => {
    window.__controlAttempts = [];
    const readQuad = (node, attribute) => node ? Object.fromEntries(["tl", "tr", "bl", "br"].map((key) => {
      const marker = node.querySelector(`[${attribute}="${key}"]`).getBoundingClientRect();
      return [key, { x: marker.left, y: marker.top }];
    })) : null;
    for (const name of ["started", "arrived", "playback-started"]) window.addEventListener(`cdvicious:disc-flight-${name}`, (event) => {
      window.__controlAttempts.push({ name, attemptId: event.detail?.attemptId, at: performance.now(),
        target: name === "arrived" ? readQuad(document.querySelector("[data-deck-disc-target]"), "data-disc-pose-corner") : null,
        flight: name === "arrived" ? readQuad(document.querySelector('[data-testid="rail-flying-disc"]'), "data-flight-pose-corner") : null });
    });
    window.addEventListener("cdvicious:deck-load-pose", (event) => {
      if (event.detail?.phase !== "lowering") return;
      const bounds = [...document.querySelectorAll("[data-physical-deck] [data-deck-surface]")].map((node) => node.getBoundingClientRect());
      window.__openDeckBounds = { left: Math.min(...bounds.map((box) => box.left)), right: Math.max(...bounds.map((box) => box.right)),
        top: Math.min(...bounds.map((box) => box.top)), bottom: Math.max(...bounds.map((box) => box.bottom)),
        region: document.querySelector("[data-rail-overlay]").getBoundingClientRect().toJSON() };
    });
  });
  return requests;
}

async function assertAttempt(page, requests, expectedTitle) {
  await expect(title(page)).toHaveText("CARGANDO");
  // During the chapter handoff the overlay may still be inert; its controls
  // must already be disabled before Deck becomes the active panel.
  await expect(page.locator("[data-physical-deck]").getByRole("button", { name: "Pausar/reanudar equipo", exact: true, includeHidden: true })).toBeDisabled();
  await expect(page.locator("[data-physical-deck]").getByRole("slider", { name: "Volumen del equipo", exact: true, includeHidden: true })).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("[data-rail-overlay]")).toHaveAttribute("data-playback-phase", "confirmed");
  await expect(title(page)).toHaveText(expectedTitle);
  await expect(display(page)).toHaveAttribute("data-is-playing", "true");
  await expect(page.getByTestId("rail-flying-disc")).toHaveCount(0);
  expect(requests).toHaveLength(1);
  expect(requests[0].deviceId).toBe("cdvicious-mock-device");
  await expect(page.locator("[data-rail-overlay]")).toHaveAttribute("data-confirmed-attempt", requests[0].attemptId);
  const events = await page.evaluate(() => window.__controlAttempts);
  expect(events.map((event) => event.name)).toEqual(["started", "arrived", "playback-started"]);
  expect(new Set(events.map((event) => event.attemptId)).size).toBe(1);
  expect(events[2].at).toBeGreaterThanOrEqual(events[1].at);
  for (const corner of ["tl", "tr", "bl", "br"]) {
    expect(Math.hypot(events[1].target[corner].x - events[1].flight[corner].x, events[1].target[corner].y - events[1].flight[corner].y)).toBeLessThan(1);
  }
  const opened = await page.evaluate(() => window.__openDeckBounds);
  expect(opened).toBeDefined();
  expect(opened.left).toBeGreaterThanOrEqual(opened.region.left);
  expect(opened.right).toBeLessThanOrEqual(opened.region.right);
  expect(opened.top).toBeGreaterThanOrEqual(opened.region.top);
  expect(opened.bottom).toBeLessThanOrEqual(opened.region.bottom);
  await expect(hardware(page).locator("[data-deck-inserted-disc]")).toBeVisible();
  await expect(physicalToggle(page)).toBeEnabled();
}

test("physical controls: normal Collection handoff emits one order and preserves equipment and volume across resize to Split", async ({ page }) => {
  const requests = await observeAttempt(page);
  await ready(page);
  await knob(page).focus();
  await page.keyboard.press("Home");
  for (let index = 0; index < 4; index++) await page.keyboard.press("PageUp");
  await expect(footerVolume(page)).toHaveValue("0.4");
  await go(page, "Colección", 3);
  await collection(page).locator("[data-page-size]").getByRole("button", { name: "Satélite Sur — Nocturnal FM", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByRole("button", { name: "Abrir caja", exact: true }).click();
  await expect(modal.getByTestId("jewel-case-presentation")).toHaveAttribute("data-presentation", "open");
  await modal.getByRole("button", { name: "Reproducir Nocturnal FM", exact: true }).dblclick();
  await assertAttempt(page, requests, "Antena del sur");
  await expect(footerVolume(page)).toHaveValue("0.4");
  await hardware(page).evaluate((node) => { window.__persistedPhysicalDeck = node; });
  await page.setViewportSize({ width: 1440, height: 900 });
  await go(page, "Split", 1);
  await assertFits(page, true);
  expect(await hardware(page).evaluate((node) => node === window.__persistedPhysicalDeck)).toBe(true);
  await expect(knob(page)).toHaveAttribute("aria-valuenow", "40");
});

test("physical controls: normal Artist handoff confirms the selected edition once and exposes the same transport", async ({ page }) => {
  const requests = await observeAttempt(page);
  await ready(page);
  await go(page, "Colección", 3);
  await collection(page).getByRole("button", { name: "Buscar artista", exact: true }).click();
  await page.getByRole("searchbox", { name: "Buscar artistas", exact: true }).fill("Vertice");
  await collection(page).locator('[aria-label="Resultados de artistas"]').getByRole("button").first().click();
  const scene = page.getByTestId("artist-disc-scene");
  await scene.hover({ position: { x: 8, y: 28 } });
  await scene.getByRole("button", { name: "Seleccionar Campo magnético", exact: true }).click();
  await page.getByTestId("artist-discography").getByRole("button", { name: "REPRODUCIR ÁLBUM", exact: true }).dblclick();
  await assertAttempt(page, requests, "Órbita de papel");
  expect(requests[0].uri).toBe("spotify:album:demo-vertice-album-0");
  await physicalNext(page).click();
  await expect(title(page)).toHaveText("Campo abierto");
  await go(page, "Split", 1);
  await expect(hardware(page).locator("[data-deck-display-mirror] strong")).toHaveText("Campo abierto");
});

test("physical controls: first load from an explicit empty-playback fixture measures the newly mounted booklet", async ({ page }) => {
  const requests = await observeAttempt(page);
  await ready(page);
  await installMock(page);
  await page.evaluate(() => window.__b2Mock.restoreMockSnapshot({ data: null, error: false }));
  await expect(title(page)).toHaveText("INSERT DISC");
  await go(page, "Colección", 3);
  await collection(page).locator("[data-page-size]").getByRole("button", { name: "Satélite Sur — Nocturnal FM", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByRole("button", { name: "Abrir caja", exact: true }).click();
  await expect(modal.getByTestId("jewel-case-presentation")).toHaveAttribute("data-presentation", "open");
  await modal.getByRole("button", { name: "Reproducir Nocturnal FM", exact: true }).click();
  await assertAttempt(page, requests, "Antena del sur");
  await go(page, "Split", 1);
  await assertFits(page, true);
});

test("physical controls: explicit long-title fixture keeps glass and equipment dimensions stable", async ({ page }) => {
  await ready(page);
  await installMock(page);
  const initial = await visibleBounds(page);
  const displayRect = await hardware(page).locator("[data-deck-display-mirror]").boundingBox();
  await page.evaluate(() => {
    const next = structuredClone(window.__b2Original);
    next.data.track.name = "Una canción de nombre extraordinariamente largo / ".repeat(20);
    window.__b2Mock.restoreMockSnapshot(next);
  });
  await expect(title(page)).toContainText("extraordinariamente largo");
  expect(await hardware(page).locator("[data-deck-display-mirror]").boundingBox()).toEqual(displayRect);
  const changed = await visibleBounds(page);
  expect(changed.bounds).toEqual(initial.bounds);
  await go(page, "Split", 1);
  await assertFits(page, true);
  const clipping = await hardware(page).locator("[data-deck-display-mirror] strong").evaluate((node) => ({ overflow: getComputedStyle(node).overflow, ellipsis: getComputedStyle(node).textOverflow }));
  expect(clipping).toEqual({ overflow: "hidden", ellipsis: "ellipsis" });
});
