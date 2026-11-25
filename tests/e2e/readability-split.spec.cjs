const fs = require("node:fs");
const path = require("node:path");
const { test, expect, booklet, lyricFaces, functionalFixture, openRail, go, visibleLyrics } = require("./support/b2-harness.cjs");

const output = path.resolve(".qa/readability/after");
const root = (page) => page.getByTestId("lyrics-booklet");
const paper = (page) => page.getByTestId("lyrics-paper");
const pageStatus = (page) => page.getByTestId("lyrics-page-status");
const next = (page) => paper(page).locator('[data-booklet-edge="next"]');
const previous = (page) => paper(page).locator('[data-booklet-edge="previous"]');
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

async function assertEdgesInView(page) {
  await expect(previous(page)).toBeInViewport({ ratio: 1 });
  await expect(next(page)).toBeInViewport({ ratio: 1 });
}

async function clickPageCenter(page, side) {
  const face = paper(page).locator(`[data-booklet-page-half="${side}"]`);
  const bounds = await face.boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}

function visiblePageStarts(page) {
  return paper(page).getByTestId("lyrics-content").evaluateAll((nodes) => nodes.map((node) => ({
    top: node.offsetTop,
    title: node.parentElement.querySelector("h4")?.textContent ?? null,
  })));
}

test("Split normal: lectura compacta, clic en bordes y hojas alineadas durante el giro", async ({ page }, testInfo) => {
  const source = await openMapa(page);
  await expect(page.getByTestId("lyrics-pagination-controls")).toHaveCount(0);
  await assertEdgesInView(page);
  await expect(previous(page)).toHaveAccessibleName("Páginas anteriores");
  await expect(next(page)).toHaveAccessibleName("Páginas siguientes");
  await expect(previous(page)).toBeDisabled();
  await expect(next(page)).toBeEnabled();
  await expect(pageStatus(page)).toHaveAttribute("role", "status");
  await expect(pageStatus(page)).toHaveText(/^Página 1 de \d+$/);
  const layout = await paper(page).evaluate((spread) => {
    const metrics = (node) => {
      const style = getComputedStyle(node);
      return { font: style.fontSize, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing };
    };
    const visible = [...spread.querySelectorAll('[data-testid="lyrics-content"]')];
    return {
      visible: visible.map(metrics),
      measured: [...spread.querySelectorAll('[class*="bookletMeasureLyrics"], [class*="bookletLineMeasureSource"]')].map(metrics),
      padding: visible.map((node) => getComputedStyle(node.parentElement).padding),
      edges: [...spread.querySelectorAll('[data-booklet-edge]')].map((edge) => {
        const sheet = edge.closest('[data-booklet-page-half]');
        const width = sheet.clientWidth;
        return { side: sheet.dataset.bookletPageHalf, widthRatio: edge.offsetWidth / width,
          gap: edge.dataset.bookletEdge === "previous" ? edge.offsetLeft : width - edge.offsetLeft - edge.offsetWidth };
      }),
    };
  });
  const historical = { font: "16px", lineHeight: "16px", letterSpacing: "-0.1px" };
  expect(layout.visible).toEqual([historical, historical]);
  expect(layout.measured).toEqual([historical, historical, historical]);
  expect(layout.padding).toEqual(["24px 26px 20px", "24px 26px 20px"]);
  const [first, second] = await visiblePageStarts(page);
  expect(first.title).toBe("Mapa de azoteas");
  expect(first.top).toBeGreaterThan(second.top);
  expect(second).toEqual({ top: 24, title: null });
  expect(layout.edges.map(({ side }) => side)).toEqual(["left", "right"]);
  for (const edge of layout.edges) {
    expect(edge.widthRatio).toBeGreaterThan(0);
    expect(edge.widthRatio).toBeLessThan(0.25);
    expect(Math.abs(edge.gap)).toBeLessThanOrEqual(2);
  }
  await assertFits(page);
  await clickPageCenter(page, "right");
  await expect(root(page)).toHaveAttribute("data-pagination-index", "0");
  await expect(root(page)).toHaveAttribute("data-page-turn-state", "idle");
  await page.screenshot({ path: path.join(output, "split-1280x800.png"), animations: "disabled" });
  const paperBefore = await paper(page).boundingBox();
  // Read both ends of the real CSS animation while the sheet is attached.
  // A later CDP round trip can miss it after onAnimationEnd removes the leaf.
  await page.evaluate(() => {
    window.__readabilityTurningLeaves = [];
    const spread = document.querySelector('[data-testid="lyrics-paper"]');
    const capture = (event) => {
      const node = event.target;
      if (!(node instanceof HTMLElement) || node.dataset.testid !== "lyrics-turning-leaf") return;
      const style = getComputedStyle(node);
      const direction = spread.closest('[data-testid="lyrics-booklet"]').dataset.pageTurnState;
      const startingSide = direction === "next" ? "right" : "left";
      const endingSide = direction === "next" ? "left" : "right";
      const animation = node.getAnimations().find((item) => item.animationName === event.animationName);
      const bounds = (element) => element.getBoundingClientRect().toJSON();
      const faces = { startsAt: bounds(spread.querySelector(`[data-booklet-page-half="${startingSide}"]`)),
        endsAt: bounds(spread.querySelector(`[data-booklet-page-half="${endingSide}"]`)) };
      const elapsed = animation.currentTime;
      animation.pause();
      animation.currentTime = 0;
      const start = bounds(node.querySelector('[data-turn-face="front"]'));
      animation.currentTime = animation.effect.getComputedTiming().duration;
      const end = bounds(node.querySelector('[data-turn-face="back"]'));
      animation.currentTime = elapsed;
      animation.play();
      window.__readabilityTurningLeaves.push({
        direction, origin: parseFloat(style.transformOrigin), spine: parseFloat(getComputedStyle(spread).width) * 0.54,
        preserve: style.transformStyle, frames: animation.effect.getKeyframes().map((frame) => frame.transform),
        hidden: node.getAttribute("aria-hidden"),
        connected: node.isConnected,
        animationStartAt: event.timeStamp,
        sampledAt: performance.now(),
        nativeEvent: event.isTrusted,
        animationName: event.animationName,
        faces, start, end,
      });
      if (window.__readabilityTurningLeaves.length === 2) spread.removeEventListener("animationstart", capture);
    };
    spread.addEventListener("animationstart", capture);
  });
  await next(page).click();
  await expect(root(page)).toHaveAttribute("data-pagination-index", "2");
  await expect.poll(() => page.evaluate(() => window.__readabilityTurningLeaves.length)).toBe(1);
  await expect(root(page)).toHaveAttribute("data-page-turn-state", "idle");
  expect(await visiblePageStarts(page)).toEqual([{ top: 24, title: null }, { top: 24, title: null }]);
  await clickPageCenter(page, "left");
  await expect(root(page)).toHaveAttribute("data-pagination-index", "2");
  await expect(previous(page)).toBeEnabled();
  await previous(page).click();
  await expect(root(page)).toHaveAttribute("data-pagination-index", "0");
  await expect.poll(() => page.evaluate(() => window.__readabilityTurningLeaves.length)).toBe(2);
  const observation = await page.evaluate(() => ({ leaves: window.__readabilityTurningLeaves, evaluatedAt: performance.now() }));
  const observationPath = testInfo.outputPath("native-turning-leaf.json");
  fs.mkdirSync(path.dirname(observationPath), { recursive: true });
  fs.writeFileSync(observationPath, JSON.stringify(observation, null, 2) + "\n", "utf8");
  await testInfo.attach("native-turning-leaf", { path: observationPath, contentType: "application/json" });
  expect(observation.leaves.map((leaf) => leaf.direction)).toEqual(["next", "previous"]);
  for (const leaf of observation.leaves) {
    expect(leaf.connected).toBe(true);
    expect(leaf.nativeEvent).toBe(true);
    expect(Math.abs(leaf.origin - leaf.spine)).toBeLessThan(1);
    expect(leaf.preserve).toBe("preserve-3d");
    expect(leaf.frames.at(-1)).toContain(`rotateY(${leaf.direction === "next" ? "-" : ""}180deg)`);
    expect(leaf.hidden).toBe("true");
    for (const metric of ["x", "y", "width", "height"]) {
      expect(Math.abs(leaf.start[metric] - leaf.faces.startsAt[metric]), `${leaf.direction} start ${metric}`).toBeLessThan(1);
      expect(Math.abs(leaf.end[metric] - leaf.faces.endsAt[metric]), `${leaf.direction} end ${metric}`).toBeLessThan(1);
    }
  }
  expect(await paper(page).boundingBox()).toEqual(paperBefore);
  await expect(root(page)).toHaveAttribute("data-page-turn-state", "idle");
  const text = [];
  for (let step = 0; step < 100; step++) {
    await assertFits(page);
    const spread = await visibleLyrics(page);
    text.push(spread);
    if (await next(page).isDisabled()) break;
    await next(page).click();
    await expect.poll(() => visibleLyrics(page)).not.toBe(spread);
    await expect(root(page)).toHaveAttribute("data-page-turn-state", "idle");
    if (step === 99) throw new Error("La letra no terminó en 100 spreads");
  }
  expect(text.join("")).toBe(source);
  await assertEdgesInView(page);
});

