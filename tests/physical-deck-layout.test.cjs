const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const moduleUnderTest = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/physicalDeckLayout.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { module: moduleUnderTest, exports: moduleUnderTest.exports });
const { fitDeck, fitSplitDeck } = moduleUnderTest.exports;

// Projected silhouette fixtures, not the transparent 1280×660 design frame.
// The open fixture includes the lateral lids and the raised CD envelope.
const closed = { left: 168, top: 216, right: 1112, bottom: 556 };
const open = { left: 8, top: 0, right: 1272, bottom: 556 };
const viewports = [[1440, 900], [1280, 800], [1280, 720]];
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const project = (bounds, fit) => ({
  left: bounds.left * fit.scale + fit.x,
  right: bounds.right * fit.scale + fit.x,
  top: bounds.top * fit.scale + fit.y,
  bottom: bounds.bottom * fit.scale + fit.y,
});
function assertInside(rect, slot) {
  assert.ok(rect.left >= slot.left - 1e-7, `Left edge ${rect.left} outside ${slot.left}`);
  assert.ok(rect.right <= slot.right + 1e-7, `Right edge ${rect.right} outside ${slot.right}`);
  assert.ok(rect.top >= slot.top - 1e-7, `Top edge ${rect.top} outside ${slot.top}`);
  assert.ok(rect.bottom <= slot.bottom + 1e-7, `Bottom edge ${rect.bottom} outside ${slot.bottom}`);
}

test("Deck fits closed and open silhouette fixtures between nav, action reserve and footer", () => {
  for (const [width, windowHeight] of viewports) {
    const height = windowHeight - 72 - 128;
    for (const [bounds, horizontalMargin] of [[closed, 32], [open, 16]]) {
      const bottom = height - 64;
      const fit = fitDeck(bounds, width - horizontalMargin * 2, height - 96, width / 2, bottom);
      const visible = project(bounds, fit);
      assertInside(visible, { left: horizontalMargin, right: width - horizontalMargin, top: 32, bottom });
      close((visible.left + visible.right) / 2, width / 2);
      close(visible.bottom, bottom);
    }
  }
});

test("Split keeps both poses within the left half without consuming the booklet slot", () => {
  for (const [width, windowHeight] of viewports) {
    const height = windowHeight - 72 - 128;
    for (const bounds of [closed, open]) {
      const bottom = height - 64;
      const fit = fitDeck(bounds, width * .48 - 24, height - 96, width * .25, bottom);
      const visible = project(bounds, fit);
      assertInside(visible, { left: 12, right: width / 2 - 12, top: 32, bottom });
      close((visible.left + visible.right) / 2, width / 4);
    }
  }
});

test("transparent scene offsets do not change the fitted visible rectangle or its aspect ratio", () => {
  const shifted = { left: closed.left + 213, right: closed.right + 213, top: closed.top - 91, bottom: closed.bottom - 91 };
  const original = project(closed, fitDeck(closed, 900, 400, 500, 600));
  const translated = project(shifted, fitDeck(shifted, 900, 400, 500, 600));
  for (const edge of ["left", "right", "top", "bottom"]) close(original[edge], translated[edge]);
  close((original.right - original.left) / (original.bottom - original.top),
    (closed.right - closed.left) / (closed.bottom - closed.top));
});

test("fit may enlarge a roomy Deck and uses the tighter dimension rather than clipping it", () => {
  const bounds = { left: 10, top: 20, right: 110, bottom: 220 };
  const heightLimited = fitDeck(bounds, 1000, 120, 500, 300);
  close(project(bounds, heightLimited).bottom - project(bounds, heightLimited).top, 120);
  assert.ok(project(bounds, heightLimited).right - project(bounds, heightLimited).left < 1000);
  const widthLimited = fitDeck(bounds, 150, 1000, 500, 900);
  assert.ok(widthLimited.scale > 1, "A larger usable region must allow enlarging the physical object");
  close(project(bounds, widthLimited).right - project(bounds, widthLimited).left, 150);
});

