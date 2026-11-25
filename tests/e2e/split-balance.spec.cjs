const {
  test, expect, hardware, canonicalState, observeRequests, saveRecord, go,
} = require("./support/prototype-harness.cjs");
const { openRail } = require("./support/b2-harness.cjs");
const { measureSplit } = require("./support/split-balance-harness.cjs");
const baseline = require("./fixtures/split-balance-baseline.json");

test.use({ viewport: { width: 1440, height: 900 }, launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });
const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1280, height: 720 }];
const screen = (page) => hardware(page).getByRole("group", { name: "Pantalla del equipo", exact: true });
const toggle = (page) => hardware(page).getByRole("button", { name: "Pausar/reanudar equipo", exact: true });
const knob = (page) => hardware(page).getByRole("slider", { name: "Volumen del equipo", exact: true });
const width = (box) => box.right - box.left;
const center = (box) => (box.top + box.bottom) / 2;

function inside(inner, outer, allowance = 1) {
  for (const edge of ["left", "top"]) expect(inner[edge]).toBeGreaterThanOrEqual(outer[edge] - allowance);
  for (const edge of ["right", "bottom"]) expect(inner[edge]).toBeLessThanOrEqual(outer[edge] + allowance);
}

async function hiddenFooter(page) {
  await expect(page.locator("[data-global-player]")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("[data-global-player]")).toBeHidden();
  expect(await page.locator("[data-global-player]").evaluate((node) => Boolean(node.closest("[inert]")))).toBe(true);
}

function unchangedDeck(current) {
  for (const edge of ["left", "right", "top", "bottom"]) expect(Math.abs(current.equipment[edge] - baseline.deck.equipment[edge])).toBeLessThan(1);
  for (const key of ["front", "glass", "target"]) for (const metric of ["x", "y", "width", "height"]) {
    expect(Math.abs(current[key][metric] - baseline.deck[key][metric])).toBeLessThan(1);
  }
  for (const metric of ["x", "y", "width", "height"]) expect(Math.abs(current.knob.rect[metric] - baseline.deck.knob.rect[metric])).toBeLessThan(1);
  for (const control of current.controls) {
    const previous = baseline.deck.controls.find((item) => item.label === control.label);
    for (const metric of ["x", "y", "width", "height"]) expect(Math.abs(control.rect[metric] - previous.rect[metric])).toBeLessThan(1);
  }
}

test("Split balance normal mock: equipment grows within the available width, both objects rise, original paper size and Deck stay intact at three sizes", async ({ page }, testInfo) => {
  await openRail(page);
  await expect(toggle(page)).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  await hardware(page).evaluate((node) => { window.__splitBalanceDeck = node; });
  const initialDeck = await measureSplit(page);
  unchangedDeck(initialDeck);
  await page.screenshot({ path: testInfo.outputPath("Deck-1440x900.png"), animations: "allow" });
  const records = [];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await go(page, "Split", 1);
    await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-pagination-state", "ready");
    await page.keyboard.press("Tab");
    await page.getByRole("region", { name: "Booklet de letras", exact: true }).focus();
    const current = await measureSplit(page), previous = baseline.split[`${viewport.width}x${viewport.height}`];
    const factor = width(current.equipment) / width(previous.equipment);
    const playerRise = center(previous.equipment) - center(current.equipment);
    const paperRise = previous.paper.top - current.paper.top;
    const name = `Split-${viewport.width}x${viewport.height}`;
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: "allow" });
    await saveRecord(testInfo, name, { current, previous, factor, playerRise, paperRise });
    records.push({ viewport, current, previous, factor, playerRise, paperRise });
    // The approved adaptive composition targets +10% on notebook widths and
    // up to +18% on 1440, bounded by the actual booklet and keyboard outline.
    expect(factor).toBeGreaterThanOrEqual(1.08);
    expect(factor).toBeLessThanOrEqual(1.20);
    expect(playerRise).toBeGreaterThanOrEqual(40);
    expect(playerRise).toBeLessThanOrEqual(125);
    expect(paperRise).toBeGreaterThanOrEqual(40);
    expect(paperRise).toBeLessThanOrEqual(125);
    for (const key of ["paper", "booklet"]) for (const metric of ["width", "height"]) expect(Math.abs(current[key][metric] - previous[key][metric])).toBeLessThan(1);
    expect(current.leaves).toHaveLength(2);
    for (const [index, leaf] of current.leaves.entries()) for (const metric of ["width", "height"]) expect(Math.abs(leaf[metric] - previous.leaves[index][metric])).toBeLessThan(1);
    inside(current.equipment, current.region);
    inside(current.physicalBooklet, current.region);
    expect(current.physicalBooklet.left - current.equipment.right).toBeGreaterThanOrEqual(14);
    const focusPadding = parseFloat(current.focus.outlineWidth) + parseFloat(current.focus.outlineOffset);
    expect(current.focus.active).toBe(true); expect(current.focus.visible).toBe(true);
    inside({ left: current.bookletFocus.left - focusPadding, right: current.bookletFocus.right + focusPadding,
      top: current.bookletFocus.top - focusPadding, bottom: current.bookletFocus.bottom + focusPadding }, current.region);
    inside(current.glass, current.front);
    for (const contents of [current.title, current.artist, current.times]) inside(contents, current.glass, 2);
    for (const control of current.controls) {
      inside(control.rect, current.front, 2);
      expect(control.hit).toBe(true);
      const old = previous.controls.find((item) => item.label === control.label);
      expect(control.rect.height / old.rect.height).toBeGreaterThanOrEqual(1.30);
      expect(control.rect.height / old.rect.height).toBeLessThanOrEqual(1.52);
    }
    inside(current.knob.rect, current.front, 2); expect(current.knob.hit).toBe(true);
    expect(current.scene).toEqual(previous.scene);
    expect(current.footer.rect.height).toBe(128);
    expect(current.region.bottom).toBe(current.footer.rect.top);
    await hiddenFooter(page);
    await expect(page.getByTestId("lyrics-pagination-controls")).toBeInViewport({ ratio: 1 });
    expect(await hardware(page).evaluate((node) => node === window.__splitBalanceDeck)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await go(page, "Deck", 0);
  const returnedDeck = await measureSplit(page);
  unchangedDeck(returnedDeck);
  await saveRecord(testInfo, "split-balance-three-sizes", { initialDeck, records, returnedDeck });
});