test("Split normal: redimensionar conserva el verso y Deck no recibe foco del booklet oculto", async ({ page }) => {
  await openMapa(page);
  await next(page).click();
  await expect(root(page)).toHaveAttribute("data-page-turn-state", "idle");
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
  await assertEdgesInView(page);
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
  await expect(previous(page)).toBeDisabled();
  await expect(next(page)).toBeDisabled();
  expect(await paper(page).evaluate((node) => Boolean(node.closest("[inert]")))).toBe(true);
  expect(await next(page).evaluate((button) => { button.focus(); return document.activeElement === button; })).toBe(false);
  await go(page, "Split", 1);
  await expect(root(page)).toHaveAttribute("data-pagination-index", retainedPage);
  await expect(root(page)).toHaveAttribute("data-reading-anchor", anchor);
  await expect(previous(page)).toBeEnabled();
  expect(await paper(page).evaluate((node) => Boolean(node.closest("[inert]")))).toBe(false);
});

test("Split normal: movimiento reducido inmediato, cambio rápido, instrumental y letra no disponible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openMapa(page);
  const before = await visibleLyrics(page);
  await next(page).press("Enter");
  await expect(root(page)).toHaveAttribute("data-pagination-index", "2");
  expect(await visibleLyrics(page)).not.toBe(before);
  await expect(root(page)).toHaveAttribute("data-page-turn-state", "idle");
  await expect(page.getByTestId("lyrics-turning-leaf")).toHaveCount(0);
  await booklet(page).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(root(page)).toHaveAttribute("data-pagination-index", "0");
  expect(await visibleLyrics(page)).toBe(before);
  await expect(page.getByTestId("lyrics-turning-leaf")).toHaveCount(0);
  await nextTrack(page).click();
  await nextTrack(page).click();
  await expect(root(page)).toHaveAttribute("data-track-id", "mock-track-mock-album-01-5");
  await expect(root(page)).toHaveAttribute("data-status", "unavailable");
  await expect(page.getByTestId("lyrics-status")).toContainText("LETRA NO DISPONIBLE");
  expect(await visibleLyrics(page)).toBe("");
  await assertEdgesInView(page);
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
