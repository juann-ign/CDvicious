const { test, expect } = require("@playwright/test");

const RAIL_ENABLED = process.env.RAIL_FLAG === "1";
const NAV_LABEL = "Navegación por capítulos";
const CHAPTER_NAMES = ["Deck", "Split", "Batea", "Colección", "Mixtape Lab"];

const navigation = (page) =>
  page.getByRole("navigation", { name: NAV_LABEL });

const chapterButton = (page, name) =>
  page.getByRole("button", { name: `Ir al capítulo ${name}` });

const panels = (page) => page.locator("[data-rail-wrapper] > div > section");

async function openDesktop(page, width = 1280, height = 800) {
  await page.setViewportSize({ width, height });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  if (RAIL_ENABLED) {
    // HorizontalRail is loaded by a client-only dynamic import. CI can spend
    // several seconds hydrating the 3D scene before its navigation mounts.
    await expect(navigation(page)).toBeVisible({ timeout: 90_000 });
    await expect(panels(page)).toHaveCount(5, { timeout: 90_000 });
    await expect(page.locator('[data-rail-ready="true"]')).toBeVisible({ timeout: 90_000 });
  } else {
    await expect(page.locator("main")).toBeVisible();
  }
}

test("reduced-motion preference does not break direct chapter navigation", async ({
  page,
}) => {
  test.skip(!RAIL_ENABLED, "El rail no debe estar montado cuando el flag está apagado.");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDesktop(page);

  const fifth = chapterButton(page, "Mixtape Lab");
  await fifth.click();
  await expect(fifth).toHaveAttribute("aria-current", "location");
  await expect(panels(page).nth(4)).toHaveAttribute("data-chapter-active", "true");
});