test("Split balance normal mock: physical transport and knob keep canonical playback through resize and Deck return with one persistent CD", async ({ page }, testInfo) => {
  const requests = observeRequests(page);
  await openRail(page);
  await expect(toggle(page)).toBeEnabled();
  await page.locator("[data-deck-disc-target]").evaluate((node) => { window.__splitBalanceDisc = node; });
  await hardware(page).evaluate((node) => { window.__splitBalancePlayer = node; });
  await go(page, "Split", 1);
  const initial = await canonicalState(page);
  expect(initial.title).toBe("Ventana de neón");
  await toggle(page).click();
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "false");
  await expect(screen(page).getByRole("status")).toHaveText("PAUSA");
  const paused = await canonicalState(page);
  await go(page, "Deck", 0); await go(page, "Split", 1);
  expect(await canonicalState(page)).toEqual(paused);
  await toggle(page).click();
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "true");
  const next = () => hardware(page).getByRole("button", { name: "Pista siguiente del equipo", exact: true });
  await next().click();
  await expect(screen(page).locator("strong")).toHaveText("Ascensor azul");
  await next().click();
  await expect(screen(page).locator("strong")).toHaveText("Mapa de azoteas");
  await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-status", "available");
  await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-pagination-state", "ready");
  const longTrack = await canonicalState(page);
  expect(longTrack.duration).toBe(321);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-pagination-state", "ready");
  expect((await canonicalState(page)).title).toBe(longTrack.title);
  expect((await canonicalState(page)).playing).toBe(true);
  await knob(page).focus();
  await page.keyboard.press("Home");
  for (let index = 0; index < 3; index++) await page.keyboard.press("PageUp");
  await expect(knob(page)).toHaveAttribute("aria-valuenow", "30");
  const bounds = await knob(page).boundingBox(), radius = Math.min(bounds.width, bounds.height) * .35;
  const point = (degrees) => ({ x: bounds.x + bounds.width / 2 + Math.cos(degrees * Math.PI / 180) * radius,
    y: bounds.y + bounds.height / 2 + Math.sin(degrees * Math.PI / 180) * radius });
  const start = point(-90);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  for (const angle of [-75, -60, -45, -30, -15, 0]) { const position = point(angle); await page.mouse.move(position.x, position.y); }
  const held = Number(await knob(page).getAttribute("aria-valuenow"));
  expect(held).toBeGreaterThan(30);
  await page.mouse.up();
  await expect(knob(page)).toHaveAttribute("aria-valuenow", String(held));
  const footerVolume = page.locator("[data-global-player]").getByRole("slider", { name: "Volumen del transporte", exact: true, includeHidden: true });
  await expect.poll(async () => Number(await footerVolume.inputValue()) * 100).toBeCloseTo(held, 0);
  await hardware(page).getByRole("button", { name: "Pista anterior del equipo", exact: true }).click();
  await expect(screen(page).locator("strong")).toHaveText("Ascensor azul");
  await expect(page.getByTestId("deck-now-playing-track")).toHaveText("Ascensor azul");
  await go(page, "Deck", 0);
  expect(await hardware(page).evaluate((node) => node === window.__splitBalancePlayer)).toBe(true);
  expect(await page.locator("[data-deck-disc-target]").evaluate((node) => node === window.__splitBalanceDisc)).toBe(true);
  expect(requests.play).toHaveLength(0);
  await saveRecord(testInfo, "split-canonical-controls", { initial, paused, longTrack, knobBounds: bounds, heldVolume: held, final: await canonicalState(page), playRequests: requests.play });
});
