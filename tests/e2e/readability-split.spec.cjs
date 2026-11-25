const fs = require("node:fs");
const path = require("node:path");
const { test, expect, booklet, lyricFaces, functionalFixture, openRail, go, visibleLyrics } = require("./support/b2-harness.cjs");

const output = path.resolve(".qa/readability/after");
const root = (page) => page.getByTestId("lyrics-booklet");
const paper = (page) => page.getByTestId("lyrics-paper");
const toolbar = (page) => page.getByTestId("lyrics-pagination-controls");
const next = (page) => toolbar(page).getByRole("button", { name: "Páginas siguientes", exact: true });
const previous = (page) => toolbar(page).getByRole("button", { name: "Páginas anteriores", exact: true });
const nextTrack = (page) => page.locator("[data-physical-deck]").getByRole("button", { name: "Pista siguiente del equipo", exact: true });
const previousTrack = (page) => page.locator("[data-physical-deck]").getByRole("button", { name: "Pista anterior del equipo", exact: true });

test.beforeEach(async ({ page }) => { await functionalFixture(page); fs.mkdirSync(output, { recursive: true }); });

async function openMapa(page) {
  await openRail(page);
  await go(page, "Split", 1);
  const response = page.waitForResponse((item) => new URL(item.url()).pathname === "/api/lyrics" && new URL(item.url()).searchParams.get("title") === "Mapa de azoteas");
  await nextTrack(page).click();
  await nextTrack(page).click();
  const body = await (await response).json();
  expect(body.provenance.provider).toBe("demo");
  expect(body.status).toBe("available");
  expect(body.lyrics.split("\n")[0]).toBe("Mapa de azoteas: dibujo la ciudad que todavía no existe.");
  await expect(page.getByTestId("deck-now-playing-track")).toHaveText("Mapa de azoteas");
  await expect(root(page)).toHaveAttribute("data-pagination-state", "ready");
  await expect(root(page)).toHaveAttribute("data-pagination-index", "0");
  await expect(lyricFaces(page).first()).toContainText("Mapa de azoteas");
  return body.lyrics;
}

async function assertFits(page) {
  await expect.poll(() => lyricFaces(page).evaluateAll((nodes) => nodes.filter((node) => node.scrollHeight > node.clientHeight + 2).map((node) => ({ client: node.clientHeight, scroll: node.scrollHeight })))).toEqual([]);
}

test("Split normal: lectura, márgenes parejos y hoja desde el lomo mantienen los controles fuera del giro", async ({ page }) => {
  const source = await openMapa(page);
  await expect(toolbar(page)).toBeInViewport({ ratio: 1 });
  await expect(previous(page)).toBeDisabled();
  await expect(next(page)).toBeEnabled();
  await expect(toolbar(page).getByRole("status")).toContainText(/^Página 1 de \d+$/);
  const geometry = await lyricFaces(page).evaluateAll((nodes) => nodes.map((node) => ({
    top: node.offsetTop,
    font: parseFloat(getComputedStyle(node).fontSize),
    left: getComputedStyle(node.parentElement).paddingLeft,
    right: getComputedStyle(node.parentElement).paddingRight,
  })));
  expect(geometry).toHaveLength(2);
  expect(geometry[0].top).toBe(geometry[1].top);
  geometry.forEach((face) => { expect(face.font).toBeGreaterThanOrEqual(16); expect(face.font).toBeLessThanOrEqual(18); expect(face.left).toBe(face.right); });
  expect(await paper(page).evaluate((node) => node.contains(document.querySelector('[data-testid="lyrics-pagination-controls"]')))).toBe(false);
  await assertFits(page);
  await page.screenshot({ path: path.join(output, "split-1280x800.png"), animations: "disabled" });
  const controlsBefore = await toolbar(page).boundingBox();
  await next(page).click();
  await expect(root(page)).toHaveAttribute("data-pagination-index", "2");
  const leaf = await page.getByTestId("lyrics-turning-leaf").evaluate((node) => ({
    origin: getComputedStyle(node).transformOrigin,
    preserve: getComputedStyle(node).transformStyle,
    frames: node.getAnimations().flatMap((animation) => animation.effect.getKeyframes().map((frame) => frame.transform)),
    hidden: node.getAttribute("aria-hidden"),
  }));
  expect(leaf.origin.split(" ")[0]).toBe("0px");
  expect(leaf.preserve).toBe("preserve-3d");
  expect(leaf.frames).toContain("rotateY(-180deg)");
  expect(leaf.hidden).toBe("true");
  expect(await toolbar(page).boundingBox()).toEqual(controlsBefore);
  await expect(root(page)).toHaveAttribute("data-page-turn-state", "idle");
  await previous(page).click();
  await expect(root(page)).toHaveAttribute("data-pagination-index", "0");
  await expect(root(page)).toHaveAttribute("data-page-turn-state", "idle");
  const text = [];
  for (let step = 0; step < 100; step++) {
    await assertFits(page);
    const spread = await visibleLyrics(page);
    text.push(spread);
    if (await next(page).isDisabled()) break;
    await next(page).click();
    await expect.poll(() => visibleLyrics(page)).not.toBe(spread);
    if (step === 99) throw new Error("La letra no terminó en 100 spreads");
  }
  expect(text.join("")).toBe(source);
  await expect(toolbar(page)).toBeInViewport({ ratio: 1 });
});

