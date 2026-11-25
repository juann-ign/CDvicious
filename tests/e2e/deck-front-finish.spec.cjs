const approvedPoses = require("./fixtures/split-balance-approved.json");
const {
  test, expect, hardware, canonicalState, saveRecord, go, bootPrototype, observeRequests,
} = require("./support/prototype-harness.cjs");
const { openRail, installMock, setTrack } = require("./support/b2-harness.cjs");

test.use({ viewport: { width: 1440, height: 900 }, launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });

const screen = (page) => hardware(page).getByRole("group", { name: "Pantalla del equipo", exact: true });
const toggle = (page) => hardware(page).getByRole("button", { name: "Pausar/reanudar equipo", exact: true });
const lift = (page) => page.getByRole("button", { name: "Elevar CD del equipo", exact: true });
const latch = (page) => page.locator("[data-deck-lift-latch]");
const deck = (page) => page.locator("[data-physical-deck]");
const footer = (page) => page.locator("[data-global-player]");
const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1280, height: 720 }];

async function measure(page) {
  return page.evaluate(() => {
    const rect = (node) => node?.getBoundingClientRect().toJSON() ?? null;
    const faces = [...document.querySelectorAll("[data-deck-surface]")].map((node) => node.getBoundingClientRect());
    const glass = document.querySelector("[data-deck-display-mirror]");
    const layer = document.querySelector("[data-rail-overlay]");
    return {
      viewport: { width: innerWidth, height: innerHeight }, chapter: document.documentElement.dataset.chapter,
      nav: rect(document.querySelector("[data-shell-header]")), region: rect(layer),
      equipment: { left: Math.min(...faces.map((box) => box.left)), right: Math.max(...faces.map((box) => box.right)),
        top: Math.min(...faces.map((box) => box.top)), bottom: Math.max(...faces.map((box) => box.bottom)) },
      front: rect(document.querySelector("[data-deck-front]")), glass: rect(glass),
      title: rect(glass?.querySelector("strong")), artist: rect(glass?.querySelector('[class*="artist"]')),
      times: rect(glass?.querySelector('[class*="progressTimes"]')),
      controls: [...document.querySelectorAll('[aria-label="Controles del equipo"] button')].map((node) => ({
        label: node.getAttribute("aria-label"), rect: rect(node),
        hit: node.contains(document.elementFromPoint(node.getBoundingClientRect().x + node.getBoundingClientRect().width / 2,
          node.getBoundingClientRect().y + node.getBoundingClientRect().height / 2)),
      })),
      paper: rect(document.querySelector('[data-testid="lyrics-paper"]')), footer: rect(document.querySelector("[data-global-player]")),
      // The reserved footer must not clip the equipment's continuous floor
      // shadow. Screenshots provide the companion visual seam evidence.
      floorShadowClip: { x: getComputedStyle(layer).overflowX, y: getComputedStyle(layer).overflowY },
    };
  });
}

function inside(inner, outer, allowance = 2) {
  expect(inner).not.toBeNull();
  for (const edge of ["left", "top"]) expect(inner[edge]).toBeGreaterThanOrEqual(outer[edge] - allowance);
  for (const edge of ["right", "bottom"]) expect(inner[edge]).toBeLessThanOrEqual(outer[edge] + allowance);
}

async function hiddenFooter(page) {
  await expect(footer(page)).toHaveAttribute("aria-hidden", "true");
  expect(await footer(page).evaluate((node) => Boolean(node.closest("[inert]")))).toBe(true);
  await expect(footer(page)).toBeHidden();
  const slider = footer(page).getByRole("slider", { name: "Volumen del transporte", exact: true, includeHidden: true });
  expect(await slider.evaluate((node) => { node.focus(); return document.activeElement === node; })).toBe(false);
}

