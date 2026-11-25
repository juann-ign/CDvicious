const fs = require("node:fs");
const path = require("node:path");
const { test, expect, functionalFixture, openRail, go, installMock } = require("./support/b2-harness.cjs");

const playerFront = (page) => page.locator('[data-hardware-front="player"]');
const navFront = (page) => page.locator('[data-hardware-front="navigation"]');
const display = (page) => page.getByTestId("deck-now-playing");

async function playerGeometry(page) {
  return page.evaluate(() => {
    const rect = (node) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    };
    const front = document.querySelector('[data-hardware-front="player"]');
    const vfd = front.querySelector('[data-testid="deck-now-playing"]');
    const controls = front.querySelector('[aria-label="Play/Pause"]').parentElement.parentElement;
    return {
      faceplate: rect(front.parentElement), front: rect(front), display: rect(vfd),
      title: rect(front.querySelector('[data-testid="deck-now-playing-track"]')),
      artist: rect(front.querySelector('[data-testid="deck-now-playing-artist"]')),
      controls: rect(controls),
      buttons: [...front.querySelectorAll("button")].map(rect),
      times: rect(front.querySelector('[class*="progressTimes"]')),
    };
  });
}

async function expectContainedFront(page) {
  await expect(playerFront(page)).toBeVisible();
  await expect(playerFront(page).getByRole("button", { name: "Play/Pause", exact: true })).toBeInViewport({ ratio: 1 });
  expect(await playerFront(page).evaluate((front) => {
    const outer = front.getBoundingClientRect();
    const children = [front.querySelector('[data-testid="deck-now-playing"]'), ...front.querySelectorAll("button, input")];
    return children.every((node) => {
      const inner = node.getBoundingClientRect();
      return inner.width > 0 && inner.height > 0 && inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
    });
  })).toBe(true);
  const buttons = await playerFront(page).locator("button").evaluateAll((nodes) => nodes.map((node) => ({
    fontSize: parseFloat(getComputedStyle(node).fontSize), radius: getComputedStyle(node).borderRadius,
  })));
  expect(buttons).toHaveLength(4);
  for (const button of buttons) { expect(button.fontSize).toBe(14); expect(button.radius).toBe("0px"); }
}

async function setMetadataState(page, state) {
  await page.evaluate((state) => {
    const next = structuredClone(window.__b2Original);
    if (state === "empty" || state === "error") { next.data = null; next.error = state === "error"; }
    else if (state !== "recovered") {
      next.data.isPlaying = false;
      next.data.track.name = state === "long" ? "Una canción con un título extraordinariamente largo / ".repeat(16) : "A";
      next.data.track.artists = [{ name: state === "long" ? "Un nombre de artista que necesita elipsis / ".repeat(16) : "B" }];
    }
    window.__b2Mock.restoreMockSnapshot(next);
  }, state);
  const title = page.getByTestId("deck-now-playing-track");
  if (state === "empty") await expect(title).toHaveText("INSERT DISC");
  else if (state === "error") await expect(title).toHaveText("ERR: SIN SEÑAL");
  else if (state === "long") await expect(title).toContainText("extraordinariamente largo");
  else if (state === "short") await expect(title).toHaveText("A");
  else await expect(title).toHaveText("Ventana de neón");
}

test.beforeEach(async ({ page }) => { await functionalFixture(page); });

test.afterEach(async ({ page }, testInfo) => {
  const directory = path.resolve(".qa/readability/shell-tests");
  fs.mkdirSync(directory, { recursive: true });
  const stem = testInfo.titlePath.slice(1).join("-").replace(/[^a-zA-Z0-9-]+/g, "-");
  const state = await playerGeometry(page).catch((error) => ({ error: error.message }));
  const record = { title: testInfo.title, status: testInfo.status, viewport: page.viewportSize(), state, fixture: "controlled metadata and WebGL functional fallback" };
  fs.writeFileSync(path.join(directory, `${stem}.json`), JSON.stringify(record, null, 2));
  await testInfo.attach("readability-shell", { body: JSON.stringify(record, null, 2), contentType: "application/json" });
});

