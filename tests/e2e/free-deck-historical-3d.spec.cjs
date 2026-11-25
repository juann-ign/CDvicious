const {
  test, expect, bootPrototype, title, canonicalState, observeRequests, saveRecord,
  threeCanvas, meshPose, expectActualWebGL, sampleMesh, startRepresentationProbe, finishRepresentationProbe,
  beginHistoricalDrag, installReturnProbe, historicalReturn,
} = require("./support/historical-disc-harness.cjs");

// These main cases use real ANGLE/WebGL, the production DiscMesh/materials and
// the normal demo APIs. No functionalFixture, provider routes or fake poses.
test.use({ viewport: { width: 1440, height: 900 }, launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });
const lift = (page) => page.getByRole("button", { name: "Elevar CD del equipo", exact: true });
const dock = (page) => page.getByRole("button", { name: "Acoplar CD al equipo", exact: true });
const footer = (page) => page.locator("[data-global-player]");

async function liftWithWebGL(page) {
  await lift(page).click();
  await expect(page.locator("[data-physical-deck]")).toHaveAttribute("data-disc-state", "free");
  return expectActualWebGL(page);
}

test("historical Three normal: real poseGroup traverses X and Y and completes its original 11.43-second cycle with one visible CD", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  await bootPrototype(page, "deck-lift");
  await startRepresentationProbe(page);
  const before = await canonicalState(page);
  const context = await liftWithWebGL(page);
  const first = await meshPose(page);
  const samples = await sampleMesh(page, 12200);
  const rotations = samples.filter((sample) => sample.rotation?.length === 3 && sample.rotation.every(Number.isFinite));
  expect(rotations.length).toBeGreaterThan(10);
  const x = rotations.map((sample) => sample.rotation[0]), y = rotations.map((sample) => sample.rotation[1]);
  const xRange = Math.max(...x) - Math.min(...x), yRange = Math.max(...y) - Math.min(...y);
  expect(xRange).toBeGreaterThan(.4);
  expect(yRange).toBeGreaterThan(5.5);
  const elapsedDelta = samples.at(-1).elapsed - samples[0].elapsed;
  expect(elapsedDelta).toBeGreaterThan(16);
  const wallSeconds = (samples.at(-1).at - samples[0].at) / 1000;
  expect(Math.abs(elapsedDelta - wallSeconds * 1.4)).toBeLessThan(.5);
  expect(rotations.some((sample, index) => index > 0 && rotations[index - 1].rotation[1] - sample.rotation[1] > 5)).toBe(true);
  expect(new Set(samples.map((sample) => sample.groupUuid))).toEqual(new Set([first.groupUuid]));
  expect((await canonicalState(page)).title).toBe(before.title);
  expect((await canonicalState(page)).playing).toBe(true);
  await dock(page).click();
  await expect(page.locator("[data-physical-deck]")).toHaveAttribute("data-disc-state", "docked");
  expect(requests.play).toHaveLength(0);
  const representations = await finishRepresentationProbe(page);
  await saveRecord(testInfo, "historical-real-webgl-cycle", { context, before, first, samples, xRange, yRange, elapsedDelta, wallSeconds, representations });
});