test("front layout: Deck and Split retain their composition, readable contents and continuous hidden-footer floor at three sizes", async ({ page }, testInfo) => {
  await openRail(page);
  await expect(toggle(page)).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  const records = [];
  await deck(page).evaluate((node) => { window.__finishPersistentDeck = node; });
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const [chapter, index, stem] of [["Deck", 0, "Deck-docked"], ["Split", 1, "Split"]]) {
      await go(page, chapter, index);
      if (index === 1) await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-pagination-state", "ready");
      await expect(screen(page).locator('[class*="progressTimes"] span')).toHaveCount(2);
      const current = await measure(page);
      const name = `${stem}-${viewport.width}x${viewport.height}`;
      const size = `${viewport.width}x${viewport.height}`;
      const approved = index === 1 ? approvedPoses.split[size] : approvedPoses.deck[size];
      await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: "allow" });
      await saveRecord(testInfo, name, { current, approved });
      records.push({ name, current });
      expect(await deck(page).evaluate((node) => node === window.__finishPersistentDeck)).toBe(true);
      inside(current.equipment, current.region);
      inside(current.glass, current.front);
      for (const contents of [current.title, current.artist, current.times]) inside(contents, current.glass);
      expect(current.controls).toHaveLength(3);
      for (const control of current.controls) { inside(control.rect, current.front); expect(control.hit).toBe(true); }
      for (const edge of ["left", "right", "top", "bottom"]) expect(Math.abs(current.equipment[edge] - approved.equipment[edge])).toBeLessThan(2);
      if (index === 1) {
        for (const key of ["x", "y", "width", "height"]) expect(Math.abs(current.paper[key] - approved.paper[key])).toBeLessThan(2);
        expect(current.equipment.right).toBeLessThan(current.paper.left);
        await expect(page.getByTestId("lyrics-paper")).toBeInViewport({ ratio: 1 });
      }
      await hiddenFooter(page);
      expect(current.footer.height).toBe(128);
      expect(current.region.bottom).toBe(current.footer.top);
      expect(current.floorShadowClip).toEqual({ x: "visible", y: "visible" });
      await expect(page.getByRole("button", { name: /CLIC MECÁNICO/i, includeHidden: true })).toHaveCount(0);
      await expect(screen(page).getByText("REPRODUCIENDO", { exact: true })).toHaveCount(0);
    }
  }
  await saveRecord(testInfo, "front-three-size-comparison", records);
});

test("front normal mock: icon clicks issue one canonical transport step and Deck/Split share pause, artist and time", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  await openRail(page);
  await expect(toggle(page)).toBeEnabled();
  const next = () => hardware(page).getByRole("button", { name: "Pista siguiente del equipo", exact: true });
  const previous = () => hardware(page).getByRole("button", { name: "Pista anterior del equipo", exact: true });
  const records = [];
  async function coherent(expectedTitle, expectedDuration) {
    await expect(page.getByTestId("deck-now-playing-track")).toHaveText(expectedTitle);
    await expect(screen(page).locator("strong")).toHaveText(expectedTitle);
    const state = await canonicalState(page);
    expect(state.duration).toBe(expectedDuration);
    await expect(screen(page).getByText(state.artist, { exact: true })).toBeVisible();
    await expect(screen(page)).toHaveAttribute("aria-busy", "false");
    const times = await screen(page).locator('[class*="progressTimes"] span').allTextContents();
    const seconds = (value) => value.split(":").map(Number).reduce((minutes, seconds) => minutes * 60 + seconds);
    expect(seconds(times[1])).toBe(state.duration);
    expect(Math.abs(seconds(times[0]) - state.elapsed)).toBeLessThanOrEqual(1);
    records.push({ state, times });
  }
  await coherent("Ventana de neón", 203);
  await next().locator("svg").click();
  await coherent("Ascensor azul", 187);
  await toggle(page).locator("svg").click();
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "false");
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  await expect(screen(page).getByRole("status")).toHaveText("PAUSA");
  const paused = await canonicalState(page);
  await go(page, "Split", 1);
  await coherent("Ascensor azul", 187);
  expect(await canonicalState(page)).toEqual(paused);
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  await toggle(page).locator("svg").click();
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "true");
  await expect(screen(page).getByRole("status")).toHaveCount(0);
  await next().locator("svg").click();
  await coherent("Mapa de azoteas", 321);
  await previous().locator("svg").click();
  await coherent("Ascensor azul", 187);
  expect(requests.play).toHaveLength(0);
  await saveRecord(testInfo, "front-normal-transport", { records, paused, playRequests: requests.play });
});

