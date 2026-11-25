const { test, expect, go, physicalToggle, saveRecord } = require("./support/prototype-harness.cjs");
const { openRail } = require("./support/b2-harness.cjs");

test.use({ viewport: { width: 1920, height: 1080 }, launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });

const speakers = (page) => page.locator("[data-deck-speakers]");
const speaker = (page, side) => speakers(page).locator(`[data-speaker-side="${side}"]`);

function projectedGeometry() {
  const box = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
  const parts = [...document.querySelectorAll("[data-deck-surface]")].map((part) => part.getBoundingClientRect());
  return {
    left: box('[data-speaker-side="left"]'), right: box('[data-speaker-side="right"]'),
    deck: { left: Math.min(...parts.map(part => part.left)), right: Math.max(...parts.map(part => part.right)),
      top: Math.min(...parts.map(part => part.top)), bottom: Math.max(...parts.map(part => part.bottom)) },
    listing: box('[data-track-listing-placement] button'), next: box('[data-deck-next-discs] button'),
    width: window.innerWidth, footerTop: box("[data-global-player]").top,
  };
}

async function checkStereoFit(page) {
  const g = await page.evaluate(projectedGeometry);
  expect(g.left.width / g.left.height).toBeCloseTo(.48, 2);
  expect(g.right.height).toBeCloseTo(g.left.height, 1);
  expect(g.left.left).toBeGreaterThan(g.width * .10);
  expect(g.right.right).toBeLessThan(g.width * .90);
  expect(Math.abs(g.left.x + g.left.width / 2 + g.right.x + g.right.width / 2 - g.width)).toBeLessThan(2);
  expect(g.left.top).toBeGreaterThan(g.listing.bottom + 8);
  expect(g.right.top).toBeGreaterThan(g.next.bottom + 8);
  expect(g.deck.top).toBeGreaterThan(g.left.top + g.left.height * .4);
  expect(g.deck.bottom).toBeGreaterThan(g.left.bottom + 10);
  expect(g.deck.bottom).toBeLessThan(g.footerTop + 1);
  const leftOverlap = g.left.right - g.deck.left;
  const rightOverlap = g.deck.right - g.right.left;
  expect(leftOverlap).toBeGreaterThan(g.left.width * .30);
  expect(rightOverlap).toBeGreaterThan(g.right.width * .30);
  expect(leftOverlap).toBeLessThan(g.left.width * .6);
  expect(rightOverlap).toBeLessThan(g.right.width * .6);
  expect(g.left.bottom).toBeGreaterThan(g.deck.top + 12);
  expect((g.deck.right - g.deck.left) / g.width).toBeLessThan(.66);
  return g;
}

async function sampleCones(page, duration = 2200) {
  return speakers(page).evaluate((root, duration) => new Promise((resolve) => {
    const cones = [...root.querySelectorAll('[data-speaker-cone^="woofer"]')];
    const cabinets = [...root.querySelectorAll('[data-speaker-side]')];
    const caps = [...root.querySelectorAll('[data-speaker-dust-cap^="woofer"]')];
    const surrounds = cones.map(node => node.parentElement.getBoundingClientRect().toJSON());
    const tweeters = [...root.querySelectorAll('[data-speaker-cone="tweeter"]')];
    const samples = [];
    const started = performance.now();
    const tick = (now) => {
      samples.push({ cones: cones.map(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).a),
        at: now - started,
        centers: caps.map(node => node.getBoundingClientRect().width),
        fixedSurrounds: cones.every((node, index) => JSON.stringify(node.parentElement.getBoundingClientRect().toJSON()) === JSON.stringify(surrounds[index])),
        tweeters: tweeters.map(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).a),
        cabinets: cabinets.map(node => node.getBoundingClientRect().toJSON()) });
      if (now - started >= duration) resolve(samples);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), duration);
}

