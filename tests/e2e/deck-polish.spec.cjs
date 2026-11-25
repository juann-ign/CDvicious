const { test, expect } = require("./support/qa-evidence.cjs");
const { openRail, go } = require("./support/b2-harness.cjs");

test.use({ launchOptions: { args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle"] } });

const hardware = (page) => page.getByRole("group", { name: /^Reproductor de CD/ });
const knob = (page) => hardware(page).getByRole("slider", { name: "Volumen del equipo", exact: true });
const footer = (page) => page.locator("[data-global-player]");
const footerValue = (page) => footer(page).getByRole("slider", { name: "Volumen del transporte", exact: true, includeHidden: true });
const readPercent = async (page) => Number(await knob(page).getAttribute("aria-valuenow"));
const cursor = (page) => knob(page).evaluate((node) => getComputedStyle(node).cursor);

async function ready(page) {
  await openRail(page);
  await expect(knob(page)).toHaveAttribute("aria-disabled", "false");
}

async function expectFooterHidden(page) {
  await expect(footer(page)).toHaveAttribute("aria-hidden", "true");
  expect(await footer(page).evaluate((node) => Boolean(node.closest("[inert]")))).toBe(true);
  await expect.poll(() => footer(page).evaluate((node) => {
    const style = getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  })).toBe(false);
  expect(await footerValue(page).evaluate((node) => { node.focus(); return document.activeElement === node; })).toBe(false);
}

// These are measurements from the approved B build, source 7e667bc, recorded
// in .qa/deck-controls-worktree/.qa/controls/after/Split-<viewport>.json.
// They intentionally constrain the visible silhouette, not transparent scene size.
const approvedSplit = {
  "1440x900": { left: 26.400007, right: 693.600037, top: 403.008331, bottom: 642.280640, paperLeft: 817.953369, paperTop: 377.020355, paperWidth: 580.970215, paperHeight: 368.007111 },
  "1280x800": { left: 24.800005, right: 615.200012, top: 336.245361, bottom: 547.975525, paperLeft: 668.992554, paperTop: 312.018677, paperWidth: 574.552002, paperHeight: 337.926270 },
  "1280x720": { left: 24.800005, right: 615.200012, top: 260.245361, bottom: 471.975494, paperLeft: 668.992554, paperTop: 236.018661, paperWidth: 574.552002, paperHeight: 337.926270 },
};

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1280, height: 720 }]) {
  test.describe(`polish ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    test("Deck leaves breathing room while Split retains its approved composition and hidden footer", async ({ page }, testInfo) => {
      await ready(page);
      const measure = () => hardware(page).evaluate((deck) => {
        const faces = [...deck.querySelectorAll("[data-deck-surface]")].map((node) => node.getBoundingClientRect());
        return { left: Math.min(...faces.map((box) => box.left)), right: Math.max(...faces.map((box) => box.right)),
          top: Math.min(...faces.map((box) => box.top)), bottom: Math.max(...faces.map((box) => box.bottom)),
          sceneWidth: deck.querySelector("[data-deck-design-frame]").clientWidth };
      });
      const deck = await measure();
      expect(deck.right - deck.left).toBeGreaterThanOrEqual(viewport.width * 0.65);
      expect(deck.right - deck.left).toBeLessThanOrEqual(viewport.width * 0.85);
      await expectFooterHidden(page);
      await hardware(page).evaluate((node) => { window.__approvedPersistentDeck = node; });
      await go(page, "Split", 1);
      await expectFooterHidden(page);
      expect(await hardware(page).evaluate((node) => node === window.__approvedPersistentDeck)).toBe(true);
      const split = await measure();
      expect(split.sceneWidth).toBe(deck.sceneWidth);
      const approved = approvedSplit[`${viewport.width}x${viewport.height}`];
      for (const edge of ["left", "right", "top", "bottom"]) expect(Math.abs(split[edge] - approved[edge])).toBeLessThan(2);
      const paper = await page.getByTestId("lyrics-booklet").boundingBox();
      expect(Math.abs(paper.x - approved.paperLeft)).toBeLessThan(2);
      expect(Math.abs(paper.y - approved.paperTop)).toBeLessThan(2);
      expect(Math.abs(paper.width - approved.paperWidth)).toBeLessThan(2);
      expect(Math.abs(paper.height - approved.paperHeight)).toBeLessThan(2);
      await expect(page.getByTestId("lyrics-pagination-controls")).toBeInViewport({ ratio: 1 });
      for (const text of ["CDV / LINEAR COMPACT DISC", "PRECISION / DUAL SLIDE", "LEVEL", "CDV–01 / COMPACT DISC"]) {
        await expect(hardware(page).getByText(text, { exact: true })).not.toBeVisible();
      }
      await go(page, "Deck", 0);
      const returned = await measure();
      expect(returned).toEqual(deck);
      await testInfo.attach("polished-visible-composition", { body: JSON.stringify({ viewport, deck, split, approved }, null, 2), contentType: "application/json" });
    });
  });
}

test("polish: repeated circular grabs update continuously, keep cursor ownership and preserve canonical value on release", async ({ page }, testInfo) => {
  await ready(page);
  await expect(hardware(page).getByText(/^0%?$/, { exact: true }).first()).toBeVisible();
  await expect(hardware(page).getByText(/^100%?$/, { exact: true }).first()).toBeVisible();
  await expect.poll(() => cursor(page)).toBe("grab");
  await knob(page).focus();
  await page.keyboard.press("Home");
  await expect(knob(page)).toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("End");
  await expect(knob(page)).toHaveAttribute("aria-valuenow", "100");
  await page.keyboard.press("Home");
  for (let index = 1; index <= 3; index++) {
    await page.keyboard.press("PageUp");
    await expect(knob(page)).toHaveAttribute("aria-valuenow", String(index * 10));
  }
  const gestures = [];
  for (const clockwise of [true, false, true]) {
    const box = await knob(page).boundingBox();
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const radius = Math.min(box.width, box.height) * 0.35;
    const angles = clockwise ? [-90, -75, -60, -45, -30, -15, 0] : [0, -15, -30, -45, -60, -75, -90];
    const point = (degrees) => ({ x: center.x + Math.cos(degrees * Math.PI / 180) * radius, y: center.y + Math.sin(degrees * Math.PI / 180) * radius });
    const start = point(angles[0]);
    const before = await readPercent(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await expect.poll(() => cursor(page)).toBe("grabbing");
    await expect(knob(page)).toHaveAttribute("aria-valuenow", String(before));
    let prior = before;
    const samples = [];
    for (const angle of angles.slice(1)) {
      const destination = point(angle);
      await page.mouse.move(destination.x, destination.y);
      if (clockwise) await expect.poll(() => readPercent(page)).toBeGreaterThan(prior);
      else await expect.poll(() => readPercent(page)).toBeLessThan(prior);
      prior = await readPercent(page);
      samples.push({ angle, value: prior, cursor: await cursor(page) });
      expect(samples.at(-1).cursor).toBe("grabbing");
    }
    await page.mouse.wheel(0, 70);
    await expect(page.locator("html")).toHaveAttribute("data-chapter", "0");
    await page.mouse.up();
    await expect.poll(() => cursor(page)).toBe("grab");
    await expect(knob(page)).toHaveAttribute("aria-valuenow", String(prior));
    await expect.poll(async () => Math.round(Number(await footerValue(page).inputValue()) * 100)).toBe(prior);
    expect(await page.evaluate(() => getComputedStyle(document.body).cursor)).not.toBe("grabbing");
    gestures.push({ clockwise, before, samples, released: prior });
  }
  const last = await readPercent(page);
  await go(page, "Colección", 3);
  await expect(footer(page)).toBeVisible();
  await expect.poll(async () => Math.round(Number(await footerValue(page).inputValue()) * 100)).toBe(last);
  await go(page, "Split", 1);
  await expect(knob(page)).toHaveAttribute("aria-valuenow", String(last));
  await expectFooterHidden(page);
  await testInfo.attach("continuous-angular-grabs", { body: JSON.stringify(gestures, null, 2), contentType: "application/json" });
});

test("polish: footer is actionable only in secondary chapters and preserves transport after returning to the physical front", async ({ page }) => {
  await ready(page);
  await expectFooterHidden(page);
  for (const [chapter, index] of [["Batea", 2], ["Colección", 3], ["Mixtape Lab", 4]]) {
    await go(page, chapter, index);
    await expect(footer(page)).toBeVisible();
    expect(await footer(page).evaluate((node) => Boolean(node.closest("[inert]")))).toBe(false);
    await expect(footer(page).getByRole("button", { name: "Play/Pause", exact: true })).toBeInViewport({ ratio: 1 });
  }
  await footer(page).getByRole("button", { name: "Play/Pause", exact: true }).click();
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "false");
  await go(page, "Deck", 0);
  await expect(hardware(page).getByRole("button", { name: "Pausar/reanudar equipo", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expectFooterHidden(page);
  await hardware(page).getByRole("button", { name: "Pausar/reanudar equipo", exact: true }).click();
  await go(page, "Colección", 3);
  await expect(page.getByTestId("deck-now-playing")).toHaveAttribute("data-is-playing", "true");
});
