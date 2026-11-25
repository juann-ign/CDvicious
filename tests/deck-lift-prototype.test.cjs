const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { module, exports: module.exports, require: name => { assert.ok(dependencies[name], `Unexpected dependency: ${name}`); return dependencies[name]; } });
  return module.exports;
}
const geometry = load("src/lib/discFlightGeometry.ts");
const lift = load("src/lib/deckLiftPrototype.ts", { "./discFlightGeometry": geometry });
const { createDeckLiftTimeline, sampleDeckLift, DECK_LIFT_OUT_MS, DECK_LIFT_IN_MS, foregroundDiscQuad, splitDeckLiftLayout, sampleLiftedDisc, airAboveDock, draggedDiscOrientation, returnedDiscOrientation, hasDeckChapterMovement, retreatedDeckTransform } = lift;
const rectangle = (x, y, width, height) => ({ tl: { x, y }, tr: { x: x + width, y }, bl: { x, y: y + height }, br: { x: x + width, y: y + height } });
const closeQuad = (actual, expected) => {
  for (const key of ["tl", "tr", "bl", "br"]) {
    assert.ok(Math.abs(actual[key].x - expected[key].x) < 1e-7);
    assert.ok(Math.abs(actual[key].y - expected[key].y) < 1e-7);
  }
};

test("lift owns one operation: busy and repeated clicks cannot start a second transition", () => {
  const clock = createDeckLiftTimeline();
  assert.equal(clock.start("out", 0, false, false), null);
  const token = clock.start("out", 10, false);
  assert.equal(typeof token, "number");
  assert.equal(clock.start("out", 15, false), null);
  assert.equal(clock.start("in", 15, false), null);
  assert.equal(clock.sample(10 + DECK_LIFT_OUT_MS, token).phase, "free");
  assert.equal(clock.start("out", 2000, false), null);
  const returnToken = clock.start("in", 2000, false);
  assert.equal(clock.start("in", 2010, false), null);
  assert.equal(clock.sample(2000 + DECK_LIFT_IN_MS, returnToken).phase, "docked");
});

test("cancel invalidates late animation frames and allows a fresh dock-to-free cycle", () => {
  const clock = createDeckLiftTimeline();
  const stale = clock.start("out", 0, false);
  assert.equal(clock.sample(500, stale).phase, "lifting");
  clock.cancel();
  assert.equal(clock.phase, "docked");
  assert.equal(clock.sample(1500, stale), null);
  const current = clock.start("out", 2000, false);
  assert.notEqual(current, stale);
  assert.equal(clock.sample(5000, stale), null);
  assert.equal(clock.sample(2000 + DECK_LIFT_OUT_MS, current).phase, "free");
  const recouple = clock.start("in", 4000, false);
  clock.cancel();
  assert.equal(clock.sample(6000, recouple), null);
  assert.equal(clock.phase, "docked");
});

test("reduced motion reaches the final pose immediately in either direction", () => {
  const clock = createDeckLiftTimeline();
  const token = clock.start("out", 100, true);
  const free = clock.sample(100, token);
  assert.equal(free.phase, "free"); assert.equal(free.lid, 135); assert.equal(free.retreat, 1);
  const back = clock.start("in", 200, true);
  const docked = clock.sample(200, back);
  assert.equal(docked.phase, "docked"); assert.equal(docked.lid, 0); assert.equal(docked.retreat, 0);
});

test("the mechanical sequence opens first and closes only after the CD has lowered", () => {
  assert.equal(sampleDeckLift("out", 349).phase, "opening");
  assert.equal(sampleDeckLift("out", 350).phase, "lifting");
  assert.equal(sampleDeckLift("in", 499).phase, "aligning");
  assert.equal(sampleDeckLift("in", 500).phase, "lowering");
  assert.equal(sampleDeckLift("in", 1149).lid, 135);
  assert.equal(sampleDeckLift("in", 1150).phase, "closing");
  for (const direction of ["out", "in"]) {
    for (let time = -100; time <= 2000; time += 5) {
      const sample = sampleDeckLift(direction, time);
      assert.ok(sample.lid >= 0 && sample.lid <= 135);
      assert.ok(sample.progress >= 0 && sample.progress <= 1);
      assert.ok(sample.retreat >= 0 && sample.retreat <= 1);
    }
  }
});

test("foreground framing remains inside the actual useful region including notebook height", () => {
  for (const [width, height] of [[1440, 700], [1280, 600], [1280, 520], [700, 420]]) {
    const frame = { left: 10, top: 70, width, height };
    const quad = foregroundDiscQuad(frame);
    assert.ok(quad.tl.x > frame.left && quad.tr.x < frame.left + width);
    assert.ok(quad.tl.y > frame.top && quad.bl.y < frame.top + height);
    assert.ok(Math.abs((quad.tr.x - quad.tl.x) - (quad.bl.y - quad.tl.y)) < 1e-7);
  }
});