test("feature flag and 761px breakpoint select the expected experience", async ({
  page,
}) => {
  await openDesktop(page);

  if (!RAIL_ENABLED) {
    await expect(navigation(page)).toHaveCount(0);
    await expect(page.locator("[data-rail-wrapper]")).toHaveCount(0);

    for (const width of [761, 760, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(page.locator("main")).toBeVisible();
      await expect(navigation(page)).toHaveCount(0);
    }
    return;
  }

  await expect(navigation(page)).toBeVisible({ timeout: 90_000 });
  await expect(page.locator("[data-rail-wrapper]")).toBeVisible();

  for (const width of [760, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(navigation(page)).toHaveCount(0);
    await expect(page.locator("[data-rail-wrapper]")).toHaveCount(0);
    await expect(page.locator("main")).toBeVisible();
  }

  for (const width of [761, 762, 900, 1366, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(navigation(page)).toBeVisible({ timeout: 90_000 });
    await expect(panels(page)).toHaveCount(5, { timeout: 90_000 });
  }
});

test("clicking each chapter updates navigation and active panel together", async ({
  page,
}) => {
  test.skip(!RAIL_ENABLED, "El rail no debe estar montado cuando el flag está apagado.");

  await openDesktop(page);
  const allPanels = panels(page);

  for (let index = 0; index < CHAPTER_NAMES.length; index += 1) {
    const button = chapterButton(page, CHAPTER_NAMES[index]);
    await button.click();
    await expect(button).toHaveAttribute("aria-current", "location");
    await expect(allPanels.nth(index)).toHaveAttribute(
      "data-chapter-active",
      "true",
    );
    await expect
      .poll(async () =>
        page.locator('[data-chapter-active="true"]').count(),
      )
      .toBe(1);

    const inactivePanels = await allPanels.evaluateAll((elements, activeIndex) =>
      elements.map((element, index) => ({
        index,
        active: element.getAttribute("data-chapter-active"),
        inert: element.hasAttribute("inert"),
      })).filter((element) => element.index !== activeIndex),
      index,
    );
    expect(inactivePanels.every((panel) => panel.active === "false" && panel.inert)).toBe(
      true,
    );
  }
});

test("keyboard focus remains visible and Enter activates the focused chapter", async ({
  page,
}) => {
  test.skip(!RAIL_ENABLED, "El rail no debe estar montado cuando el flag está apagado.");

  await openDesktop(page);
  await chapterButton(page, "Deck").focus();
  await page.keyboard.press("Tab");

  const split = chapterButton(page, "Split");
  await expect(split).toBeFocused();
  await expect
    .poll(() => split.evaluate((element) => getComputedStyle(element).outlineStyle))
    .not.toBe("none");

  await page.keyboard.press("Enter");
  await expect(split).toHaveAttribute("aria-current", "location");
  await expect(panels(page).nth(1)).toHaveAttribute("data-chapter-active", "true");
});

test("short wheel followed by long wheel reaches Split; reverse wheel returns to Deck", async ({
  page,
}) => {
  test.skip(!RAIL_ENABLED, "El rail no debe estar montado cuando el flag está apagado.");

  await openDesktop(page);
  const deck = chapterButton(page, "Deck");
  const split = chapterButton(page, "Split");
  const activeChapter = () =>
    page.locator("[data-rail-wrapper]").evaluate((element) =>
      element.parentElement?.getAttribute("data-chapter"),
    );

  await page.mouse.move(1200, 650);
  await page.mouse.wheel(0, 90);

  // Preserve the timing from the reported regression: another wheel gesture
  // arrives around the time the short movement's snap may still be running.
  await page.waitForTimeout(1_000);
  await expect.poll(activeChapter, { timeout: 8_000 }).toBe("0");
  await expect(deck).toHaveAttribute("aria-current", "location");

  await page.mouse.wheel(0, 700);
  await expect.poll(activeChapter, { timeout: 8_000 }).toBe("1");
  await expect(split).toHaveAttribute("aria-current", "location");
  await expect(panels(page).nth(1)).toHaveAttribute("data-chapter-active", "true");

  await page.mouse.wheel(0, -700);
  await expect.poll(activeChapter, { timeout: 8_000 }).toBe("0");
  await expect(deck).toHaveAttribute("aria-current", "location");
  await expect(panels(page).nth(0)).toHaveAttribute("data-chapter-active", "true");
});


test("long navigation visibly crosses every chapter and keeps the VFD unobstructed", async ({
  page,
}) => {
  test.skip(!RAIL_ENABLED, "El rail no debe estar montado cuando el flag está apagado.");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openDesktop(page);
  expect(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches))
    .toBe(false);
  const navBox = await navigation(page).boundingBox();
  const vfd = page.getByTestId("deck-now-playing");
  await expect(vfd).toBeVisible();
  const vfdBox = await vfd.boundingBox();
  expect(navBox).not.toBeNull();
  expect(vfdBox).not.toBeNull();
  expect(navBox.x).toBeGreaterThan(vfdBox.x + vfdBox.width + 8);

  // data-chapter is a discrete active-state signal; sample visual panel geometry instead.
  await page.evaluate(() => {
    window.__cdvRailMotionSamples = [];
    window.__cdvStopRailMotionSampler = false;
    const sample = () => {
      if (window.__cdvStopRailMotionSampler) return;
      const wrapper = document.querySelector("[data-rail-wrapper]");
      const content = wrapper?.firstElementChild;
      const chapters = content ? Array.from(content.children) : [];
      window.__cdvRailMotionSamples.push({
        at: performance.now(),
        lefts: chapters.map((chapter) => chapter.getBoundingClientRect().left),
      });
      window.requestAnimationFrame(sample);
    };
    sample();
  });

  const destination = chapterButton(page, "Mixtape Lab");
  await destination.click();
  await expect(destination).toHaveAttribute("aria-current", "location", {
    timeout: 12_000,
  });
  await expect
    .poll(
      () => panels(page).nth(4).evaluate((panel) => Math.abs(panel.getBoundingClientRect().left)),
      { timeout: 12_000 },
    )
    .toBeLessThan(2);

  await page.evaluate(() => {
    window.__cdvStopRailMotionSampler = true;
  });
  const samples = await page.evaluate(() => window.__cdvRailMotionSamples);
  expect(samples.length, "La navegación larga debe producir muestras durante varios frames").toBeGreaterThan(20);

  for (const index of [1, 2, 3]) {
    const positions = samples.map((sample) => sample.lefts[index]);
    expect(Math.max(...positions), `El capítulo ${index} debe entrar desde la derecha`).toBeGreaterThan(20);
    expect(
      Math.min(...positions),
      `El capítulo ${index} debe pasar hacia la izquierda antes de llegar a Mixtape Lab`,
    ).toBeLessThan(-20);
  }

  const viewportWidth = page.viewportSize().width;
  const frameSteps = samples.slice(1).map((sample, index) => ({
    delta: Math.abs(sample.lefts[1] - samples[index].lefts[1]),
    elapsed: sample.at - samples[index].at,
    from: samples[index].lefts[1],
    to: sample.lefts[1],
  }));

  // Geometry is sampled by requestAnimationFrame, but browser/CI scheduling can
  // pause RAF while screenshots, compositing, or WebGL work blocks the main
  // thread. Don't label a multi-frame gap as a single-frame discontinuity.
  // Still fail if a normal cadence frame jumps more than 45% of the viewport.
  const normalCadenceSteps = frameSteps.filter((step) => step.elapsed <= 1_000 / 30);
  expect(
    normalCadenceSteps.length,
    "Debe haber suficientes muestras a cadencia normal; mayor hueco: " +
      JSON.stringify(Math.max(...frameSteps.map((step) => step.elapsed))),
  ).toBeGreaterThan(10);

  const largestFrame = normalCadenceSteps.reduce(
    (largest, step) => step.delta > largest.delta ? step : largest,
    { delta: 0, elapsed: 0, from: 0, to: 0 },
  );
  expect(
    largestFrame.delta,
    "Salto de posición en un frame a cadencia normal: " + JSON.stringify(largestFrame),
  ).toBeLessThan(viewportWidth * 0.45);
});

test("Deck crossfade stays continuous and throttles WebGL during chapter handoffs", async ({
  page,
}) => {
  test.skip(!RAIL_ENABLED, "El rail no debe estar montado cuando el flag está apagado.");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openDesktop(page);
  expect(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches))
    .toBe(false);

  const layer = page.locator("[data-rail-overlay]");
  const discStage = layer.locator("[data-disc-render-enabled]");
  const canvas = layer.locator("[data-disc-frameloop]").first();
  const goAndSettle = async (name, index) => {
    await chapterButton(page, name).click();
    await expect(page.locator("html")).toHaveAttribute("data-chapter", String(index), {
      timeout: 12_000,
    });
    await expect(panels(page).nth(index)).toHaveAttribute("data-chapter-active", "true");
    await expect
      .poll(
        () => panels(page).nth(index).evaluate((panel) => Math.abs(panel.getBoundingClientRect().left)),
        { timeout: 12_000 },
      )
      .toBeLessThan(2);
  };
  const startSampler = async () => {
    await page.evaluate(() => {
      window.__cdvCrossfadeSamples = [];
      window.__cdvCrossfadeSamplerStopped = false;
      const sample = () => {
        if (window.__cdvCrossfadeSamplerStopped) return;
        const wrapper = document.querySelector("[data-rail-wrapper]");
        const railRoot = wrapper?.parentElement;
        const overlay = document.querySelector("[data-rail-overlay]");
        const disc = overlay?.querySelector("[data-disc-render-enabled]");
        const canvas = overlay?.querySelector("[data-disc-frameloop]");
        const booklet = overlay?.querySelector("[data-rail-booklet]");
        const collection = document.querySelector("[data-collection-transition-lite]");
        const opacity = overlay
          ? Number.parseFloat(getComputedStyle(overlay).opacity)
          : Number.NaN;
        window.__cdvCrossfadeSamples.push({
          moving: railRoot?.getAttribute("data-rail-moving") === "true",
          opacity,
          frameloop: canvas?.getAttribute("data-disc-frameloop") ?? null,
          quality: canvas?.getAttribute("data-disc-quality") ?? null,
          renderEnabled: disc?.getAttribute("data-disc-render-enabled") ?? null,
          hasTrack: disc?.getAttribute("data-has-track") ?? null,
          hasBooklet: Boolean(booklet),
          collectionLite: collection?.getAttribute("data-collection-transition-lite") ?? null,
        });
        window.requestAnimationFrame(sample);
      };
      sample();
    });
  };
  const resetSamples = async () => {
    await page.evaluate(() => {
      window.__cdvCrossfadeSamples = [];
    });
  };
  const expectToObserveMidFade = async () => {
    // The transition must be observed while the rail is moving, but requiring
    // every property in one rAF sample creates a false negative when React's
    // DOM mutations land between sampling ticks. Assert the sampled visual
    // midpoint and verify stable component attributes separately.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.__cdvCrossfadeSamples.some(
              (sample) =>
                sample.moving &&
                Number.isFinite(sample.opacity) &&
                sample.opacity > 0.05 &&
                sample.opacity < 0.95 &&
                sample.frameloop === "never" &&
                sample.quality === "transition" &&
                sample.renderEnabled === "true" &&
                sample.hasTrack === "true" &&
                sample.hasBooklet,
            ),
          ),
        { timeout: 10_000, intervals: [16, 30, 50] },
      )
      .toBe(true);
    await expect(discStage).toHaveAttribute("data-has-track", "true");
    await expect(discStage).toHaveAttribute("data-disc-render-enabled", "true");
    await expect(canvas).toHaveAttribute("data-disc-frameloop", "never");
    await expect(canvas).toHaveAttribute("data-disc-quality", "transition");
  };
  const expectDeckHidden = async () => {
    await expect(layer).toHaveAttribute("data-deck-hidden", "true", {
      timeout: 10_000,
    });
    await expect(discStage).toHaveAttribute("data-disc-render-enabled", "false");
    await expect(canvas).toHaveAttribute("data-disc-frameloop", "never");
  };

  await expect(discStage).toHaveAttribute("data-has-track", "true", { timeout: 15_000 });
  await expect(canvas).toHaveAttribute("data-disc-frameloop", "always", {
    timeout: 15_000,
  });
  expect(
    await layer.evaluate((element) => getComputedStyle(element).transitionDuration),
    "La opacidad del overlay debe depender del progreso de Lenis y no de una segunda transición CSS",
  ).toBe("0s");

  // Menu navigation: observe the moving midpoint before waiting for destination alignment.
  await goAndSettle("Split", 1);
  await startSampler();
  await chapterButton(page, "Batea").click();
  await expectToObserveMidFade();
  await expect
    .poll(
      () => panels(page).nth(2).evaluate((panel) => Math.abs(panel.getBoundingClientRect().left)),
      { timeout: 12_000 },
    )
    .toBeLessThan(2);
  await expectDeckHidden();
  await expect(page.locator('[data-batea-animation-enabled="true"]')).toHaveCount(1);

  // Collection uses lightweight card effects while crossing and restores them when settled.
  await resetSamples();
  await chapterButton(page, "Colección").click();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__cdvCrossfadeSamples.some(
            (sample) => sample.moving && sample.collectionLite === "true",
          ),
        ),
      { timeout: 5_000, intervals: [30, 50, 100] },
    )
    .toBe(true);
  await expect
    .poll(
      () => panels(page).nth(3).evaluate((panel) => Math.abs(panel.getBoundingClientRect().left)),
      { timeout: 12_000 },
    )
    .toBeLessThan(2);
  await expect(panels(page).nth(3).locator("[data-collection-transition-lite]"))
    .toHaveAttribute("data-collection-transition-lite", "false");

  // Returning to Split restores the Deck renderer and the same track snapshot.
  await goAndSettle("Split", 1);
  await expect(layer).toHaveAttribute("data-deck-hidden", "false", { timeout: 10_000 });
  await expect(discStage).toHaveAttribute("data-disc-render-enabled", "true");
  await expect(discStage).toHaveAttribute("data-has-track", "true");
  await expect(canvas).toHaveAttribute("data-disc-frameloop", "always");

  // Wheel/trackpad must share the same continuous fade and WebGL pause.
  await resetSamples();
  await page.mouse.move(400, 100);
  await page.mouse.wheel(0, 700);
  await expectToObserveMidFade();
  await expect
    .poll(
      () => panels(page).nth(2).evaluate((panel) => Math.abs(panel.getBoundingClientRect().left)),
      { timeout: 12_000 },
    )
    .toBeLessThan(2);
  await expectDeckHidden();

  await page.evaluate(() => {
    window.__cdvCrossfadeSamplerStopped = true;
  });
});

