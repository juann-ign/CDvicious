const {
  test, expect, bootPrototype, canonicalState, observeRequests, saveRecord,
  expectActualWebGL, meshPose, startRepresentationProbe, finishRepresentationProbe, go,
} = require("./support/historical-disc-harness.cjs");

test.use({ viewport: { width: 1440, height: 900 }, launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });
const deck = (page) => page.locator("[data-physical-deck]");
const lift = (page) => page.getByRole("button", { name: "Elevar CD del equipo", exact: true });
const dock = (page) => page.getByRole("button", { name: "Acoplar CD al equipo", exact: true });
const latch = (page) => page.locator("[data-deck-dock-latch]");
const carrier = (page) => page.locator("[data-deck-disc-target]");

async function beginProbe(page) {
  await carrier(page).evaluate((node) => { window.__dockLatchOriginalDisc = node; });
  await page.evaluate(() => {
    const target = document.querySelector("[data-physical-deck]");
    window.__dockLatchPhases = [target.dataset.discState];
    window.__dockLatchObserver = new MutationObserver(() => {
      if (window.__dockLatchPhases.at(-1) !== target.dataset.discState) window.__dockLatchPhases.push(target.dataset.discState);
    });
    window.__dockLatchObserver.observe(target, { attributes: true, attributeFilter: ["data-disc-state"] });
  });
  await startRepresentationProbe(page);
}

async function phases(page) {
  return page.evaluate(() => window.__dockLatchPhases);
}

async function expectSameDisc(page) {
  await expect(carrier(page)).toHaveCount(1);
  expect(await carrier(page).evaluate((node) => node === window.__dockLatchOriginalDisc)).toBe(true);
}

async function elevate(page) {
  await expect(lift(page)).toBeEnabled();
  await lift(page).click();
  await expect(deck(page)).toHaveAttribute("data-disc-state", "free");
  await expectActualWebGL(page);
  await expectSameDisc(page);
  await expect(dock(page)).toBeEnabled();
  await expect(latch(page)).toHaveAttribute("data-latch-mode", "dock");
  await expect(latch(page)).toHaveAttribute("data-latch-raised", "false");
  await expect(page.getByText("Orientación visual · arrastrá el disco", { exact: true })).toHaveCount(0);
}

async function expectDocked(page) {
  await expect(deck(page)).toHaveAttribute("data-disc-state", "docked");
  await expectSameDisc(page);
  await expect(dock(page)).toHaveCount(0);
}

function samePlayback(before, after) {
  for (const key of ["title", "artist", "duration", "playing"]) expect(after[key]).toBe(before[key]);
  expect(after.elapsed).toBeGreaterThanOrEqual(before.elapsed);
}

test("dock latch normal mock: click, Enter and Space dock the same real Three CD once with no orientation label or playback order", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  await bootPrototype(page, "deck-lift");
  await beginProbe(page);
  const before = await canonicalState(page), cycles = [];
  for (const activation of ["click", "Enter", "Space"]) {
    if (activation === "Space") await page.setViewportSize({ width: 1280, height: 720 });
    await elevate(page);
    const start = (await phases(page)).length;
    const control = await dock(page).boundingBox();
    const region = await page.locator("[data-rail-overlay]").boundingBox();
    const footer = await page.locator("[data-global-player]").boundingBox();
    expect(control.width).toBeGreaterThan(0); expect(control.height).toBeGreaterThan(0);
    expect(control.y).toBeGreaterThanOrEqual(region.y);
    expect(control.y + control.height).toBeLessThanOrEqual(footer.y);
    await expect(dock(page)).toBeInViewport({ ratio: 1 });
    if (activation === "click") await page.screenshot({ path: testInfo.outputPath("dock-latch-free.png"), animations: "allow" });
    if (activation === "Space") await page.screenshot({ path: testInfo.outputPath("dock-latch-free-1280x720.png"), animations: "allow" });
    if (activation === "click") await dock(page).click();
    else { await dock(page).focus(); await page.keyboard.press(activation); }
    await expectDocked(page);
    const transitions = (await phases(page)).slice(start);
    expect(transitions.filter((phase) => phase === "aligning")).toHaveLength(1);
    expect(transitions.filter((phase) => phase === "closing")).toHaveLength(1);
    samePlayback(before, await canonicalState(page));
    cycles.push({ activation, viewport: page.viewportSize(), control, region, footer, transitions, playback: await canonicalState(page) });
  }
  await page.screenshot({ path: testInfo.outputPath("dock-latch-redocked.png"), animations: "allow" });
  expect(requests.play).toHaveLength(0);
  const representations = await finishRepresentationProbe(page);
  await saveRecord(testInfo, "dock-native-activation", { before, cycles, playRequests: requests.play, representations });
});