test("lift starts at the real CD quad, rises without a jump, then reaches the upright face", () => {
  const actual = { tl: { x: 530, y: 250 }, tr: { x: 780, y: 250 }, bl: { x: 500, y: 390 }, br: { x: 810, y: 390 } };
  const foreground = foregroundDiscQuad({ left: 0, top: 70, width: 1280, height: 600 });
  closeQuad(sampleLiftedDisc(actual, foreground, 0, 600), actual);
  closeQuad(sampleLiftedDisc(actual, foreground, 1, 600), foreground);
  const before = sampleLiftedDisc(actual, foreground, .22 - 1e-7, 600);
  const after = sampleLiftedDisc(actual, foreground, .22 + 1e-7, 600);
  for (const key of ["tl", "tr", "bl", "br"]) assert.ok(Math.hypot(before[key].x - after[key].x, before[key].y - after[key].y) < .001);
  for (let step = 0; step <= 100; step++) assert.ok(geometry.discQuadArea(sampleLiftedDisc(actual, foreground, step / 100, 600)) > 0);
  const dock = rectangle(400, 350, 220, 120), above = airAboveDock(dock, 600);
  assert.equal(above.tl.x, dock.tl.x); assert.ok(above.tl.y < dock.tl.y);
  assert.equal(above.bl.y - above.tl.y, dock.bl.y - dock.tl.y);
});

test("visual orientation is bounded and returns smoothly without changing its underlying frame", () => {
  const tilted = draggedDiscOrientation(100, -100);
  assert.equal(tilted.x, 35); assert.equal(tilted.y, 40);
  const extreme = draggedDiscOrientation(10000, -10000);
  assert.equal(extreme.x, 50); assert.equal(extreme.y, 65);
  let last = Infinity;
  for (let index = 0; index <= 100; index++) {
    const result = returnedDiscOrientation(tilted, index / 100), amount = Math.abs(result.x) + Math.abs(result.y);
    assert.ok(amount <= last); last = amount;
  }
  const final = returnedDiscOrientation(tilted, 1);
  assert.equal(final.x, 0); assert.equal(final.y, 0);
});

test("native position distinguishes resize and rail stop/start emissions from real navigation without a timer", () => {
  // All three lifecycle operations may report rail-moving=true at position0.
  for (const operation of ["stop", "start", "resize 1440 to1280"]) {
    assert.equal(hasDeckChapterMovement(0, 0), false, operation);
  }
  // Re-read the current chapter origin after layout changes, not its old width.
  assert.equal(hasDeckChapterMovement(1280, 1280), false);
  assert.equal(hasDeckChapterMovement(1440, 1440), false);
  assert.equal(hasDeckChapterMovement(.25, 0), true);
  assert.equal(hasDeckChapterMovement(1280.25, 1280), true);
  assert.equal(hasDeckChapterMovement(-.25, 0), true);
  assert.equal(hasDeckChapterMovement(NaN, 0), false);
});

test("retreated equipment fits the actual open-surface bounds with space below the nav", () => {
  for (const [width, height] of [[1440, 700], [1280, 520]]) {
    const frame = { left: 0, top: 72, width, height }, design = { left: -20, top: -40, width: width * 1.5 };
    const surfaces = { left: 10, right: width - 10, top: -20, bottom: 650 };
    const result = retreatedDeckTransform(frame, design, surfaces, 2), ratio = design.width / 2560;
    const top = design.top + result.y * ratio + (surfaces.top - design.top) * result.scale;
    const bottom = design.top + result.y * ratio + (surfaces.bottom - design.top) * result.scale;
    assert.ok(top >= frame.top + Math.min(24, height * .04) - 1e-7);
    assert.ok(bottom <= frame.top + Math.min(24, height * .04) + height * .25 + 1e-7);
  }
});

const splitFixtures = [
  { frame: { left: 0, top: 72, width: 1920, height: 880 }, slot: { left: 40, top: 140, right: 984, bottom: 938 }, bookletLeft: 1008, minimumDisc: 480 },
  { frame: { left: 0, top: 72, width: 1440, height: 700 }, slot: { left: 32, top: 136, right: 700, bottom: 758 }, bookletLeft: 724, minimumDisc: 360 },
  { frame: { left: 11, top: 72, width: 1280, height: 520 }, slot: { left: 39, top: 128, right: 611, bottom: 578 }, bookletLeft: 635, minimumDisc: 240 },
];
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const boundsOf = (points) => ({ left: Math.min(...points.map(p=>p.x)), right: Math.max(...points.map(p=>p.x)), top: Math.min(...points.map(p=>p.y)), bottom: Math.max(...points.map(p=>p.y)) });
const inside = (inner, outer) => {
  assert.ok(inner.left >= outer.left - 1e-7);
  assert.ok(inner.right <= outer.right + 1e-7);
  assert.ok(inner.top >= outer.top - 1e-7);
  assert.ok(inner.bottom <= outer.bottom + 1e-7);
};

