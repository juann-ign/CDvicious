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
    await expect(navigation(page)).toBeVisible();
    await expect(panels(page)).toHaveCount(5);
  } else {
    await expect(page.locator("main")).toBeVisible();
  }
}

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

  await expect(navigation(page)).toBeVisible();
  await expect(page.locator("[data-rail-wrapper]")).toBeVisible();

  for (const width of [760, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(navigation(page)).toHaveCount(0);
    await expect(page.locator("[data-rail-wrapper]")).toHaveCount(0);
    await expect(page.locator("main")).toBeVisible();
  }

  for (const width of [761, 762, 900, 1366, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(navigation(page)).toBeVisible();
    await expect(panels(page)).toHaveCount(5);
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

test("short wheel movement snaps back; long wheel movement advances and reverses one chapter", async ({
  page,
}) => {
  test.skip(!RAIL_ENABLED, "El rail no debe estar montado cuando el flag está apagado.");

  await openDesktop(page);
  const deck = chapterButton(page, "Deck");
  const split = chapterButton(page, "Split");
  const wrapper = page.locator("[data-rail-wrapper]");
  const horizontalScroll = () => wrapper.evaluate((element) => element.scrollLeft);

  await page.mouse.move(1200, 650);
  await page.mouse.wheel(0, 90);

  // Verify that the short gesture actually moves the rail, then wait for its
  // snap to return to Deck before starting the next independent gesture.
  await expect.poll(horizontalScroll, { timeout: 8_000 }).toBeGreaterThan(0);
  await expect.poll(horizontalScroll, { timeout: 8_000 }).toBe(0);
  await expect(deck).toHaveAttribute("aria-current", "location");

  await page.mouse.wheel(0, 700);
  await expect.poll(horizontalScroll, { timeout: 8_000 }).toBe(1280);
  await expect(split).toHaveAttribute("aria-current", "location");

  await page.mouse.wheel(0, -700);
  await expect.poll(horizontalScroll, { timeout: 8_000 }).toBe(0);
  await expect(deck).toHaveAttribute("aria-current", "location");
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
    await expect(navigation(page)).toBeVisible();
    await expect(panels(page)).toHaveCount(5);
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
