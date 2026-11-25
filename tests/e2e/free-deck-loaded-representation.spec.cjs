const {
  test, expect, go, bootPrototype, collection, grid, title, canonicalState, observeRequests,
  observeArrival, expectOneArrival, saveRecord, expectActualWebGL, startRepresentationProbe,
  representationSnapshot, stopRepresentationProbe,
} = require("./support/historical-disc-harness.cjs");

const { findArtistEdition } = require("./support/b2-harness.cjs");

test.use({ viewport: { width: 1440, height: 900 }, launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });
const lift = (page) => page.getByRole("button", { name: "Elevar CD del equipo", exact: true });
const dock = (page) => page.getByRole("button", { name: "Acoplar CD al equipo", exact: true });

async function loadArtistCampo(page) {
  await go(page, "Colección", 3);
  const source = await findArtistEdition(page, "Vértice Magnético", "demo-vertice-album-0");
  await source.click();
  await page.getByTestId("album-detail-page").getByRole("button", { name: "Abrir caja", exact: true }).click();
  await expect(page.getByTestId("jewel-case-presentation")).toHaveAttribute("data-presentation", "open");
  await expect(page.getByTestId("jewel-case-presentation")).toHaveAttribute("data-album-id", "demo-vertice-album-0");
  await page.getByTestId("album-detail-page").getByRole("button", { name: "Reproducir Campo magnético", exact: true }).click();
}

async function loadCollectionNocturnal(page) {
  await go(page, "Colección", 3);
  await grid(page).locator('[data-collection-album-id="mock-album-02"]').click();
  const modal = page.getByTestId("album-detail-page");
  await modal.getByRole("button", { name: "Abrir caja", exact: true }).click();
  await expect(modal.getByTestId("jewel-case-presentation")).toHaveAttribute("data-presentation", "open");
  await modal.getByRole("button", { name: "GIRAR CD", exact: true }).click();
  const cd = modal.getByTestId("jewel-case-cd");
  await expect(cd).toHaveAttribute("data-flipped", "true");
  await expect.poll(() => cd.evaluate((node) => node.getAnimations({ subtree: true })
    .filter((animation) => animation.playState === "running" && animation.effect.getTiming().iterations !== Infinity).length)).toBe(0);
  await modal.getByRole("button", { name: "Reproducir Nocturnal FM", exact: true }).click();
}

for (const source of [
  { name: "Artist Campo magnetico", load: loadArtistCampo, track: "Órbita de papel", uri: "spotify:album:demo-vertice-album-0" },
  { name: "Collection Nocturnal FM reverse", load: loadCollectionNocturnal, track: "Antena del sur", uri: "spotify:album:mock-02" },
]) {
  test(`loaded CD single representation: ${source.name} hides every frozen paint surface in Three and restores it on dock or cancel`, async ({ page }, testInfo) => {
    const requests = observeRequests(page);
    await observeArrival(page);
    await bootPrototype(page, "deck-lift");
    await source.load(page);
    await expect(title(page)).toHaveText("CARGANDO");
    await expect(page.locator("[data-rail-overlay]")).toHaveAttribute("data-playback-phase", "confirmed");
    await expect(title(page)).toHaveText(source.track);
    await expect(page.getByTestId("rail-flying-disc")).toHaveCount(0);
    expect(requests.play).toHaveLength(1);
    expect(requests.play[0].uri).toBe(source.uri);
    await expect(page.locator("[data-rail-overlay]")).toHaveAttribute("data-confirmed-attempt", requests.play[0].attemptId);
    const arrivals = await expectOneArrival(page, requests.play[0].attemptId);
    const accepted = page.locator("[data-deck-inserted-disc]");
    await expect(accepted.locator("[data-physical-disc-rotor] > div > *")).toHaveCount(1);
    const clone = await accepted.locator("[data-physical-disc-rotor] > div > *").evaluate((node) => ({
      visibility: getComputedStyle(node).visibility, inlineVisibility: node.style.visibility,
      visibilityPriority: node.style.getPropertyPriority("visibility"), background: getComputedStyle(node).backgroundImage,
      width: node.clientWidth, height: node.clientHeight,
    }));
    await startRepresentationProbe(page);
    const initial = await representationSnapshot(page), before = await canonicalState(page);
    await lift(page).click();
    await expect(page.locator("[data-physical-deck]")).toHaveAttribute("data-disc-state", "free");
    const context = await expectActualWebGL(page);
    const free = await representationSnapshot(page);
    await page.screenshot({ path: testInfo.outputPath("loaded-free.png"), animations: "allow" });
    await dock(page).click();
    await expect(page.locator("[data-physical-deck]")).toHaveAttribute("data-disc-state", "docked");
    const redocked = await representationSnapshot(page);
    await page.screenshot({ path: testInfo.outputPath("loaded-after-dock.png"), animations: "allow" });
    await lift(page).click();
    await expect(page.locator("[data-physical-deck]")).toHaveAttribute("data-disc-state", "free");
    await expectActualWebGL(page);
    const secondFree = await representationSnapshot(page);
    await page.getByRole("group", { name: "CD elevado", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-physical-deck]")).toHaveAttribute("data-disc-state", "docked");
    await expect(lift(page)).toBeFocused();
    const cancelled = await representationSnapshot(page), after = await canonicalState(page);
    await page.screenshot({ path: testInfo.outputPath("loaded-after-cancel.png"), animations: "allow" });
    const probe = await stopRepresentationProbe(page);
    await saveRecord(testInfo, "loaded-representation-surfaces", { source: source.name, clone, context, initial, free, redocked, secondFree, cancelled, before, after, arrivals, playRequests: requests.play, probe });
    // All evidence, including restoration after acople, exists before the
    // regression assertion so the original failure remains reviewable.
    expect(free.visible).toEqual(["three"]);
    expect(secondFree.visible).toEqual(["three"]);
    expect(redocked.visible).toEqual(["css:inserted"]);
    expect(cancelled.visible).toEqual(["css:inserted"]);
    expect(probe.maxVisible).toBe(1);
    expect(probe.totalInvalidFreeSamples).toBe(0);
    expect(probe.maxTargets).toBe(1);
    expect(after.title).toBe(before.title);
    expect(after.playing).toBe(before.playing);
    expect(after.elapsed).toBeGreaterThanOrEqual(before.elapsed);
    expect(requests.play).toHaveLength(1);
  });
}