test("Deck stereo cabinets preserve the physical foreground; only the cones move with confirmed playback", async ({ page }, testInfo) => {
  await openRail(page);
  await go(page, "Deck", 0);
  await expect(speakers(page)).toHaveAttribute("data-speakers-visible", "true");
  await expect(speaker(page, "left")).toBeVisible();
  await expect(speaker(page, "right")).toBeVisible();
  await expect(speakers(page).locator('[data-speaker-cone^="woofer"]')).toHaveCount(4);
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "true");
  const full = await checkStereoFit(page);
  const playing = await sampleCones(page);
  expect(playing.length).toBeGreaterThan(10);
  for (let index = 0; index < 4; index++) {
    const values = playing.map(sample => sample.cones[index]);
    const centers = playing.map(sample => sample.centers[index]);
    // At normal volume the center displacement must actually be perceptible in
    // full-screen pixels, not just a technically non-zero CSS transform.
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(.045);
    expect(Math.max(...values)).toBeLessThan(1.15);
    expect(Math.min(...values)).toBeLessThan(.998);
    expect(Math.min(...values)).toBeGreaterThan(.96);
    expect(Math.max(...centers) - Math.min(...centers)).toBeGreaterThan(3);
  }
  expect(playing.every(sample => JSON.stringify(sample.cabinets) === JSON.stringify(playing[0].cabinets))).toBe(true);
  expect(playing.every(sample => sample.fixedSurrounds && sample.tweeters.every(scale => scale === 1))).toBe(true);
  expect(await speakers(page).locator('[data-speaker-side]').evaluateAll(nodes =>
    nodes.every(node => getComputedStyle(node, "::before").content === "none"))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("Deck-parlantes-1920x1080.png") });

  await physicalToggle(page).click();
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "false");
  await expect.poll(async () => speakers(page).locator('[data-speaker-cone^="woofer"]').evaluateAll(nodes =>
    nodes.every(node => Math.abs(new DOMMatrixReadOnly(getComputedStyle(node).transform).a - 1) < .0001))).toBe(true);
  const paused = await sampleCones(page, 300);
  expect(paused.every(sample => sample.cones.every(scale => Math.abs(scale - 1) < .0001) && sample.centers.every((width, index) => width === paused[0].centers[index]))).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => page.evaluate(projectedGeometry).then(g => g.width)).toBe(1440);
  await expect.poll(() => page.evaluate(projectedGeometry).then(g => g.left.height)).toBeLessThan(full.left.height);
  const compact = await checkStereoFit(page);
  await page.screenshot({ path: testInfo.outputPath("Deck-parlantes-pausa-1440x900.png") });

  await physicalToggle(page).click();
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "true");
  const resumed = await sampleCones(page, 1800);
  for (let index = 0; index < 4; index++) {
    expect(Math.max(...resumed.map(sample => sample.centers[index])) - Math.min(...resumed.map(sample => sample.centers[index]))).toBeGreaterThan(2);
  }
  await speakers(page).evaluate(root => { window.__persistentSpeakerPair = root; });
  await go(page, "Split", 1);
  await expect(speakers(page)).toHaveAttribute("data-speakers-visible", "true");
  await expect(speakers(page)).toHaveAttribute("data-speaker-motion", "playing");
  const split = await sampleCones(page, 1800);
  expect(Math.max(...split.map(sample => sample.cones[0])) - Math.min(...split.map(sample => sample.cones[0]))).toBeGreaterThan(.035);
  await go(page, "Deck", 0);
  expect(await speakers(page).evaluate(root => root === window.__persistentSpeakerPair)).toBe(true);
  await page.getByRole("button", { name: "Next listen", exact: true }).click();
  await expect(page.locator("[data-rail-overlay]")).toHaveAttribute("data-next-listen-motion", "false");
  await expect(speakers(page)).toHaveAttribute("data-speakers-visible", "true");
  await expect(speakers(page)).toHaveAttribute("data-speaker-motion", "playing");
  expect(await speakers(page).evaluate(root => root === window.__persistentSpeakerPair)).toBe(true);
  const listening = await sampleCones(page, 1800);
  expect(Math.max(...listening.map(sample => sample.cones[0])) - Math.min(...listening.map(sample => sample.cones[0]))).toBeGreaterThan(.035);
  await page.getByRole("button", { name: "Next listen", exact: true }).click();
  await expect(page.locator("[data-rail-overlay]")).toHaveAttribute("data-next-listen-motion", "false");
  await expect(speakers(page)).toHaveAttribute("data-speakers-visible", "true");
  await expect(speaker(page, "left")).toBeVisible();
  await saveRecord(testInfo, "stereo-layout-and-cone-motion", { full, compact, playing, paused, resumed });
});