test("front explicit confirmed-title fixture: Cargando sueños is a track, with canonical artist, time and transport", async ({ page }, testInfo) => {
  await openRail(page);
  await expect(toggle(page)).toBeEnabled();
  // Explicit metadata fixture only. It uses the existing mock store and keeps
  // its confirmed playback/device contract; no provider requests are routed.
  await installMock(page);
  await setTrack(page, "finish-confirmed-cargando", "Cargando sueños", true);
  const state = await canonicalState(page);
  const display = await screen(page).evaluate((node) => ({
    text: node.textContent, busy: node.getAttribute("aria-busy"),
    times: [...node.querySelectorAll('[class*="progressTimes"] span')].map((span) => span.textContent),
  }));
  await page.screenshot({ path: testInfo.outputPath("confirmed-cargando-title.png"), animations: "allow" });
  await saveRecord(testInfo, "confirmed-cargando-title", { state, display });
  await expect(screen(page)).toHaveAttribute("aria-busy", "false");
  await expect(screen(page).locator("strong")).toHaveText("Cargando sueños");
  await expect(screen(page).getByText("B2 Demo Artist", { exact: true })).toBeVisible();
  await expect(screen(page).locator('[class*="progressTimes"] span')).toHaveCount(2);
  expect(state.duration).toBeGreaterThan(0);
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  await expect(screen(page).getByRole("status")).toHaveText("PAUSA");
  await expect(screen(page)).toHaveAttribute("aria-busy", "false");
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await expect(screen(page).locator("strong")).toHaveText("Cargando sueños");
  const originalGlass = await screen(page).boundingBox();
  const longTitle = "Crónica de las estaciones invisibles en una ciudad que continúa escuchando después del último tren ".repeat(3).trim();
  await setTrack(page, "finish-confirmed-long-title", longTitle, true);
  await expect(screen(page).locator("strong")).toHaveText(longTitle);
  await expect(screen(page).locator("strong")).toHaveAttribute("title", longTitle);
  const longGlass = await screen(page).boundingBox();
  expect(Math.abs(longGlass.width - originalGlass.width)).toBeLessThan(.5);
  expect(Math.abs(longGlass.height - originalGlass.height)).toBeLessThan(.5);
  const clipped = await screen(page).locator("strong").evaluate((node) => ({
    overflow: getComputedStyle(node).textOverflow, client: node.clientWidth, scroll: node.scrollWidth,
  }));
  expect(clipped.overflow).toBe("ellipsis");
  expect(clipped.scroll).toBeGreaterThan(clipped.client);
  await saveRecord(testInfo, "confirmed-long-title", { originalGlass, longGlass, clipped, title: longTitle });
});