test("historical Three normal: native canvas drag holds the pose clock, returns for 900ms and preserves canonical play and pause", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  await bootPrototype(page, "deck-lift");
  await liftWithWebGL(page);
  const playingBefore = await canonicalState(page);
  const groupUuid = (await meshPose(page)).groupUuid;
  await beginHistoricalDrag(page, 100);
  const held = await sampleMesh(page, 300);
  expect(held.every((sample) => sample.dragging)).toBe(true);
  expect(Math.max(...held.map((sample) => sample.elapsed)) - Math.min(...held.map((sample) => sample.elapsed))).toBeLessThan(1e-6);
  expect(Math.abs(held.at(-1).dragOffset - .8)).toBeLessThan(.02);
  expect((await canonicalState(page)).playing).toBe(true);
  await installReturnProbe(page);
  await page.mouse.up();
  const playingReturn = await historicalReturn(page);
  expect(playingReturn.nativeEvent).toBe(true);
  expect(playingReturn.sawReturning).toBe(true);
  const returnDuration = playingReturn.finishedAt - playingReturn.releasedAt;
  expect(returnDuration).toBeGreaterThanOrEqual(800);
  expect(returnDuration).toBeLessThan(1800);
  expect(Math.abs((await meshPose(page)).dragOffset)).toBeLessThan(1e-6);
  expect((await meshPose(page)).elapsed).toBeGreaterThan(held.at(-1).elapsed);
  expect((await canonicalState(page)).playing).toBe(true);
  expect((await canonicalState(page)).title).toBe(playingBefore.title);
  await footer(page).getByRole("button", { name: "Play/Pause", exact: true }).click();
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "false");
  const pausedSamples = await sampleMesh(page, 500);
  const pausedPose = pausedSamples.at(-1);
  expect(pausedSamples.every((sample) => Math.abs(sample.elapsed - pausedSamples[0].elapsed) < 1e-6)).toBe(true);
  await beginHistoricalDrag(page, -80);
  await installReturnProbe(page);
  await page.mouse.up();
  const pausedReturn = await historicalReturn(page);
  const afterPausedDrag = await meshPose(page);
  expect(Math.abs(afterPausedDrag.elapsed - pausedPose.elapsed)).toBeLessThan(1e-6);
  for (let axis = 0; axis < 3; axis++) expect(Math.abs(afterPausedDrag.rotation[axis] - pausedPose.rotation[axis])).toBeLessThan(1e-5);
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "false");
  await footer(page).getByRole("button", { name: "Play/Pause", exact: true }).click();
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "true");
  await expect.poll(async () => (await meshPose(page)).elapsed).toBeGreaterThan(afterPausedDrag.elapsed);
  expect((await meshPose(page)).groupUuid).toBe(groupUuid);
  expect(requests.play).toHaveLength(0);
  await saveRecord(testInfo, "historical-native-drag-and-return", { groupUuid, playingBefore, held, playingReturn, returnDuration, pausedSamples, pausedReturn, afterPausedDrag });
});

test("historical Three normal: losing keyboard-drag focus with Tab or a pointer releases the native gesture and resumes its clock", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  await bootPrototype(page, "deck-lift");
  await liftWithWebGL(page);
  const before = await canonicalState(page);
  const carrier = page.getByRole("group", { name: "CD elevado", exact: true });
  const completed = [];
  try {
    for (const focusChange of ["Tab", "pointer"]) {
      await carrier.focus();
      await page.keyboard.down("ArrowRight");
      await expect(threeCanvas(page)).toHaveAttribute("data-three-dragging", "true");
      const held = await sampleMesh(page, 200);
      expect(held.every((sample) => sample.dragging)).toBe(true);
      await installReturnProbe(page, "blur");
      if (focusChange === "Tab") await page.keyboard.press("Tab");
      else await title(page).click();
      await expect(carrier).not.toBeFocused();
      // The key is released on its new focus target, so the original carrier
      // must end its native gesture from blur rather than relying on keyup.
      await page.keyboard.up("ArrowRight");
      await expect(threeCanvas(page)).toHaveAttribute("data-three-dragging", "false");
      const returned = await historicalReturn(page);
      expect(returned.nativeEvent).toBe(true);
      expect(returned.sawReturning).toBe(true);
      expect(returned.finishedAt - returned.releasedAt).toBeGreaterThanOrEqual(800);
      expect(returned.finishedAt - returned.releasedAt).toBeLessThan(1800);
      await expect.poll(async () => (await meshPose(page)).elapsed).toBeGreaterThan(held.at(-1).elapsed);
      expect(Math.abs((await meshPose(page)).dragOffset)).toBeLessThan(1e-6);
      expect((await canonicalState(page)).playing).toBe(true);
      await expect(title(page)).toHaveText(before.title);
      completed.push({ focusChange, held, returned });
    }
    expect(requests.play).toHaveLength(0);
  } finally {
    const diagnostic = await page.evaluate(() => {
      cancelAnimationFrame(window.__historicalReturnFrame);
      return { returnProbe: window.__historicalReturnProbe,
        carrierDragging: document.querySelector("[data-deck-disc-target]")?.dataset.discDragging,
        focus: document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName };
    });
    await saveRecord(testInfo, "native-keyboard-focus-loss", { before, completed, diagnostic, currentPose: await meshPose(page), canonical: await canonicalState(page), playRequests: requests.play });
  }
});