async function stereoScene(page) {
  return page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null;
    const surfaces = [...document.querySelectorAll("[data-deck-surface]")].map(node => node.getBoundingClientRect());
    const hardware = { left: Math.min(...surfaces.map(b => b.left)), right: Math.max(...surfaces.map(b => b.right)),
      top: Math.min(...surfaces.map(b => b.top)), bottom: Math.max(...surfaces.map(b => b.bottom)) };
    return { left: rect('[data-speaker-side="left"]'), right: rect('[data-speaker-side="right"]'), hardware,
      booklet: rect('[data-testid="lyrics-booklet"]'), paper: rect('[data-testid="lyrics-paper"]'),
      disc: rect('[data-prototype-disc="true"]'), listing: rect('[data-track-listing-placement] button'),
      footer: rect('[data-global-player]'), header: rect('[data-shell-header]'), frame: rect('[data-rail-overlay]') };
  });
}

function noOverlap(a, b, gap = 0) {
  return !a || !b || a.right + gap <= b.left || b.right + gap <= a.left || a.bottom + gap <= b.top || b.bottom + gap <= a.top;
}

function assertStereoScene(scene, chapter, raised) {
  const { left, right, hardware, booklet, paper, disc, listing, frame } = scene;
  expect(left.height).toBeGreaterThan(60);
  expect(right.height).toBeCloseTo(left.height, 1);
  expect(left.left).toBeGreaterThanOrEqual(12);
  expect(right.right).toBeLessThanOrEqual(frame.right - 12);
  expect(left.top).toBeGreaterThanOrEqual(frame.top);
  expect(right.top).toBeGreaterThanOrEqual(frame.top);
  expect(left.bottom).toBeLessThanOrEqual(frame.bottom);
  expect(right.bottom).toBeLessThanOrEqual(frame.bottom);
  expect(left.right).toBeLessThan(hardware.left + (hardware.right - hardware.left) * .25);
  expect(right.left).toBeGreaterThan(hardware.right - (hardware.right - hardware.left) * .25);
  expect(left.right).toBeGreaterThan(hardware.left - 20);
  expect(right.left).toBeLessThan(hardware.right + 20);
  expect(noOverlap(left, listing, 4)).toBe(true);
  expect(noOverlap(right, listing, 4)).toBe(true);
  if (chapter === "split") {
    expect(Math.max(right.right, hardware.right)).toBeLessThan(Math.min(booklet.left, paper.left) - 8);
    expect(hardware.left).toBeGreaterThan(16);
  }
  if (raised) {
    expect(disc).not.toBeNull();
    expect(noOverlap(left, disc, 4)).toBe(true);
    expect(noOverlap(right, disc, 4)).toBe(true);
    expect(hardware.bottom).toBeLessThan(disc.top + 4);
  }
}

for (const size of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }]) {
  test(`stereo follows the same physical player through docked and elevated Deck/Split at ${size.width}x${size.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await openRail(page);
    await go(page, "Deck", 0);
    const rig = page.locator('[data-physical-deck]');
    const lift = page.getByRole("button", { name: "Elevar CD del equipo", exact: true });
    const dock = page.getByRole("button", { name: "Acoplar CD al equipo", exact: true });
    const records = [];
    await speakers(page).evaluate(root => { window.__persistentSpeakerPair = root; });
    async function capture(chapter, raised) {
      await expect(speakers(page)).toHaveAttribute("data-speakers-visible", "true");
      await expect(speakers(page)).toHaveAttribute("data-speaker-motion", "playing");
      await expect(rig).toHaveAttribute("data-disc-state", raised ? "free" : "docked");
      const scene = await stereoScene(page);
      assertStereoScene(scene, chapter, raised);
      expect(await speakers(page).evaluate(root => root === window.__persistentSpeakerPair)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${chapter}-${raised ? "elevado" : "acoplado"}-${size.width}x${size.height}.png`) });
      records.push({ chapter, raised, scene });
    }
    await capture("deck", false);
    await lift.click();
    await expect(rig).toHaveAttribute("data-disc-state", "free");
    await capture("deck", true);
    await go(page, "Split", 1);
    await expect(page.getByTestId("lyrics-booklet")).toHaveAttribute("data-pagination-state", "ready");
    await capture("split", true);
    await dock.click();
    await capture("split", false);
    await lift.click();
    await capture("split", true);
    await go(page, "Deck", 0);
    await capture("deck", true);
    await dock.click();
    await capture("deck", false);
    await saveRecord(testInfo, "stereo-poses", records);
  });
}