test("Split normal: redimensionar conserva el verso y Deck no recibe foco del booklet oculto", async ({ page }) => {
  await openMapa(page);
  await next(page).click();
  await next(page).click();
  const before = await lyricFaces(page).first().textContent();
  const verse = before.split("\n").find((line) => line.trim());
  expect(verse).toBeTruthy();
  const anchor = await root(page).getAttribute("data-reading-anchor");
  expect(Number(anchor)).toBeGreaterThan(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(root(page)).toHaveAttribute("data-pagination-state", "ready");
  await expect.poll(() => visibleLyrics(page)).toContain(verse);
  await expect(root(page)).toHaveAttribute("data-reading-anchor", anchor);
  await assertFits(page);
  await expect(toolbar(page)).toBeInViewport({ ratio: 1 });
  const equipment = page.getByRole("group", { name: /Reproductor de CD.*Neon Rooms/ });
  await expect(equipment).toBeVisible();
  await expect(equipment.locator("[data-deck-docked-disc]")).toBeVisible();
  await expect(equipment.locator("[data-deck-mechanism]")).toHaveAttribute("data-deck-static", "true");
  await page.screenshot({ path: path.join(output, "split-1440x900.png"), animations: "disabled" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect.poll(() => visibleLyrics(page)).toContain(verse);
  await expect(root(page)).toHaveAttribute("data-reading-anchor", anchor);
  await assertFits(page);
  const retainedPage = await root(page).getAttribute("data-pagination-index");
  await go(page, "Deck", 0);
  const hiddenControls = toolbar(page).locator("button");
  await expect(hiddenControls.nth(0)).toBeDisabled();
  await expect(hiddenControls.nth(1)).toBeDisabled();
  expect(await toolbar(page).evaluate((node) => Boolean(node.closest("[inert]")))).toBe(true);
  expect(await hiddenControls.nth(1).evaluate((button) => { button.focus(); return document.activeElement === button; })).toBe(false);
  await go(page, "Split", 1);
  await expect(root(page)).toHaveAttribute("data-pagination-index", retainedPage);
  await expect(root(page)).toHaveAttribute("data-reading-anchor", anchor);
  await expect(previous(page)).toBeEnabled();
  expect(await toolbar(page).evaluate((node) => Boolean(node.closest("[inert]")))).toBe(false);
});

test("Split normal: movimiento reducido inmediato, cambio rápido, instrumental y letra no disponible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openMapa(page);
  const before = await visibleLyrics(page);
  await next(page).click();
  await expect(root(page)).toHaveAttribute("data-pagination-index", "2");
  expect(await visibleLyrics(page)).not.toBe(before);
  await expect(root(page)).toHaveAttribute("data-page-turn-state", "idle");
  await expect(page.getByTestId("lyrics-turning-leaf")).toHaveCount(0);
  await nextTrack(page).click();
  await nextTrack(page).click();
  await expect(root(page)).toHaveAttribute("data-track-id", "mock-track-mock-album-01-5");
  await expect(root(page)).toHaveAttribute("data-status", "unavailable");
  await expect(page.getByTestId("lyrics-status")).toContainText("LETRA NO DISPONIBLE");
  expect(await visibleLyrics(page)).toBe("");
  await expect(toolbar(page)).toBeInViewport({ ratio: 1 });
  await expect(previous(page)).toBeDisabled();
  await expect(next(page)).toBeDisabled();
  await previousTrack(page).click();
  await expect(root(page)).toHaveAttribute("data-status", "instrumental");
  await expect(page.getByTestId("lyrics-status")).toContainText("PISTA INSTRUMENTAL");
  expect(await visibleLyrics(page)).toBe("");
  await previousTrack(page).click();
  await expect(root(page)).toHaveAttribute("data-status", "available");
  await expect(root(page)).toHaveAttribute("data-pagination-index", "0");
  await expect(lyricFaces(page).first()).toContainText("Mapa de azoteas");
  await expect(page.getByTestId("lyrics-turning-leaf")).toHaveCount(0);
});