test("dock latch normal mock: downward drag commits once, pointer cancellation keeps inspection and Escape restores the dock without a retained rail lock", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  await bootPrototype(page, "deck-lift");
  await beginProbe(page);
  const before = await canonicalState(page);
  await elevate(page);
  const mesh = (await meshPose(page)).groupUuid, gestures = [];
  await dock(page).evaluate((node) => node.addEventListener("pointerdown", (event) => { window.__dockLatchPointer = event.pointerId; }));
  async function begin(fraction) {
    const bounds = await dock(page).boundingBox();
    const handle = await latch(page).locator('[class*="handle"]').boundingBox();
    const x = bounds.x + bounds.width / 2, y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect(latch(page)).toHaveAttribute("data-latch-dragging", "true");
    await page.mouse.move(x, y + bounds.height * fraction, { steps: 5 });
    const moved = await latch(page).locator('[class*="handle"]').boundingBox();
    const progress = Number(await latch(page).getAttribute("data-latch-progress"));
    expect(moved.y).toBeGreaterThan(handle.y);
    gestures.push({ fraction, progress, handleBefore: handle, handleDuring: moved });
    return progress;
  }
  async function stillFree() {
    await expect(deck(page)).toHaveAttribute("data-disc-state", "free");
    await expect(latch(page)).toHaveAttribute("data-latch-dragging", "false");
    await expect(latch(page)).toHaveAttribute("data-latch-progress", "0.000");
    await expect(latch(page)).toHaveAttribute("data-latch-raised", "false");
    await expect(dock(page)).toBeEnabled();
    await expectSameDisc(page);
    expect((await meshPose(page)).groupUuid).toBe(mesh);
    samePlayback(before, await canonicalState(page));
  }
  const low = await begin(.1);
  expect(low).toBeGreaterThan(0); expect(low).toBeLessThan(.65);
  await page.mouse.up();
  await stillFree();
  for (const reason of ["pointercancel", "lostpointercapture", "focus", "resize"]) {
    expect(await begin(.8)).toBeGreaterThanOrEqual(.65);
    if (reason === "pointercancel" || reason === "lostpointercapture") {
      // The abnormal loss signal is synthetic; initiation, movement and
      // release use real Chromium pointer input and the actual dock handle.
      await dock(page).dispatchEvent(reason, { pointerId: await page.evaluate(() => window.__dockLatchPointer), pointerType: "mouse" });
    } else if (reason === "focus") await page.getByRole("button", { name: "Ir al capítulo Split", exact: true }).focus();
    else await page.setViewportSize({ width: 1400, height: 900 });
    await page.mouse.up();
    await stillFree();
    if (reason === "resize") await page.setViewportSize({ width: 1440, height: 900 });
  }
  expect((await phases(page)).filter((phase) => phase === "aligning")).toHaveLength(0);
  // Escape retains the established free-disc dismissal, including while its
  // dock latch owns a pointer. Other lost gestures above cancel only the latch.
  expect(await begin(.8)).toBeGreaterThanOrEqual(.65);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expectDocked(page);
  samePlayback(before, await canonicalState(page));
  // Real chapter motion must remain possible after all cancellation paths.
  await go(page, "Split", 1);
  await expectDocked(page);
  await go(page, "Deck", 0);
  await elevate(page);
  const start = (await phases(page)).length;
  expect(await begin(.8)).toBeGreaterThanOrEqual(.65);
  await page.mouse.up();
  await expectDocked(page);
  const committed = (await phases(page)).slice(start);
  expect(committed.filter((phase) => phase === "aligning")).toHaveLength(1);
  expect(committed.filter((phase) => phase === "closing")).toHaveLength(1);
  samePlayback(before, await canonicalState(page));
  expect(requests.play).toHaveLength(0);
  const representations = await finishRepresentationProbe(page);
  await saveRecord(testInfo, "dock-native-drag-cancellation", { before, after: await canonicalState(page), gestures, committed, playRequests: requests.play, representations });
});
