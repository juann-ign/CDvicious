const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const moduleUnderTest = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/physicalDeckLayout.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { module: moduleUnderTest, exports: moduleUnderTest.exports });
const { fitDeck, fitListeningDeck, fitSplitDeck, fitStereoDeck, fitSplitStereoDeck, fitRetreatedStereoDeck, fitListeningStereoDeck } = moduleUnderTest.exports;

// Projected silhouette fixtures, not the transparent 1280×660 design frame.
// The open fixture includes the lateral lids and the raised CD envelope.
const closed = { left: 168, top: 216, right: 1112, bottom: 556 };
const open = { left: 8, top: 0, right: 1272, bottom: 556 };
const viewports = [[1440, 900], [1280, 800], [1280, 720]];
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const project = (bounds, fit, rotation = 0) => {
  const radians = rotation * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
  const corners = [bounds.left, bounds.right].flatMap(left =>
    [bounds.top, bounds.bottom].map(top => {
      const x = left * fit.scale, y = top * (fit.scaleY ?? fit.scale);
      return { x: fit.x + x * cos - y * sin, y: fit.y + x * sin + y * cos };
    }));
  return { left: Math.min(...corners.map(({ x }) => x)), right: Math.max(...corners.map(({ x }) => x)),
    top: Math.min(...corners.map(({ y }) => y)), bottom: Math.max(...corners.map(({ y }) => y)) };
};
function assertInside(rect, slot) {
  assert.ok(rect.left >= slot.left - 1e-7, `Left edge ${rect.left} outside ${slot.left}`);
  assert.ok(rect.right <= slot.right + 1e-7, `Right edge ${rect.right} outside ${slot.right}`);
  assert.ok(rect.top >= slot.top - 1e-7, `Top edge ${rect.top} outside ${slot.top}`);
  assert.ok(rect.bottom <= slot.bottom + 1e-7, `Bottom edge ${rect.bottom} outside ${slot.bottom}`);
}

test("stereo Deck uses 58% of the viewport below center, with smaller symmetric speakers behind its corners", () => {
  for (const [width, windowHeight, speakerHeight] of [[1920, 1080, 370], [1440, 900, 300], [1280, 800, 260], [1280, 720, 228]]) {
    const height = windowHeight - 200;
    const result = fitStereoDeck(closed, open, width, height);
    const player = project(closed, result.closed), expanded = project(open, result.open), pair = result.speakers;
    close(player.right - player.left, width * .58);
    close((player.left + player.right) / 2, width / 2);
    close((player.top + player.bottom) / 2, height * .64);
    close(pair.height, speakerHeight); close(pair.width, pair.height * .48);
    close(pair.leftX + pair.rightX, width);
    const left = { left: pair.leftX - pair.width / 2, right: pair.leftX + pair.width / 2, top: pair.top, bottom: pair.top + pair.height };
    const right = { left: pair.rightX - pair.width / 2, right: pair.rightX + pair.width / 2, top: pair.top, bottom: pair.top + pair.height };
    assertInside(left, { left: width * .08, right: width / 2, top: 64, bottom: height - 32 });
    assertInside(right, { left: width / 2, right: width * .92, top: 64, bottom: height - 32 });
    close(left.right - player.left, pair.width * .44);
    close(player.right - right.left, pair.width * .44);
    assert.ok(left.top < player.top && left.bottom < player.bottom);
    assert.ok(left.right < player.left + (player.right - player.left) * .08);
    assertInside(expanded, { left: 24, right: width - 24, top: 24, bottom: height - 32 });
    // The model and destination plane do not shift or scale when lids open.
    for (const field of ["x", "y", "scale"]) close(result.closed[field], result.open[field]);
  }
});

