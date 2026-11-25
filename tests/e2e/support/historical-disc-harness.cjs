const base = require("./prototype-harness.cjs");
const { expect } = base;

const threeCanvas = (page) => page.locator('canvas[data-historical-disc-canvas="true"]');

async function meshPose(page) {
  return threeCanvas(page).evaluate((canvas) => ({
    rotation: canvas.dataset.threeRotation?.split(",").map(Number),
    elapsed: Number(canvas.dataset.threeElapsed),
    dragOffset: Number(canvas.dataset.threeDragOffset),
    dragging: canvas.dataset.threeDragging === "true",
    returning: canvas.dataset.threeReturning === "true",
    presentation: canvas.dataset.threePresentation,
    groupUuid: canvas.dataset.threeGroupUuid,
  }));
}

async function expectActualWebGL(page) {
  await expect(threeCanvas(page)).toBeVisible();
  await expect(threeCanvas(page)).toHaveAttribute("data-three-ready", "true");
  await expect(threeCanvas(page)).toHaveAttribute("data-three-painted-presentation", "free");
  await expect(page.locator("[data-deck-disc-target]")).toHaveAttribute("data-disc-representation", "three");
  await expect(threeCanvas(page)).toHaveAttribute("data-three-rotation", /^[-+\d.e]+,[-+\d.e]+,[-+\d.e]+$/i);
  const context = await threeCanvas(page).evaluate((canvas) => {
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    return gl ? { real: gl instanceof WebGLRenderingContext || (typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext),
      version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(gl.RENDERER),
      lost: gl.isContextLost(), width: canvas.width, height: canvas.height } : null;
  });
  expect(context).not.toBeNull();
  expect(context.real).toBe(true);
  expect(context.lost).toBe(false);
  expect(context.width).toBeGreaterThan(0);
  expect(context.height).toBeGreaterThan(0);
  const pose = await meshPose(page);
  expect(pose.rotation).toHaveLength(3);
  expect(pose.rotation.every(Number.isFinite)).toBe(true);
  expect(pose.groupUuid).toBeTruthy();
  return context;
}

async function sampleMesh(page, durationMs) {
  return threeCanvas(page).evaluate((canvas, durationMs) => new Promise((resolve) => {
    const start = performance.now(), rows = [];
    const sample = () => {
      rows.push({ at: performance.now(), rotation: canvas.dataset.threeRotation?.split(",").map(Number),
        elapsed: Number(canvas.dataset.threeElapsed), dragOffset: Number(canvas.dataset.threeDragOffset),
        dragging: canvas.dataset.threeDragging === "true", returning: canvas.dataset.threeReturning === "true",
        groupUuid: canvas.dataset.threeGroupUuid });
      if (performance.now() - start >= durationMs) resolve(rows); else requestAnimationFrame(sample);
    };
    sample();
  }), durationMs);
}

