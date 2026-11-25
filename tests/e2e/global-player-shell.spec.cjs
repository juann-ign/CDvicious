const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const { findArtistEdition } = require("./support/b2-harness.cjs");

const sizes = [[1280, 800], [1440, 900], [1920, 1080], [1280, 600]];
const chapters = ["Deck", "Split", "Batea", "Colección", "Mixtape Lab"];
const panels = (page) => page.locator("[data-rail-wrapper] > div > section");
const player = (page) => page.locator("[data-global-player]");
const display = (page) => page.getByTestId("deck-now-playing");

async function go(page, index) {
  await page.getByRole("button", { name: `Ir al capítulo ${chapters[index]}` }).click();
  await expect.poll(() => panels(page).nth(index).evaluate((node) => Math.abs(node.getBoundingClientRect().left)), { timeout: 15000 }).toBeLessThan(2);
  await expect(panels(page).nth(index)).toHaveAttribute("data-chapter-active", "true");
}

async function geometry(page) {
  return page.evaluate(() => {
    const rect = (selector, transport = false) => {
      const node = document.querySelector(selector);
      const { x, y, width, height } = (transport ? node.parentElement.parentElement : node).getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      player: rect("[data-global-player]"), display: rect('[data-testid="deck-now-playing"]'),
      transport: rect('[data-global-player] [aria-label="Play/Pause"]', true),
      title: rect('[data-testid="deck-now-playing-track"]'),
      artist: rect('[data-testid="deck-now-playing-artist"]'),
    };
  });
}

async function assertShell(page, width, height) {
  await expect(display(page)).toHaveCount(1);
  await expect(player(page)).toBeVisible();
  await expect(player(page).getByRole("button", { name: "Play/Pause" })).toBeInViewport({ ratio: 1 });
  const boxes = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect().toJSON();
    return { header: rect("[data-shell-header]"), rail: rect("[data-rail-wrapper]"), footer: rect("[data-global-player]") };
  });
  expect(boxes.header.y).toBe(0);
  expect(boxes.rail.top).toBe(boxes.header.bottom);
  expect(boxes.rail.bottom).toBe(boxes.footer.top);
  expect(boxes.footer.bottom).toBe(height);
  expect(boxes.footer.width).toBe(width);
  expect(await player(page).evaluate((node) => {
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (getComputedStyle(parent).transform !== "none") return false;
    }
    const button = node.querySelector('[aria-label="Play/Pause"]');
    const r = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  })).toBe(true);
}

// Access the existing mock store through the bundle runtime, without introducing
// a production testing API, another subscription, or another playback owner.
async function installMockFixture(page) {
  await page.evaluate(() => {
    window.webpackChunk_N_E.push([[`shell-fixture-${Date.now()}`], {}, (runtime) => {
      const candidates = Object.keys(runtime.m).filter((id) => runtime.m[id].toString().includes("restoreMockSnapshot"));
      window.__shellMock = candidates.map((id) => runtime(id)).find((module) =>
        typeof module.getSnapshot === "function" && typeof module.restoreMockSnapshot === "function");
      if (!window.__shellMock) throw new Error("Existing mock store not found");
      window.__shellOriginal = window.__shellMock.getSnapshot();
    }]);
  });
}

test.beforeEach(async ({ page }) => {
  test.skip(process.env.RAIL_FLAG !== "1", "Requires desktop rail and the local Spotify mock");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-rail-ready="true"]')).toBeVisible({ timeout: 90000 });
  await expect(player(page).getByRole("button", { name: "Play/Pause" })).toBeVisible();
});