test("Split increases the closed player from10to18percent within the actual two-leaf booklet boundary", () => {
  // Booklet boundaries are measured unions of both leaves and outer focus.
  for (const [width, windowHeight, bookletLeft] of [[1440, 900, 821.084], [1280, 800, 677.457], [1280, 720, 677.457]]) {
    const height = windowHeight - 72 - 128;
    const result = fitSplitDeck(closed, open, { width, height, bookletLeft });
    const visible = project(closed, result.closed), opened = project(open, result.open);
    const oldWidth = width * .48 - 24, growth = (visible.right - visible.left) / oldWidth;
    assert.ok(growth >= 1.10 - 1e-7 && growth <= 1.18 + 1e-7, `Unexpected growth ${growth}`);
    assert.ok(growth < 1.20);
    assertInside(visible, result.slot); assertInside(opened, result.slot);
    close(visible.bottom, opened.bottom);
    close((visible.top + visible.bottom) / 2, height * .48);
    close(result.slot.centerY, height * .48);
    assert.ok(result.slot.right + result.slot.gap <= bookletLeft + 1e-7);
    close(result.slot.left, width === 1440 ? 16 : 8);
    close(result.slot.gap, width === 1440 ? 24 : 16);
    assert.ok(visible.top >= 24 && opened.top >= 24);
    assert.ok(visible.bottom <= height - 24 && opened.bottom <= height - 24);
  }
});

test("Split interpolates margins, gap and growth only between1280and1440", () => {
  for (const [width, margin, gap, growth] of [[1200, 8, 16, 1.10], [1280, 8, 16, 1.10], [1360, 12, 20, 1.14], [1440, 16, 24, 1.18], [1600, 16, 24, 1.18]]) {
    const result = fitSplitDeck(closed, open, { width, height: 700, bookletLeft: width - 24 });
    const visible = project(closed, result.closed);
    close(result.slot.left, margin); close(result.slot.gap, gap);
    close((visible.right - visible.left) / (width * .48 - 24), growth);
  }
});

test("a narrow booklet slot limits both poses, including below fitDeck's minimum scale", () => {
  for (const bookletLeft of [480, 180, 64, 20]) {
    const result = fitSplitDeck(closed, open, { width: 1280, height: 520, bookletLeft });
    assertInside(project(closed, result.closed), result.slot);
    assertInside(project(open, result.open), result.slot);
    assert.ok(result.slot.right + result.slot.gap <= bookletLeft + 1e-7);
    assert.ok(result.slot.right > result.slot.left);
    close(project(closed, result.closed).bottom, project(open, result.open).bottom);
  }
});

test("Split fits actual silhouettes independently of their transparent scene offsets", () => {
  const translatedClosed = { left: closed.left - 413, right: closed.right - 413, top: closed.top + 91, bottom: closed.bottom + 91 };
  const translatedOpen = { left: open.left + 207, right: open.right + 207, top: open.top - 155, bottom: open.bottom - 155 };
  const original = fitSplitDeck(closed, open, { width: 1440, height: 700, bookletLeft: 821.084 });
  const shifted = fitSplitDeck(translatedClosed, translatedOpen, { width: 1440, height: 700, bookletLeft: 821.084 });
  for (const [before, after] of [[project(closed, original.closed), project(translatedClosed, shifted.closed)], [project(open, original.open), project(translatedOpen, shifted.open)]]) {
    for (const edge of ["left", "right", "top", "bottom"]) close(before[edge], after[edge]);
  }
});

test("Split uses a conservative booklet fallback and clamps vertical extremes without NaN", () => {
  const fallback = fitSplitDeck(closed, open, { width: 1280, height: 520, bookletLeft: null });
  assert.ok(fallback.slot.right + fallback.slot.gap <= 1280 * .54 + 1e-7);
  for (const height of [40, 100, 200, 2000]) {
    const result = fitSplitDeck(closed, open, { width: 1280, height, bookletLeft: 677.457 });
    assertInside(project(closed, result.closed), result.slot);
    assertInside(project(open, result.open), result.slot);
    assert.ok(result.slot.top >= 0 && result.slot.bottom <= height);
  }
  for (const bounds of [{ ...closed, left: NaN }, { ...closed, right: closed.left }, { ...closed, bottom: Infinity }]) {
    const result = fitSplitDeck(bounds, open, { width: NaN, height: 0, bookletLeft: NaN });
    for (const fit of [result.closed, result.open, result.slot]) for (const value of Object.values(fit)) assert.ok(Number.isFinite(value));
  }
});
