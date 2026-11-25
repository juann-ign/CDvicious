const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const moduleUnderTest = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/physicalDeckLayout.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { module: moduleUnderTest, exports: moduleUnderTest.exports });
const { fitDeck } = moduleUnderTest.exports;

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
