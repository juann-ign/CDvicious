const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("./qa-evidence.cjs");
const { go } = require("./b2-harness.cjs");

const hardware = (page) => page.getByRole("group", { name: /^Reproductor de CD/ });
const collection = (page) => page.getByRole("region", { name: "La Colección", exact: true });
const grid = (page) => collection(page).locator("[data-page-size]");
const gridCards = (page) => grid(page).locator("[data-collection-album-id]");
const title = (page) => page.getByTestId("deck-now-playing-track");
const physicalToggle = (page) => hardware(page).getByRole("button", { name: "Pausar/reanudar equipo", exact: true });
const physicalNext = (page) => hardware(page).getByRole("button", { name: "Pista siguiente del equipo", exact: true });

async function bootPrototype(page, prototype) {
  const destination = prototype === "collection-tray"
    ? "/?prototype=collection-tray&entry=collection"
    : "/?prototype=deck-lift&chapter=deck";
  await page.goto(destination, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-rail-ready="true"]')).toBeVisible({ timeout: 90000 });
  const chapter = prototype === "collection-tray" ? 3 : 0;
  await expect(page.locator("html")).toHaveAttribute("data-chapter", String(chapter));
  await expect.poll(() => page.locator("[data-rail-wrapper] > div > section").nth(chapter)
    .evaluate((node) => Math.abs(node.getBoundingClientRect().left)), { timeout: 15000 }).toBeLessThan(2);
  await expect(page.locator("[data-rail-wrapper]").locator("..")).toHaveAttribute("data-rail-moving", "false");
  await expect.poll(() => new URL(page.url()).searchParams.get("prototype")).toBe(prototype);
  if (prototype === "collection-tray") await expect(gridCards(page).first()).toBeVisible();
  else await expect(physicalToggle(page)).toBeEnabled();
}

function observeRequests(page) {
  const play = [], collectionRequests = [], collectionResponses = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/play" && request.method() === "POST") play.push(request.postDataJSON());
    if (url.pathname === "/api/collection") collectionRequests.push(url.pathname + url.search);
  });
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (url.pathname !== "/api/collection") return;
    const albums = await response.json().catch(() => null);
    collectionResponses.push({ url: url.pathname + url.search, status: response.status(), albums });
  });
  return { play, collectionRequests, collectionResponses };
}

async function canonicalState(page) {
  return page.getByTestId("deck-now-playing").evaluate((node) => {
    const times = [...node.querySelectorAll('[class*="progressTimes"] span')].map((span) => span.textContent);
    const seconds = (text) => text?.split(":").map(Number).reduce((minutes, seconds) => minutes * 60 + seconds) ?? null;
    return { title: node.querySelector('[data-testid="deck-now-playing-track"]')?.textContent,
      artist: node.querySelector('[data-testid="deck-now-playing-artist"]')?.textContent,
      playing: node.dataset.isPlaying === "true", elapsed: seconds(times[0]), duration: seconds(times[1]) };
  });
}

async function observeArrival(page) {
  await page.addInitScript(() => {
    window.__prototypeArrivals = [];
    const quad = (node, attribute) => node ? Object.fromEntries(["tl", "tr", "bl", "br"].map((corner) => {
      const point = node.querySelector(`[${attribute}="${corner}"]`).getBoundingClientRect();
      return [corner, { x: point.left, y: point.top }];
    })) : null;
    window.addEventListener("cdvicious:disc-flight-arrived", (event) => {
      window.__prototypeArrivals.push({ attemptId: event.detail?.attemptId,
        target: quad(document.querySelector("[data-deck-disc-target]"), "data-disc-pose-corner"),
        flight: quad(document.querySelector('[data-testid="rail-flying-disc"]'), "data-flight-pose-corner") });
    });
  });
}

async function expectOneArrival(page, attemptId) {
  const arrivals = await page.evaluate(() => window.__prototypeArrivals);
  expect(arrivals).toHaveLength(1);
  expect(arrivals[0].attemptId).toBe(attemptId);
  for (const corner of ["tl", "tr", "bl", "br"]) {
    expect(Math.hypot(arrivals[0].target[corner].x - arrivals[0].flight[corner].x,
      arrivals[0].target[corner].y - arrivals[0].flight[corner].y)).toBeLessThan(1);
  }
  return arrivals;
}

async function saveRecord(testInfo, name, value) {
  const output = testInfo.outputPath(`${name}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(value, null, 2) + "\n", "utf8");
  await testInfo.attach(name, { path: output, contentType: "application/json" });
}

module.exports = { test, expect, go, bootPrototype, hardware, collection, grid, gridCards, title, physicalToggle, physicalNext, observeRequests, canonicalState, observeArrival, expectOneArrival, saveRecord };