test("front latch normal mock: threshold, pointer loss, keyboard and resize restore the gesture and lift once without playback orders", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  await bootPrototype(page, "deck-lift");
  const before = await canonicalState(page);
  await page.evaluate(() => {
    const target = document.querySelector("[data-physical-deck]");
    window.__finishLatchPhases = [target.dataset.discState];
    window.__finishLatchObserver = new MutationObserver(() => {
      if (window.__finishLatchPhases.at(-1) !== target.dataset.discState) window.__finishLatchPhases.push(target.dataset.discState);
    });
    window.__finishLatchObserver.observe(target, { attributes: true, attributeFilter: ["data-disc-state"] });
    document.querySelector('[aria-label="Elevar CD del equipo"]').addEventListener("pointerdown", (event) => { window.__finishLatchPointer = event.pointerId; });
  });
  const gestures = [];
  async function begin(fraction) {
    await expect(lift(page)).toBeEnabled();
    const bounds = await lift(page).boundingBox();
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height * .8;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect(latch(page)).toHaveAttribute("data-latch-dragging", "true");
    await page.mouse.move(x, y - bounds.height * fraction, { steps: 5 });
    const progress = Number(await latch(page).getAttribute("data-latch-progress"));
    gestures.push({ fraction, progress });
    return progress;
  }
  async function reset() {
    await expect(latch(page)).toHaveAttribute("data-latch-dragging", "false");
    await expect(latch(page)).toHaveAttribute("data-latch-progress", "0.000");
    await expect(lift(page)).toHaveAttribute("aria-pressed", "false");
    await expect(deck(page)).toHaveAttribute("data-disc-state", "docked");
  }
  const low = await begin(.1);
  expect(low).toBeGreaterThan(0); expect(low).toBeLessThan(.65);
  await page.mouse.up();
  await reset();
  for (const reason of ["pointercancel", "lostpointercapture", "focus", "resize", "Escape"]) {
    expect(await begin(.8)).toBeGreaterThanOrEqual(.65);
    if (reason === "pointercancel" || reason === "lostpointercapture") {
      // Only abnormal pointer-loss notification is synthetic. Pointerdown and
      // pointer movement use Chromium's native input and actual pointer capture.
      await lift(page).dispatchEvent(reason, { pointerId: await page.evaluate(() => window.__finishLatchPointer), pointerType: "mouse" });
    } else if (reason === "focus") await page.getByRole("button", { name: "Ir al capítulo Split", exact: true }).focus();
    else if (reason === "resize") await page.setViewportSize({ width: 1400, height: 900 });
    else await page.keyboard.press("Escape");
    await page.mouse.up();
    await reset();
    if (reason === "resize") await page.setViewportSize({ width: 1440, height: 900 });
  }
  expect((await page.evaluate(() => window.__finishLatchPhases)).filter((phase) => phase === "opening")).toHaveLength(0);
  // A genuine chapter navigation proves all cancelled owners released the rail.
  await go(page, "Split", 1);
  await go(page, "Deck", 0);
  expect(await begin(.8)).toBeGreaterThanOrEqual(.65);
  await page.mouse.up();
  await expect(deck(page)).toHaveAttribute("data-disc-state", "free");
  await expect(latch(page)).toHaveAttribute("data-latch-raised", "true");
  await expect(latch(page)).toHaveAttribute("data-latch-progress", "1.000");
  await expect(lift(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('canvas[data-historical-disc-canvas="true"]')).toHaveAttribute("data-three-painted-presentation", "free");
  const phases = await page.evaluate(() => window.__finishLatchPhases);
  expect(phases.filter((phase) => phase === "opening")).toHaveLength(1);
  await page.getByRole("button", { name: "Acoplar CD al equipo", exact: true }).click();
  await reset();
  for (const key of ["Enter", "Space"]) {
    await lift(page).focus();
    await page.keyboard.press(key);
    await expect(deck(page)).toHaveAttribute("data-disc-state", "free");
    await expect(page.getByRole("group", { name: "CD elevado", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await reset();
    await expect(lift(page)).toBeFocused();
  }
  const after = await canonicalState(page);
  expect(after.title).toBe(before.title);
  expect(after.playing).toBe(before.playing);
  expect(after.duration).toBe(before.duration);
  expect(after.elapsed).toBeGreaterThanOrEqual(before.elapsed);
  expect(requests.play).toHaveLength(0);
  const allPhases = await page.evaluate(() => { window.__finishLatchObserver.disconnect(); return window.__finishLatchPhases; });
  await saveRecord(testInfo, "front-latch-gestures", { before, after, gestures, phases: allPhases, playRequests: requests.play });
});