for (const [width, height] of sizes) {
  test.describe(`${width}x${height}`, () => {
    test.use({ viewport: { width, height } });
    test("marco común, capítulos, discografía y geometría estable en todos los estados", async ({ page }, testInfo) => {
      const prefix = `${width}x${height}`;
      const initial = await geometry(page);
      for (const index of [0, 1, 3, 2, 4]) {
        await go(page, index);
        await assertShell(page, width, height);
        expect(await geometry(page)).toEqual(initial);
        if (index === 3) {
          const collection = panels(page).nth(3);
          await expect(collection.getByRole("button", { name: /— Neon Rooms$/ })).toBeVisible();
          await expect(page.getByRole("combobox", { name: "Buscar discos o artistas" })).toBeInViewport({ ratio: 1 });
          await expect(collection.getByRole("button", { name: "Siguiente", exact: true })).toBeInViewport({ ratio: 1 });
          expect(await collection.locator('[class*="gridFrame"]').evaluate((node) => {
            const frame = node.getBoundingClientRect();
            return [...node.querySelectorAll("button")].every((card) => {
              const r = card.getBoundingClientRect();
              return r.top >= frame.top && r.bottom <= frame.bottom;
            });
          })).toBe(true);
        }
        await page.screenshot({ path: testInfo.outputPath(`${prefix}-${index}-${chapters[index]}.png`) });
      }

      // Transport remains live while the Deck itself is hidden/inert.
      const toggle = player(page).getByRole("button", { name: "Play/Pause" });
      await toggle.click();
      await expect(display(page)).toHaveAttribute("data-is-playing", "false");
      expect(await geometry(page)).toEqual(initial);
      await toggle.click();
      await expect(display(page)).toHaveAttribute("data-is-playing", "true");
      await player(page).getByRole("button", { name: "Next", exact: true }).click();
      await expect(page.getByTestId("deck-now-playing-track")).toHaveText("Ascensor azul");
      await player(page).getByRole("button", { name: "Previous", exact: true }).click();
      await expect(page.getByTestId("deck-now-playing-track")).toHaveText("Ventana de neón");

      await installMockFixture(page);
      for (const state of ["short", "long", "empty", "error", "recovered"]) {
        await page.evaluate((state) => {
          const original = window.__shellOriginal;
          const next = structuredClone(original);
          if (state === "empty" || state === "error") {
            next.data = null; next.error = state === "error";
          } else if (state !== "recovered") {
            next.data.isPlaying = false;
            next.data.track.name = state === "short" ? "A" : "Una canción con un título extraordinariamente largo / ".repeat(12);
            next.data.track.artists = [{ name: state === "short" ? "B" : "Un nombre de artista muy extenso / ".repeat(12) }];
          }
          window.__shellMock.restoreMockSnapshot(next);
        }, state);
        const title = page.getByTestId("deck-now-playing-track");
        if (state === "empty") await expect(title).toHaveText("INSERT DISC");
        else if (state === "error") await expect(title).toHaveText("ERR: SIN SEÑAL");
        else if (state === "short") await expect(title).toHaveText("A");
        else if (state === "long") await expect(title).toContainText("extraordinariamente largo");
        else await expect(title).toHaveText("Ventana de neón");
        await assertShell(page, width, height);
        expect(await geometry(page)).toEqual(initial);
        await page.screenshot({ path: testInfo.outputPath(`${prefix}-state-${state}.png`) });
      }

      await go(page, 3);
      const selected = await findArtistEdition(page, "Vértice Magnético", "demo-vertice-album-0");
      const discography = page.getByTestId("artist-discography");
      await assertShell(page, width, height);
      const scene = await discography.locator("[data-shelf-viewport]").boundingBox();
      const jewelcase = await selected.boundingBox();
      expect(jewelcase.y).toBeGreaterThanOrEqual(scene.y - 1);
      expect(jewelcase.y + jewelcase.height).toBeLessThanOrEqual(scene.y + scene.height + 1);
      await page.screenshot({ path: testInfo.outputPath(`${prefix}-discography.png`), animations: "disabled" });
      const albumId = await selected.getAttribute("data-batea-album-id");
      await selected.click();
      const detail = page.getByTestId("album-detail-page");
      await expect(detail).toHaveAttribute("data-album-id", albumId);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator("[data-rail-ready]")).toHaveAttribute("data-album-detail-open", "true");
      await expect(page.locator("[data-rail-wrapper]")).toHaveAttribute("inert", "");
      const bounds = await detail.boundingBox();
      expect(bounds.y).toBeGreaterThanOrEqual(72);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(height - 128);
      await assertShell(page, width, height);
      expect(await geometry(page)).toEqual(initial);
      await expect(detail).toBeVisible();
      await expect(detail.getByTestId("jewel-case-presentation")).toHaveAttribute("data-presentation", "closed");
      const play = detail.getByRole("button", { name: /^Reproducir / });
      const openCase = detail.getByRole("button", { name: "Abrir caja", exact: true });
      await openCase.scrollIntoViewIfNeeded();
      await expect(play).toBeInViewport({ ratio: 1 });
      await openCase.click();
      await expect(detail.getByTestId("jewel-case-presentation")).toHaveAttribute("data-presentation", "open");
      await page.screenshot({ path: testInfo.outputPath(`${prefix}-album.png`), animations: "disabled" });
      await page.keyboard.press("Escape");
      await expect(detail).toHaveCount(0);
      await expect(selected).toHaveAttribute("data-batea-album-id", albumId);
      await expect(selected).toBeFocused();

      await page.evaluate(() => {
        window.__shellMock.restoreMockSnapshot({ data: null, error: false });
        window.__shellFlights = [];
        for (const stage of ["started", "arrived", "playback-started", "cancelled"]) {
          window.addEventListener(`cdvicious:disc-flight-${stage}`, (event) => {
            window.__shellFlights.push({ stage, detail: event.detail });
          });
        }
      });
      await expect(page.getByTestId("deck-now-playing-track")).toHaveText("INSERT DISC");
      await selected.click();
      await play.click();
      await expect(page.getByTestId("rail-flying-disc")).toBeVisible();
      await expect(page.getByTestId("deck-now-playing-track")).toHaveText("CARGANDO");
      await assertShell(page, width, height);
      expect(await geometry(page)).toEqual(initial);
      await page.screenshot({ path: testInfo.outputPath(`${prefix}-flight.png`) });
      await expect.poll(() => page.evaluate(() => window.__shellFlights.filter((event) => event.stage === "playback-started").length), { timeout: 20000 }).toBe(1);
      await expect(page.locator("html")).toHaveAttribute("data-chapter", "0");
      await expect(page.getByTestId("rail-flying-disc")).toHaveCount(0);
      const events = await page.evaluate(() => window.__shellFlights);
      const started = events.find((event) => event.stage === "started").detail;
      const confirmed = events.find((event) => event.stage === "playback-started").detail;
      expect(confirmed.attemptId).toBe(started.attemptId);
      expect(confirmed.snapshot.track.album.id).toBe(started.albumId);
      expect(events.filter((event) => event.stage === "cancelled")).toHaveLength(0);
      await toggle.click();
      await expect(display(page)).toHaveAttribute("data-is-playing", "false");
      await toggle.click();
      await expect(display(page)).toHaveAttribute("data-is-playing", "true");
      await assertShell(page, width, height);
      expect(await geometry(page)).toEqual(initial);
      fs.writeFileSync(testInfo.outputPath(`${prefix}-geometry.json`), JSON.stringify(initial, null, 2));
    });
  });
}
