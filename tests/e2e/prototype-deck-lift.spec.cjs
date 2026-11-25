const {
  test, expect, go, bootPrototype, hardware, collection, grid, title, physicalToggle,
  observeRequests, canonicalState, observeArrival, expectOneArrival, saveRecord,
  threeCanvas, meshPose, expectActualWebGL, sampleMesh, startRepresentationProbe, finishRepresentationProbe, beginHistoricalDrag,
} = require("./support/historical-disc-harness.cjs");

test.use({ viewport: { width: 1440, height: 900 }, launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });

const disc = (page) => page.locator("[data-deck-disc-target]");
const elevated = (page) => page.getByRole("group", { name: "CD elevado", exact: true });
const lift = (page) => page.getByRole("button", { name: "Elevar CD del equipo", exact: true });
const dock = (page) => page.getByRole("button", { name: "Acoplar CD al equipo", exact: true });
const footer = (page) => page.locator("[data-global-player]");

test("prototype gates: the normal app has neither lift controls nor the lateral tray", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-rail-ready="true"]')).toBeVisible({ timeout: 90000 });
  await expect(page.locator('button[aria-label="Elevar CD del equipo"]')).toHaveCount(0);
  await expect(page.locator('[data-prototype-disc="true"]')).toHaveCount(0);
  await go(page, "Colección", 3);
  await expect(grid(page)).toBeVisible();
  await expect(collection(page).locator("[data-batea-overlay]")).toHaveCount(0);
  await expect(collection(page).getByRole("button", { name: "Mostrar Batea en Colección", exact: true })).toHaveText("Batea (prototipo)");
});

async function rememberDisc(page) {
  await expect(disc(page)).toHaveCount(1);
  await disc(page).evaluate((node) => { window.__prototypeOriginalDisc = node; });
  await startRepresentationProbe(page);
}

async function expectSameDisc(page) {
  await expect(disc(page)).toHaveCount(1);
  expect(await disc(page).evaluate((node) => node === window.__prototypeOriginalDisc)).toBe(true);
}

async function expectDocked(page) {
  await expect(page.locator("[data-physical-deck]")).toHaveAttribute("data-disc-state", "docked");
  await expectSameDisc(page);
  await expect(page.locator('[data-prototype-disc="true"]')).toHaveCount(0);
  await expect(page.getByTestId("rail-flying-disc")).toHaveCount(0);
}

async function liftDisc(page) {
  await lift(page).click();
  await expect(page.locator("[data-physical-deck]")).toHaveAttribute("data-disc-state", "free");
  await expect(elevated(page)).toBeVisible();
  await expectActualWebGL(page);
  await expectSameDisc(page);
  await expect(footer(page)).toBeVisible();
  await expect.poll(() => footer(page).evaluate((node) => Number(getComputedStyle(node).opacity))).toBeGreaterThan(.95);
}

async function startDrag(page) {
  return beginHistoricalDrag(page, 64);
}

async function settleOrientation(page) {
  await expect(elevated(page)).toHaveAttribute("data-disc-dragging", "false");
  await expect(elevated(page)).toHaveAttribute("data-disc-returning", "false");
  await expect(threeCanvas(page)).toHaveAttribute("data-three-dragging", "false");
  await expect(threeCanvas(page)).toHaveAttribute("data-three-returning", "false");
}

async function poseRotation(page) {
  return (await meshPose(page)).rotation;
}

async function finishProbe(page, testInfo, name, extra = {}) {
  const probe = await finishRepresentationProbe(page);
  await saveRecord(testInfo, name, { ...extra, probe });
}

test("P1 normal: one persistent CD lifts, follows native drag and docks without playback orders or a progress reset", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  await bootPrototype(page, "deck-lift");
  await expect(lift(page)).toBeEnabled();
  await rememberDisc(page);
  const before = await canonicalState(page);
  expect(before.playing).toBe(true);
  await lift(page).dblclick();
  await expect(page.locator("[data-physical-deck]")).toHaveAttribute("data-disc-state", "free");
  await expectActualWebGL(page);
  await expectSameDisc(page);
  const neutral = await poseRotation(page);
  await startDrag(page);
  const heldPhase = (await meshPose(page)).elapsed;
  const heldSamples = await sampleMesh(page, 100);
  expect(heldSamples.every((sample) => sample.dragging && Math.abs(sample.elapsed - heldPhase) < 1e-6)).toBe(true);
  expect((await canonicalState(page)).playing).toBe(true);
  const rotated = await poseRotation(page);
  expect(Math.max(...rotated.map((angle, axis) => Math.abs(angle - neutral[axis])))).toBeGreaterThan(.25);
  await page.mouse.wheel(0, 80);
  await expect(page.locator("html")).toHaveAttribute("data-chapter", "0");
  await page.mouse.up();
  await settleOrientation(page);
  expect((await meshPose(page)).elapsed).toBeGreaterThan(heldPhase);
  await expectSameDisc(page);
  await dock(page).click();
  await expectDocked(page);
  const after = await canonicalState(page);
  expect(after.title).toBe(before.title);
  expect(after.artist).toBe(before.artist);
  expect(after.duration).toBe(before.duration);
  expect(after.playing).toBe(true);
  expect(after.elapsed).toBeGreaterThanOrEqual(before.elapsed);
  await expect.poll(async () => (await canonicalState(page)).elapsed).toBeGreaterThan(before.elapsed);
  expect(requests.play).toHaveLength(0);
  await finishProbe(page, testInfo, "playing-visual-cycle", { before, after, neutral, rotated, playRequests: requests.play });
});