test("stereo layout is independent of transparent scene offsets and contracts for short windows without clipping the open CD", () => {
  const delta = { x: 281, y: -93 };
  const shifted = bounds => ({ left: bounds.left + delta.x, right: bounds.right + delta.x, top: bounds.top + delta.y, bottom: bounds.bottom + delta.y });
  for (const [width, height] of [[1920, 880], [1440, 700], [1280, 400]]) {
    const original = fitStereoDeck(closed, open, width, height);
    const translated = fitStereoDeck(shifted(closed), shifted(open), width, height);
    for (const [bounds, transformed, fitName] of [[closed, shifted(closed), "closed"], [open, shifted(open), "open"]]) {
      const before = project(bounds, original[fitName]), after = project(transformed, translated[fitName]);
      for (const edge of ["left", "right", "top", "bottom"]) close(before[edge], after[edge]);
      assertInside(before, { left: 24, right: width - 24, top: 18, bottom: height - 24 });
    }
    for (const key of ["height", "width", "leftX", "rightX", "top"]) close(original.speakers[key], translated.speakers[key]);
  }
});

test("Next listen aligns its shelf to the visible equipment and fits both in the useful height", () => {
  const approved = [
    [1920, 1080, 1000, 198],
    [1440, 900, 794.0705882352942, 170.72517647058825],
    [1280, 800, 677.4588235294118, 143.2],
    [1280, 720, 584.169411764706, 103.04],
  ];
  for (const [width, windowHeight, approvedWidth, approvedCaseSize] of approved) {
    const height = windowHeight - 72 - 128;
    const listen = fitListeningDeck(closed, width, height);
    const visible = project(closed, listen);
    close(visible.right - visible.left, listen.shelfWidth);
    close((visible.right + visible.left) / 2, width / 2);
    close(listen.shelfWidth, approvedWidth);
    close(listen.caseSize, approvedCaseSize);
    assert.ok(visible.top >= 12);
    assert.ok(listen.shelfTop - visible.bottom >= 36);
    assert.ok(listen.caseSize >= 100);
    assert.ok(listen.shelfTop + listen.shelfHeight <= height + 1e-7);
    // Include the metal stage and all controls, not the previous transparent
    // shelf's smaller chrome. Width and CD size stay on the approved geometry.
    close(listen.shelfHeight, listen.caseSize + listen.shelfHeadroom + 2 * listen.shelfPadding + 55);
  }
});

test("Next listen metal leaves physical grab space above hovered cases and below the deepest acrylic rim", () => {
  // Actual CSS silhouette probes at the two extreme tilts, saved independently
  // of the layout helper. The largest supported case is the limiting bottom.
  const silhouettes = [
    { size: 103.04, up: 13.570, down: 11.471 },
    { size: 143.2, up: 13.685, down: 17.914 },
    { size: 170.72517647058825, up: 13.414, down: 23.040 },
    { size: 198, up: 14.908, down: 28.702 },
  ];
  for (const [index, [width, windowHeight]] of [[1280, 720], [1280, 800], [1440, 900], [1920, 1080]].entries()) {
    const fit = fitListeningDeck(closed, width, windowHeight - 200);
    const physical = silhouettes[index];
    close(fit.caseSize, physical.size);
    const topClearance = fit.shelfHeadroom + fit.shelfPadding - fit.shelfTrackBottom - 1 - 8 - physical.up;
    const bottomClearance = fit.shelfTrackBottom + fit.shelfPadding + 1 - 11 - physical.down;
    assert.ok(topClearance >= 18, `Upper grip has only ${topClearance}px`);
    assert.ok(bottomClearance >= 18, `Lower grip has only ${bottomClearance}px`);
  }
});

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

test("Split insets and tilts both poses within the actual two-leaf booklet boundary", () => {
  // Booklet boundaries are measured unions of both leaves and outer focus.
  for (const [width, windowHeight, bookletLeft] of [[1440, 900, 821.084], [1280, 800, 677.457], [1280, 720, 677.457]]) {
    const height = windowHeight - 72 - 128;
    const result = fitSplitDeck(closed, open, { width, height, bookletLeft });
    const visible = project(closed, result.closed, result.rotation), opened = project(open, result.open, result.rotation);
    const oldWidth = width * .48 - 24, growth = (visible.right - visible.left) / oldWidth;
    assert.ok(growth >= 1.07 && growth <= 1.18 + 1e-7, `Unexpected growth ${growth}`);
    assert.ok(result.rotation < -1 && result.rotation > -3);
    assertInside(visible, result.slot); assertInside(opened, result.slot);
    close(visible.bottom, opened.bottom);
    close((visible.top + visible.bottom) / 2, height * .48);
    assert.ok(visible.bottom - visible.top >= (closed.bottom - closed.top) * result.closed.scale * 1.15);
    close(result.slot.centerY, height * .48);
    assert.ok(result.slot.right + result.slot.gap <= bookletLeft + 1e-7);
    close(result.slot.left, width * .022);
    close(result.slot.gap, width === 1440 ? 24 : 16);
    assert.ok(visible.top >= 24 && opened.top >= 24);
    assert.ok(visible.bottom <= height - 24 && opened.bottom <= height - 24);
  }
});