test("Split free CD fits below the equipment, before the entire booklet, with its return latch in a separate lane", () => {
  for (const { frame, slot, bookletLeft, minimumDisc } of splitFixtures) {
    const layout = splitDeckLiftLayout(frame, slot);
    const disc = foregroundDiscQuad(frame, { progress: 1, slot });
    closeQuad(disc, layout.disc);
    const bounds = boundsOf(Object.values(disc));
    inside(bounds, slot);
    inside(layout.equipment, slot);
    inside(layout.dock, slot);
    assert.ok(bounds.top - layout.equipment.bottom >= 18);
    assert.ok(layout.dock.left - bounds.right >= 12);
    assert.ok(bookletLeft - bounds.right >= 24);
    assert.ok(bounds.top >= slot.top); // toolbar is reserved above the slot.
    assert.ok(frame.top + frame.height - bounds.bottom >= 14);
    close(bounds.right - bounds.left, bounds.bottom - bounds.top);
    assert.ok(bounds.right - bounds.left >= minimumDisc);
    close(layout.dock.right - layout.dock.left, 108);
    close(layout.dock.bottom - layout.dock.top, 138);
    close(layout.dockInsetRight, frame.left + frame.width - slot.right + 12);
    close(layout.dockInsetBottom, 14);
  }
});

test("Split retreat inverts the actual rotated, anisotropic placement instead of its AABB width", () => {
  for (const { frame, slot } of splitFixtures) {
    const radians = -1.8 * Math.PI / 180, sx = .43, sy = sx * 1.16;
    const basis = { origin: { x: frame.left + 37, y: frame.top - 35 },
      xx: Math.cos(radians) * sx, xy: Math.sin(radians) * sx,
      yx: -Math.sin(radians) * sy, yy: Math.cos(radians) * sy };
    const original = [160, 1120].flatMap(x=>[0,556].map(y=>({
      x: basis.origin.x + basis.xx * x + basis.yx * y,
      y: basis.origin.y + basis.xy * x + basis.yy * y,
    })));
    const surfaces = boundsOf(original);
    const split = { progress: 1, slot, basis };
    const result = retreatedDeckTransform(frame, { left: -350, top: -160, width: 2900 }, surfaces, 2, split);
    const differentAABB = retreatedDeckTransform(frame, { left: -50, top: 40, width: 1700 }, surfaces, 2, split);
    close(result.x, differentAABB.x); close(result.y, differentAABB.y); close(result.scale, differentAABB.scale);
    const projected = original.map(point=>({
      x: basis.origin.x + basis.xx * result.x + basis.yx * result.y + (point.x - basis.origin.x) * result.scale,
      y: basis.origin.y + basis.xy * result.x + basis.yy * result.y + (point.y - basis.origin.y) * result.scale,
    }));
    const fitted = boundsOf(projected), region = splitDeckLiftLayout(frame, slot).equipment;
    inside(fitted, region);
    close((fitted.left + fitted.right) / 2, (region.left + region.right) / 2);
    close(fitted.bottom, region.bottom);
  }
});

test("Deck geometry stays exact and the measured Split endpoint interpolates continuously through viewport changes", () => {
  const frame = { left: 0, top: 72, width: 1440, height: 700 };
  const slot = splitFixtures[1].slot;
  closeQuad(foregroundDiscQuad(frame), rectangle(503, 289, 434, 434));
  closeQuad(foregroundDiscQuad(frame, { progress: 0, slot }), foregroundDiscQuad(frame));
  const design = { left: -20, top: -40, width: 2160 }, surfaces = { left: 10, top: -20, right: 1430, bottom: 650 };
  const deck = retreatedDeckTransform(frame, design, surfaces, 2);
  const zero = retreatedDeckTransform(frame, design, surfaces, 2, { progress: 0, slot });
  close(deck.x, zero.x); close(deck.y, zero.y); close(deck.scale, zero.scale);
  const target = foregroundDiscQuad(frame, { progress: 1, slot });
  for (let step = 0; step <= 100; step++) {
    const progress = step / 100;
    closeQuad(foregroundDiscQuad(frame, { progress, slot }), geometry.interpolateDiscQuad(foregroundDiscQuad(frame), target, progress));
  }
  let previous = null;
  for (let step = 0; step <= 100; step++) {
    const progress = step / 100;
    const resizingFrame = { ...frame, width: 1440 + 480 * progress, height: 700 + 180 * progress };
    const resizingSlot = { left: 32 + 8 * progress, top: 136 + 4 * progress, right: 700 + 284 * progress, bottom: 758 + 180 * progress };
    const next = foregroundDiscQuad(resizingFrame, { progress, slot: resizingSlot });
    assert.ok(geometry.discQuadArea(next) > 0);
    if (previous) for (const key of ["tl", "tr", "bl", "br"]) assert.ok(Math.hypot(next[key].x - previous[key].x, next[key].y - previous[key].y) < 15);
    previous = next;
  }
});