test("P1 normal: paused track stays paused through keyboard inspection and Escape restores the same docked disc", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  await bootPrototype(page, "deck-lift");
  await physicalToggle(page).click();
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "false");
  await rememberDisc(page);
  const before = await canonicalState(page);
  await liftDisc(page);
  await elevated(page).focus();
  const neutral = await poseRotation(page);
  const pausedNativePhase = (await meshPose(page)).elapsed;
  await page.keyboard.down("ArrowRight");
  await expect.poll(() => poseRotation(page)).not.toEqual(neutral);
  const rotated = await poseRotation(page);
  await page.keyboard.up("ArrowRight");
  expect(rotated).not.toEqual(neutral);
  await expect(threeCanvas(page)).toHaveAttribute("data-three-dragging", "false");
  expect((await meshPose(page)).elapsed).toBe(pausedNativePhase);
  expect(await canonicalState(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await expectDocked(page);
  await expect(lift(page)).toBeFocused();
  expect(await canonicalState(page)).toEqual(before);
  expect(requests.play).toHaveLength(0);
  await finishProbe(page, testInfo, "paused-keyboard-escape", { before, after: await canonicalState(page), neutral, rotated });
});

test("P1 normal: pointer loss releases gestures, resize and same-album transport preserve the free disc, and navigation restores its dock", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  await bootPrototype(page, "deck-lift");
  await rememberDisc(page);
  const originalTitle = await title(page).textContent();
  expect(originalTitle).toBe("Ventana de neón");
  for (const event of ["pointercancel", "lostpointercapture"]) {
    await liftDisc(page);
    await startDrag(page);
    // Only the abnormal pointer-loss event is synthetic; the initiating
    // pointerdown and drag are native and the app receives no mock snapshot.
    await threeCanvas(page).dispatchEvent(event, { pointerId: 1, pointerType: "mouse" });
    await page.mouse.up();
    await settleOrientation(page);
    await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "true");
    await page.keyboard.press("Escape");
    await expectDocked(page);
  }
  await liftDisc(page);
  const originalFreeBox = await threeCanvas(page).boundingBox();
  const resizedGroupUuid = (await meshPose(page)).groupUuid;
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("[data-physical-deck]")).toHaveAttribute("data-disc-state", "free");
  await expectSameDisc(page);
  await expect.poll(async () => (await threeCanvas(page).boundingBox()).width).toBeLessThan(originalFreeBox.width - 20);
  const resized = await threeCanvas(page).boundingBox();
  expect((await meshPose(page)).groupUuid).toBe(resizedGroupUuid);
  const header = await page.locator("[data-shell-header]").boundingBox();
  const transport = await footer(page).boundingBox();
  expect(resized.x).toBeGreaterThanOrEqual(0);
  expect(resized.x + resized.width).toBeLessThanOrEqual(1280);
  expect(resized.y).toBeGreaterThanOrEqual(header.y + header.height);
  expect(resized.y + resized.height).toBeLessThanOrEqual(transport.y);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expectSameDisc(page);
  expect((await meshPose(page)).groupUuid).toBe(resizedGroupUuid);
  await startDrag(page);
  await page.evaluate(() => {
    window.__prototypeImmediateNavigation = [];
    const sample = () => {
      const left = document.querySelector("[data-rail-wrapper] > div > section").getBoundingClientRect().left;
      window.__prototypeImmediateNavigation.push({ at: performance.now(), left, state: document.querySelector("[data-physical-deck]")?.dataset.discState });
      window.__prototypeImmediateNavigationFrame = requestAnimationFrame(sample);
    };
    sample();
  });
  // Navigate immediately after pointerup; do not wait for the orientation's
  // historical 900ms return. Real chapter motion cancels the free pose first.
  await page.mouse.up();
  await go(page, "Split", 1);
  const immediateNavigation = await page.evaluate(() => {
    cancelAnimationFrame(window.__prototypeImmediateNavigationFrame);
    return window.__prototypeImmediateNavigation;
  });
  await saveRecord(testInfo, "immediate-real-navigation", immediateNavigation);
  expect(immediateNavigation.some((sample) => sample.left < -2)).toBe(true);
  expect(immediateNavigation.filter((sample) => sample.left < -2 && sample.state !== "docked")).toEqual([]);
  await expectDocked(page);
  await expect(title(page)).toHaveText(originalTitle);
  await go(page, "Deck", 0);
  await liftDisc(page);
  const transportGroupUuid = (await meshPose(page)).groupUuid;
  await footer(page).getByRole("button", { name: "Next", exact: true }).click();
  await expect(title(page)).toHaveText("Ascensor azul");
  await expect(page.locator("[data-physical-deck]")).toHaveAttribute("data-disc-state", "free");
  await expectSameDisc(page);
  expect((await meshPose(page)).groupUuid).toBe(transportGroupUuid);
  await footer(page).getByRole("button", { name: "Previous", exact: true }).click();
  await expect(title(page)).toHaveText(originalTitle);
  await expect(page.locator("[data-physical-deck]")).toHaveAttribute("data-disc-state", "free");
  expect((await meshPose(page)).groupUuid).toBe(transportGroupUuid);
  await elevated(page).focus();
  await page.keyboard.press("Escape");
  await expectDocked(page);
  await go(page, "Colección", 3);
  await expect(grid(page)).toBeVisible();
  expect(requests.play).toHaveLength(0);
  await finishProbe(page, testInfo, "gesture-and-context-cleanup", { originalTitle, finalTitle: await title(page).textContent(), originalFreeBox, resized });
});