async function startRepresentationProbe(page, { includeFlight = false } = {}) {
  await page.evaluate((includeFlight) => {
    // visibility may be restored by a descendant (including a frozen clone's
    // inline !important value). display:none and composited opacity cannot.
    window.__inspectHistoricalRepresentations = () => {
      const cached = new Map();
      const style = (node) => { if (!cached.has(node)) cached.set(node, getComputedStyle(node)); return cached.get(node); };
      const blocked = (node) => {
        for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
          const value = style(ancestor);
          if (value.display === "none" || Number(value.opacity) === 0 || value.contentVisibility === "hidden") return true;
        }
        return false;
      };
      const hasArea = (node) => { const rect = node.getBoundingClientRect(); return rect.width > 1 && rect.height > 1; };
      const colorPaints = (value) => {
        if (!value || value === "transparent") return false;
        const values = value.match(/[\d.]+/g)?.map(Number);
        return !(value.startsWith("rgba") && values?.length === 4 && values[3] === 0);
      };
      const surfacePaints = (node, value, pseudo) => {
        if (value.visibility !== "visible" || blocked(node) || !hasArea(node)) return false;
        if (pseudo && (value.content === "none" || value.content === "normal" || value.display === "none")) return false;
        if (value.backgroundImage !== "none" || colorPaints(value.backgroundColor) || value.boxShadow !== "none") return true;
        for (const side of ["Top", "Right", "Bottom", "Left"]) {
          if (parseFloat(value[`border${side}Width`]) > 0 && !["none", "hidden"].includes(value[`border${side}Style`]) && colorPaints(value[`border${side}Color`])) return true;
        }
        if (["IMG", "SVG", "CANVAS"].includes(node.tagName) && !pseudo) return true;
        return colorPaints(value.color) && (pseudo ? !['""', "''"].includes(value.content) : [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim()));
      };
      const flightTestId = '[data-testid="rail-flying-disc"]';
      const discSelectors = "[data-deck-docked-disc], [data-deck-inserted-disc], [data-deck-air-disc]";
      const sources = [...document.querySelectorAll(includeFlight ? `${discSelectors}, ${flightTestId}` : discSelectors)].map((root) => {
        const kind = root.hasAttribute("data-deck-inserted-disc") ? "inserted" : root.hasAttribute("data-deck-docked-disc") ? "docked" : root.matches(flightTestId) ? "flight" : "air";
        const surfaces = [];
        for (const [index, node] of [root, ...root.querySelectorAll("*")].entries()) {
          for (const pseudo of [null, "::before", "::after"]) {
            const value = pseudo ? getComputedStyle(node, pseudo) : style(node);
            if (!surfacePaints(node, value, pseudo)) continue;
            surfaces.push({ index, tag: node.tagName, pseudo, visibility: value.visibility,
              inlineVisibility: node.style.visibility, visibilityPriority: node.style.getPropertyPriority("visibility"),
              backgroundImage: value.backgroundImage, backgroundColor: value.backgroundColor, boxShadow: value.boxShadow,
              rect: node.getBoundingClientRect().toJSON(),
              hiddenAncestors: [...function* () { for (let parent = node.parentElement; parent; parent = parent.parentElement) if (style(parent).visibility !== "visible") yield parent.tagName; }()] });
          }
        }
        return { kind, hostVisibility: style(root).visibility, surfaces };
      });
      const canvases = [...document.querySelectorAll('canvas[data-historical-disc-canvas="true"]')].map((canvas) => ({
        painted: style(canvas).visibility === "visible" && !blocked(canvas) && hasArea(canvas),
        ready: canvas.dataset.threeReady, presentation: canvas.dataset.threePaintedPresentation,
        groupUuid: canvas.dataset.threeGroupUuid, rect: canvas.getBoundingClientRect().toJSON(),
      }));
      const visible = [...sources.filter((source) => source.surfaces.length > 0).map((source) => `css:${source.kind}`), ...canvases.filter((canvas) => canvas.painted).map(() => "three")];
      return { state: document.querySelector("[data-physical-deck]")?.dataset.discState,
        representation: document.querySelector("[data-deck-disc-target]")?.dataset.discRepresentation,
        targets: document.querySelectorAll("[data-deck-disc-target]").length, visible, sources, canvases };
    };
    const result = { version: "paint-surfaces-v2", maxVisible: 0, maxTargets: 0, freeSamples: 0, invalidFreeSamples: [], totalInvalidFreeSamples: 0, changes: [] };
    window.__historicalRepresentationProbe = result;
    const read = () => {
      const { visible, state, targets, sources } = window.__inspectHistoricalRepresentations();
      result.maxVisible = Math.max(result.maxVisible, visible.length);
      result.maxTargets = Math.max(result.maxTargets, targets);
      if (state === "free") {
        result.freeSamples++;
        if (visible.length !== 1) {
          result.totalInvalidFreeSamples++;
          if (result.invalidFreeSamples.length < 50) result.invalidFreeSamples.push({ at: performance.now(), visible });
        }
      }
      const row = { state, visible, targets, cssSurfaceCounts: sources.map((source) => ({ kind: source.kind, count: source.surfaces.length })) };
      if (includeFlight) {
        row.playbackPhase = document.querySelector("[data-rail-overlay]")?.dataset.playbackPhase;
        row.flightPhase = document.querySelector('[data-testid="rail-flying-disc"]')?.dataset.flightPhase ?? null;
      }
      if (JSON.stringify(row) !== JSON.stringify(result.changes.at(-1))) result.changes.push(row);
      window.__historicalRepresentationFrame = requestAnimationFrame(read);
    };
    read();
  }, includeFlight);
}

async function representationSnapshot(page) {
  return page.evaluate(() => window.__inspectHistoricalRepresentations());
}

async function stopRepresentationProbe(page) {
  return page.evaluate(() => {
    cancelAnimationFrame(window.__historicalRepresentationFrame);
    return window.__historicalRepresentationProbe;
  });
}

async function finishRepresentationProbe(page) {
  const result = await stopRepresentationProbe(page);
  expect(result.maxTargets).toBe(1);
  expect(result.maxVisible).toBe(1);
  expect(result.freeSamples).toBeGreaterThan(0);
  expect(result.invalidFreeSamples).toEqual([]);
  return result;
}

async function beginHistoricalDrag(page, dx = 100) {
  const box = await threeCanvas(page).boundingBox();
  const point = { x: Math.round(box.x + box.width * .5), y: Math.round(box.y + box.height * .5) };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await expect(threeCanvas(page)).toHaveAttribute("data-three-dragging", "true");
  await page.mouse.move(point.x + dx, point.y - 20, { steps: 8 });
  return point;
}

async function installReturnProbe(page, trigger = "pointerup") {
  await page.evaluate((trigger) => {
    const canvas = document.querySelector('canvas[data-historical-disc-canvas="true"]');
    window.__historicalReturnProbe = { releasedAt: null, finishedAt: null, sawReturning: false, samples: [] };
    const released = (event) => {
      const result = window.__historicalReturnProbe;
      result.releasedAt = performance.now();
      result.nativeEvent = event.isTrusted;
      const sample = () => {
        const row = { at: performance.now(), returning: canvas.dataset.threeReturning === "true", dragOffset: Number(canvas.dataset.threeDragOffset), elapsed: Number(canvas.dataset.threeElapsed) };
        result.samples.push(row);
        if (row.returning) result.sawReturning = true;
        if (result.sawReturning && !row.returning) result.finishedAt = row.at;
        else window.__historicalReturnFrame = requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    };
    const source = trigger === "blur" ? document.querySelector("[data-deck-disc-target]") : window;
    source.addEventListener(trigger, released, { capture: true, once: true });
  }, trigger);
}

async function historicalReturn(page) {
  await expect.poll(() => page.evaluate(() => window.__historicalReturnProbe.finishedAt)).not.toBeNull();
  return page.evaluate(() => {
    cancelAnimationFrame(window.__historicalReturnFrame);
    return window.__historicalReturnProbe;
  });
}

module.exports = { ...base, threeCanvas, meshPose, expectActualWebGL, sampleMesh, startRepresentationProbe, representationSnapshot, stopRepresentationProbe, finishRepresentationProbe, beginHistoricalDrag, installReturnProbe, historicalReturn };