for (const [width, height] of [[1280, 800], [1440, 900]]) {
  test.describe(`shell ${width}x${height}`, () => {
    test.use({ viewport: { width, height } });
    test("frentes comunes, controles de 14 px y VFD reservado en todos los capítulos y estados", async ({ page }) => {
      await openRail(page);
      await expectContainedFront(page);
      await expect(navFront(page)).toBeVisible();
      await expect(navFront(page).getByRole("button")).toHaveCount(5);
      const material = await page.evaluate(() => {
        const nav = document.querySelector('[data-hardware-front="navigation"]');
        const front = document.querySelector('[data-hardware-front="player"]');
        const navBox = nav.getBoundingClientRect();
        const silver = getComputedStyle(front.parentElement).backgroundImage;
        return {
          silver, headerSilver: getComputedStyle(nav.parentElement).backgroundImage,
          bezel: getComputedStyle(front).backgroundImage, navBezel: getComputedStyle(nav).backgroundImage,
          controls: [...nav.querySelectorAll("button")].map((button) => {
            const box = button.getBoundingClientRect();
            return { size: parseFloat(getComputedStyle(button).fontSize), radius: getComputedStyle(button).borderRadius, contained: box.left >= navBox.left - 1 && box.right <= navBox.right + 1 && box.top >= navBox.top - 1 && box.bottom <= navBox.bottom + 1 };
          }),
        };
      });
      expect(material.silver).not.toBe("none");
      expect(material.headerSilver).toBe(material.silver);
      expect(material.navBezel).toBe(material.bezel);
      for (const control of material.controls) { expect(control.size).toBe(14); expect(control.radius).toBe("0px"); expect(control.contained).toBe(true); }
      const initial = await playerGeometry(page);
      for (const [chapter, index] of [["Deck", 0], ["Split", 1], ["Batea", 2], ["Colección", 3], ["Mixtape Lab", 4]]) {
        await go(page, chapter, index);
        await expectContainedFront(page);
        const bounds = await page.evaluate(() => {
          const rail = document.querySelector("[data-rail-wrapper]").getBoundingClientRect();
          const header = document.querySelector("[data-shell-header]").getBoundingClientRect();
          const dock = document.querySelector("[data-global-player]").getBoundingClientRect();
          return { top: rail.top, bottom: rail.bottom, headerBottom: header.bottom, dockTop: dock.top, dockHeight: dock.height, dockBottom: dock.bottom };
        });
        expect(bounds.top).toBe(bounds.headerBottom);
        expect(bounds.bottom).toBe(bounds.dockTop);
        expect(bounds.dockHeight).toBe(128);
        expect(bounds.dockBottom).toBe(height);
        expect(await playerGeometry(page)).toEqual(initial);
      }
      await installMock(page);
      for (const state of ["short", "long", "empty", "error", "recovered"]) {
        await setMetadataState(page, state);
        await expectContainedFront(page);
        expect(await playerGeometry(page)).toEqual(initial);
        await expect(display(page).locator('[class*="progressTimes"]')).toBeVisible();
      }
      const textClipping = await page.getByTestId("deck-now-playing-track").evaluate((node) => ({ overflow: getComputedStyle(node).overflow, wrapping: getComputedStyle(node).whiteSpace, ellipsis: getComputedStyle(node).textOverflow }));
      expect(textClipping).toEqual({ overflow: "hidden", wrapping: "nowrap", ellipsis: "ellipsis" });
    });
  });
}

for (const [width, height] of [[390, 844], [760, 900]]) {
  test.describe(`fallback ${width}x${height}`, () => {
    test.use({ viewport: { width, height } });
    test("el frente físico conserva 128 px reservados y transportes visibles sin cambiar la pantalla inicial", async ({ page }) => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.locator("[data-player-faceplate]")).toHaveCount(1);
      await expect(page.locator("[data-rail-ready]")).toHaveCount(0);
      await expectContainedFront(page);
      const bounds = await page.locator("[data-player-faceplate]").evaluate((plate) => {
        const dock = plate.parentElement;
        const rect = dock.getBoundingClientRect();
        const stage = plate.closest("main");
        return { position: getComputedStyle(dock).position, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, reserved: parseFloat(getComputedStyle(stage).paddingBottom), stageBox: getComputedStyle(stage).boxSizing };
      });
      expect(bounds.position).toBe("fixed");
      expect(bounds.bottom).toBe(height);
      expect(bounds.width).toBe(width);
      expect(bounds.height).toBe(128);
      expect(bounds.top).toBe(height - 128);
      expect(bounds.reserved).toBeGreaterThanOrEqual(128);
      expect(bounds.stageBox).toBe("border-box");
    });
  });
}