test("P1 reduced-motion fixture: lift, orientation reset and docking complete immediately with the same canonical playback", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await bootPrototype(page, "deck-lift");
  await rememberDisc(page);
  const before = await canonicalState(page);
  await liftDisc(page);
  const reducedSamples = await sampleMesh(page, 300);
  expect(reducedSamples.every((sample) => Math.abs(sample.elapsed - reducedSamples[0].elapsed) < 1e-6)).toBe(true);
  await startDrag(page);
  expect(Math.abs((await meshPose(page)).dragOffset)).toBeGreaterThan(.25);
  await page.mouse.up();
  await settleOrientation(page);
  expect(Math.abs((await meshPose(page)).dragOffset)).toBeLessThan(1e-6);
  await dock(page).click();
  await expectDocked(page);
  const activeAnimations = await disc(page).evaluate((node) => node.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length);
  expect(activeAnimations).toBe(0);
  const after = await canonicalState(page);
  expect(after.title).toBe(before.title);
  expect(after.playing).toBe(before.playing);
  expect(after.elapsed).toBeGreaterThanOrEqual(before.elapsed);
  expect(requests.play).toHaveLength(0);
  await finishProbe(page, testInfo, "reduced-motion-visual-cycle", { before, after, activeAnimations });
});

test("P1 explicit pending-POST fixture: visual actions stay disabled through a real box handoff and its current confirmation", async ({ page }, testInfo) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/play", async (route) => { await gate; await route.continue(); });
  const requests = observeRequests(page);
  await observeArrival(page);
  await bootPrototype(page, "deck-lift");
  await expect(lift(page)).toBeEnabled();
  await rememberDisc(page);
  await go(page, "Colección", 3);
  await grid(page).getByRole("button", { name: "Satélite Sur — Nocturnal FM", exact: true }).click();
  const modal = page.getByTestId("album-detail-page");
  await modal.getByRole("button", { name: "Abrir caja", exact: true }).click();
  await expect(modal.getByTestId("jewel-case-presentation")).toHaveAttribute("data-presentation", "open");
  await modal.getByRole("button", { name: "Reproducir Nocturnal FM", exact: true }).click();
  try {
    await expect.poll(() => requests.play.length).toBe(1);
    await expect(title(page)).toHaveText("CARGANDO");
    await expect(page.locator('button[aria-label="Elevar CD del equipo"]')).toBeDisabled();
    await expect(page.locator('[data-prototype-disc="true"]')).toHaveCount(0);
  } finally { release(); }
  await expect(page.locator("[data-rail-overlay]")).toHaveAttribute("data-playback-phase", "confirmed");
  await expect(title(page)).toHaveText("Antena del sur");
  await expect(page.getByTestId("rail-flying-disc")).toHaveCount(0);
  await expectDocked(page);
  await expect(lift(page)).toBeEnabled();
  expect(requests.play).toHaveLength(1);
  await expect(page.locator("[data-rail-overlay]")).toHaveAttribute("data-confirmed-attempt", requests.play[0].attemptId);
  const arrivals = await expectOneArrival(page, requests.play[0].attemptId);
  // A source CD necessarily exists during a real handoff, so this case checks
  // target identity directly instead of applying the visual-only clone probe.
  await saveRecord(testInfo, "pending-handoff-blocks-visual-actions", { play: requests.play, arrivals });
});