test("Batea marquee pauses during rail movement and resumes only when Batea settles", async ({
  page,
}) => {
  test.skip(!RAIL_ENABLED, "El rail no debe estar montado cuando el flag está apagado.");

  await openDesktop(page);

  const rail = page.locator('[data-rail-ready="true"]');
  const bateaMotion = page.locator('[data-batea-animation-enabled]');
  const beltMotion = page.locator('[data-belt-animation-enabled]');

  await expect(bateaMotion).toHaveAttribute("data-batea-animation-enabled", "false");
  if (await beltMotion.count()) {
    await expect(beltMotion).toHaveAttribute("data-belt-animation-enabled", "false");
    expect(await beltMotion.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("auto");
  }

  // A long jump must pass through Batea without running its decorative RAF loop.
  await chapterButton(page, "Mixtape Lab").click();
  await expect(rail).toHaveAttribute("data-rail-moving", "true", { timeout: 3_000 });
  await expect(bateaMotion).toHaveAttribute("data-batea-animation-enabled", "false");
  await expect(panels(page).nth(4)).toHaveAttribute("data-chapter-active", "true");
  await expect(rail).toHaveAttribute("data-rail-moving", "false", { timeout: 10_000 });
  await expect(bateaMotion).toHaveAttribute("data-batea-animation-enabled", "false");

  // On arriving at Batea the belt may run again only after Lenis has settled.
  await chapterButton(page, "Batea").click();
  await expect(rail).toHaveAttribute("data-rail-moving", "true", { timeout: 3_000 });
  await expect(bateaMotion).toHaveAttribute("data-batea-animation-enabled", "false");
  await expect(panels(page).nth(2)).toHaveAttribute("data-chapter-active", "true");
  await expect(rail).toHaveAttribute("data-rail-moving", "false", { timeout: 10_000 });
  await expect(bateaMotion).toHaveAttribute("data-batea-animation-enabled", "true");
  if (await beltMotion.count()) {
    await expect(beltMotion).toHaveAttribute("data-belt-animation-enabled", "true");
    expect(await beltMotion.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("auto");
  }

  // Leaving Batea via navigation disables the marquee during movement.
  await chapterButton(page, "Colección").click();
  await expect(rail).toHaveAttribute("data-rail-moving", "true", { timeout: 3_000 });
  await expect(bateaMotion).toHaveAttribute("data-batea-animation-enabled", "false");
  await expect(panels(page).nth(3)).toHaveAttribute("data-chapter-active", "true");
  await expect(rail).toHaveAttribute("data-rail-moving", "false", { timeout: 10_000 });
  await expect(bateaMotion).toHaveAttribute("data-batea-animation-enabled", "false");
  if (await beltMotion.count()) {
    await expect(beltMotion).toHaveAttribute("data-belt-animation-enabled", "false");
  }

  // Wheel/trackpad motion must apply the same pause when returning to Batea.
  await page.mouse.move(400, 100);
  await page.mouse.wheel(0, -700);
  await expect(rail).toHaveAttribute("data-rail-moving", "true", { timeout: 3_000 });
  await expect(bateaMotion).toHaveAttribute("data-batea-animation-enabled", "false");
  await expect(panels(page).nth(2)).toHaveAttribute("data-chapter-active", "true");
  await expect(rail).toHaveAttribute("data-rail-moving", "false", { timeout: 10_000 });
  await expect(bateaMotion).toHaveAttribute("data-batea-animation-enabled", "true");

  // And it must pause again for a wheel gesture leaving Batea.
  await page.mouse.wheel(0, 700);
  await expect(rail).toHaveAttribute("data-rail-moving", "true", { timeout: 3_000 });
  await expect(bateaMotion).toHaveAttribute("data-batea-animation-enabled", "false");
  await expect(panels(page).nth(3)).toHaveAttribute("data-chapter-active", "true");
  await expect(rail).toHaveAttribute("data-rail-moving", "false", { timeout: 10_000 });
  await expect(bateaMotion).toHaveAttribute("data-batea-animation-enabled", "false");
});

test("resizing and reloading at desktop resolutions keeps rail navigation usable", async ({
  page,
}) => {
  test.skip(!RAIL_ENABLED, "El rail no debe estar montado cuando el flag está apagado.");

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(navigation(page)).toBeVisible({ timeout: 90_000 });
    await expect(panels(page)).toHaveCount(5, { timeout: 90_000 });
    await expect(chapterButton(page, "Deck")).toHaveAttribute(
      "aria-current",
      "location",
    );

    await chapterButton(page, "Colección").click();
    await expect(chapterButton(page, "Colección")).toHaveAttribute(
      "aria-current",
      "location",
    );
    await expect(panels(page).nth(3)).toHaveAttribute(
      "data-chapter-active",
      "true",
    );
  }
});