test("Split reserves a proportional left margin and caps the width target", () => {
  for (const [width, margin, gap, growth] of [[1000, 24, 16, 1.10], [1280, 28.16, 16, 1.10], [1360, 29.92, 20, 1.14], [1440, 31.68, 24, 1.18], [1920, 40, 24, 1.18]]) {
    const result = fitSplitDeck(closed, open, { width, height: 700, bookletLeft: width - 24 });
    const visible = project(closed, result.closed, result.rotation);
    close(result.slot.left, margin); close(result.slot.gap, gap);
    close((visible.right - visible.left) / (width * .48 - 24), growth);
  }
});

test("a narrow booklet slot limits both poses, including below fitDeck's minimum scale", () => {
  for (const bookletLeft of [480, 180, 64, 20]) {
    const result = fitSplitDeck(closed, open, { width: 1280, height: 520, bookletLeft });
    assertInside(project(closed, result.closed, result.rotation), result.slot);
    assertInside(project(open, result.open, result.rotation), result.slot);
    assert.ok(result.slot.right + result.slot.gap <= bookletLeft + 1e-7);
    assert.ok(result.slot.right > result.slot.left);
    close(project(closed, result.closed, result.rotation).bottom, project(open, result.open, result.rotation).bottom);
  }
});

test("Split fits actual silhouettes independently of their transparent scene offsets", () => {
  const translatedClosed = { left: closed.left - 413, right: closed.right - 413, top: closed.top + 91, bottom: closed.bottom + 91 };
  const translatedOpen = { left: open.left + 207, right: open.right + 207, top: open.top - 155, bottom: open.bottom - 155 };
  const original = fitSplitDeck(closed, open, { width: 1440, height: 700, bookletLeft: 821.084 });
  const shifted = fitSplitDeck(translatedClosed, translatedOpen, { width: 1440, height: 700, bookletLeft: 821.084 });
  for (const [before, after] of [[project(closed, original.closed, original.rotation), project(translatedClosed, shifted.closed, shifted.rotation)], [project(open, original.open, original.rotation), project(translatedOpen, shifted.open, shifted.rotation)]]) {
    for (const edge of ["left", "right", "top", "bottom"]) close(before[edge], after[edge]);
  }
});

test("Split uses a conservative booklet fallback and clamps vertical extremes without NaN", () => {
  const fallback = fitSplitDeck(closed, open, { width: 1280, height: 520, bookletLeft: null });
  assert.ok(fallback.slot.right + fallback.slot.gap <= 1280 * .54 + 1e-7);
  for (const height of [40, 100, 200, 2000]) {
    const result = fitSplitDeck(closed, open, { width: 1280, height, bookletLeft: 677.457 });
    assertInside(project(closed, result.closed, result.rotation), result.slot);
    assertInside(project(open, result.open, result.rotation), result.slot);
    assert.ok(result.slot.top >= 0 && result.slot.bottom <= height);
  }
  for (const bounds of [{ ...closed, left: NaN }, { ...closed, right: closed.left }, { ...closed, bottom: Infinity }]) {
    const result = fitSplitDeck(bounds, open, { width: NaN, height: 0, bookletLeft: NaN });
    for (const fit of [result.closed, result.open, result.slot]) for (const value of Object.values(fit)) assert.ok(Number.isFinite(value));
  }
});

function speakerRects(pair) {
  return [pair.leftX, pair.rightX].map(center => ({ left: center - pair.width / 2, right: center + pair.width / 2,
    top: pair.top, bottom: pair.top + pair.height }));
}

