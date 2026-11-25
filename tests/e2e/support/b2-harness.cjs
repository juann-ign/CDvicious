const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const collection = (page) => page.getByRole("region", { name: "La Colección", exact: true });
const booklet = (page) => page.locator('[data-rail-booklet] [aria-label="Booklet de letras"]');
const lyricFaces = (page) => booklet(page).locator('[data-testid="lyrics-content"], [class*="bookletLyrics"]');
const cards = (page) => collection(page).locator('[class*="grid"] > button[aria-label*=" — "]');

async function functionalFixture(page) {
  // These new tests target HTTP/state/DOM behavior. The original rail/WebGL
  // regression fixtures remain unchanged and run separately.
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (String(type).toLowerCase().includes("webgl")) return null;
      return getContext.call(this, type, ...args);
    };
  });
}
async function openRail(page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-rail-ready="true"]')).toBeVisible({ timeout: 90000 });
  const chapter = Number(await page.locator("html").getAttribute("data-chapter"));
  if (chapter <= 1) await expect(page.locator("[data-physical-deck]")).toBeVisible();
  else await expect(page.getByTestId("deck-now-playing-track")).toBeVisible();
}
async function go(page, name, index) {
  await page.getByRole("button", { name: `Ir al capítulo ${name}`, exact: true }).click();
  await expect.poll(() => page.locator("[data-rail-wrapper] > div > section").nth(index).evaluate((node) => Math.abs(node.getBoundingClientRect().left)), { timeout: 15000 }).toBeLessThan(2);
  await expect(page.locator("[data-rail-wrapper]").locator("..")).toHaveAttribute("data-rail-moving", "false");
}
async function installMock(page) {
  await page.evaluate(() => {
    window.webpackChunk_N_E.push([[`b2-fixture-${Date.now()}`], {}, (runtime) => {
      const candidates = Object.keys(runtime.m).filter((id) => runtime.m[id].toString().includes("restoreMockSnapshot"));
      window.__b2Mock = candidates.map((id) => runtime(id)).find((module) => typeof module.getSnapshot === "function" && typeof module.restoreMockSnapshot === "function");
      if (!window.__b2Mock) throw new Error("Existing mock store not found");
      window.__b2Original = structuredClone(window.__b2Mock.getSnapshot());
    }]);
  });
}
async function setTrack(page, id, name, isPlaying = false) {
  await page.evaluate(({ id, name, isPlaying }) => {
    const next = structuredClone(window.__b2Original);
    next.data.isPlaying = isPlaying;
    next.data.progressMs = 0;
    next.data.track.id = id;
    next.data.track.name = name;
    next.data.track.artists = [{ name: "B2 Demo Artist" }];
    next.data.track.album.name = "B2 Demo Album";
    window.__b2Mock.restoreMockSnapshot(next);
  }, { id, name, isPlaying });
  await expect(page.getByTestId("deck-now-playing-track")).toHaveText(name);
}
async function visibleLyrics(page) {
  return (await lyricFaces(page).allTextContents()).join("");
}
async function saveEvidence(page, testInfo, extra = {}) {
  const state = await page.evaluate(() => {
    const spread = document.querySelector('[data-rail-booklet] [aria-label="Booklet de letras"]');
    const rect = (node) => node?.getBoundingClientRect().toJSON();
    const dimensions = (node) => node ? { rect: rect(node), clientWidth: node.clientWidth, clientHeight: node.clientHeight, scrollWidth: node.scrollWidth, scrollHeight: node.scrollHeight, offsetWidth: node.offsetWidth, offsetHeight: node.offsetHeight, opacity: getComputedStyle(node).opacity, visibility: getComputedStyle(node).visibility, display: getComputedStyle(node).display, font: getComputedStyle(node).font, lineHeight: getComputedStyle(node).lineHeight } : null;
    return {
      chapter: document.documentElement.dataset.chapter,
      track: document.querySelector('[data-testid="deck-now-playing-track"]')?.textContent,
      header: spread?.querySelector("h4")?.textContent,
      text: [...spread?.querySelectorAll('[data-testid="lyrics-content"], [class*="bookletLyrics"]') ?? []].map((node) => node.textContent),
      spread: dimensions(spread),
      source: dimensions(spread?.querySelector('[class*="bookletLineMeasureSource"]')),
      firstMeasure: dimensions(spread?.querySelector('[class*="bookletMeasureLyrics"]')),
      faces: [...spread?.querySelectorAll('[data-testid="lyrics-content"], [class*="bookletLyrics"]') ?? []].map(dimensions),
      collection: document.querySelector('[aria-label="La Colección"]')?.textContent,
      fontStatus: document.fonts.status,
    };
  }).catch((error) => ({ error: error.message }));
  const directory = path.resolve(".qa/b2/evidence", process.env.B2_PHASE || "verification");
  fs.mkdirSync(directory, { recursive: true });
  const stem = testInfo.titlePath.slice(1).join("-").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-]+/g, "-").slice(0, 150);
  const record = { title: testInfo.title, status: testInfo.status, expectedStatus: testInfo.expectedStatus, ...extra, state };
  fs.writeFileSync(path.join(directory, `${stem}.json`), JSON.stringify(record, null, 2));
  await testInfo.attach("b2-state", { body: JSON.stringify(record, null, 2), contentType: "application/json" });
  if (!page.isClosed()) await page.screenshot({ path: path.join(directory, `${stem}.png`), animations: "disabled" });
}
function observeHttp(page) {
  const rows = [];
  page.on("request", (request) => { if (/\/api\/(lyrics|collection)(\?|$)/.test(request.url())) rows.push({ type: "request", url: request.url() }); });
  page.on("response", async (response) => {
    if (!/\/api\/(lyrics|collection)(\?|$)/.test(response.url())) return;
    const row = { type: "response", url: response.url(), status: response.status(), headers: response.headers() };
    rows.push(row);
    row.body = await response.json().catch(() => null);
  });
  return rows;
}
module.exports = { test, expect, collection, booklet, lyricFaces, cards, functionalFixture, openRail, go, installMock, setTrack, visibleLyrics, saveEvidence, observeHttp };