test("Split stereo preserves the booklet slot and center while reserving a visible cabinet at each side", () => {
  for (const [width, height, bookletLeft] of [[1920, 880, 1110], [1440, 700, 821.084], [1280, 600, 677.457], [1280, 520, 677.457]]) {
    const frame = { width, height, bookletLeft };
    const approved = fitSplitDeck(closed, open, frame);
    const stereo = fitSplitStereoDeck(closed, open, frame);
    const player = project(closed, stereo.closed, stereo.rotation);
    const opened = project(open, stereo.open, stereo.rotation);
    close(stereo.closed.scale / approved.closed.scale, .88);
    close(stereo.slot.left, approved.slot.left);
    close(stereo.slot.right, approved.slot.right);
    close(stereo.slot.centerY, approved.slot.centerY);
    assertInside(player, stereo.slot); assertInside(opened, stereo.slot);
    const [left, right] = speakerRects(stereo.speakers);
    assert.ok(stereo.speakers.height >= 135 && stereo.speakers.height <= 260);
    assertInside(left, stereo.slot); assertInside(right, stereo.slot);
    assert.ok(left.top < player.top && right.top < player.top);
    close(left.right - player.left, stereo.speakers.width * .6);
    close(player.right - right.left, stereo.speakers.width * .6);
    assert.ok(right.right + stereo.slot.gap <= bookletLeft + 1e-7);
    assert.ok(left.bottom <= player.bottom - 12 + 1e-7);
  }
});

test("raised Deck and Split keep their foreground disc and lower camera edge clear of the cabinets", () => {
  for (const [player, region, split] of [
    [{ left: 551, top: 25, right: 1369, bottom: 245 }, { left: 40, top: 24, right: 1880, bottom: 260 }, false],
    [{ left: 40, top: 78, right: 620, bottom: 254 }, { left: 32, top: 76, right: 628, bottom: 278 }, true],
    [{ left: 51, top: 68, right: 432, bottom: 202 }, { left: 28, top: 65, right: 478, bottom: 218 }, true],
  ]) {
    const result = fitRetreatedStereoDeck(player, region, split);
    if (!split) close(result.scale, 1);
    assert.ok(result.scale >= .85 && result.scale <= 1);
    assert.ok(result.speakers.height >= 100);
    const [left, right] = speakerRects(result.speakers);
    assertInside(left, region); assertInside(right, region);
    assert.ok(left.bottom <= player.bottom - 8 + 1e-7);
    const center = (player.left + player.right) / 2;
    close((result.speakers.leftX + result.speakers.rightX) / 2, center);
    const playerWidth = (player.right - player.left) * result.scale;
    assert.ok(left.left < center - playerWidth / 2);
    assert.ok(right.right > center + playerWidth / 2);
  }
});
test("Next listen stereo joins the corners without moving the player or rack at desktop and notebook heights", () => {
  for (const [width, height] of [[1920, 880], [1440, 700], [1280, 600], [1280, 520]]) {
    const approved = fitListeningDeck(closed, width, height);
    const fitted = fitListeningStereoDeck(closed, width, height);
    for (const key of Object.keys(approved)) close(fitted[key], approved[key]);
    const player = project(closed, fitted);
    const [left, right] = speakerRects(fitted.speakers);
    assert.ok(fitted.speakers.height >= 135 && fitted.speakers.height <= 260);
    close(fitted.speakers.width, fitted.speakers.height * .48);
    close(left.right - player.left, fitted.speakers.width * .44);
    close(player.right - right.left, fitted.speakers.width * .44);
    close(fitted.speakers.leftX + fitted.speakers.rightX, width);
    const slot = { left: 24, right: width - 24, top: 12, bottom: player.bottom - 12 };
    assertInside(left, slot); assertInside(right, slot);
    // At every height the band above the rack and the secondary controls stays clear.
    assert.ok(fitted.shelfTop - left.bottom >= 48 - 1e-7);
    assert.ok(fitted.shelfTop - right.bottom >= 48 - 1e-7);
    assert.ok(left.left >= width * .10 + 130 - 1e-7, `Left speaker conflicts with the toolbar at ${width}x${height}`);
    assert.ok(right.right <= width * .90 - 130 + 1e-7, `Right speaker conflicts with the toolbar at ${width}x${height}`);
  }
});