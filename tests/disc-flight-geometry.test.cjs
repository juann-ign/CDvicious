const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/discFlightGeometry.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module, exports: module.exports, ...globals });
  return module.exports;
}
const geometry = load();
const { discQuadHomography, projectDiscPoint, quadToCssMatrix, discQuadArea, interpolateDiscQuad, sampleDiscFlight, DISC_FLIGHT_DURATION_MS, readDiscQuad } = geometry;
const rectangle = (x, y, width, height) => ({ tl: { x, y }, tr: { x: x + width, y }, bl: { x, y: y + height }, br: { x: x + width, y: y + height } });
const perspective = { tl: { x: 213, y: 130 }, tr: { x: 408, y: 122 }, bl: { x: 200, y: 330 }, br: { x: 437, y: 340 } };
const closePoint = (actual, expected) => { assert.ok(Math.abs(actual.x - expected.x) < 1e-7, `${actual.x} != ${expected.x}`); assert.ok(Math.abs(actual.y - expected.y) < 1e-7, `${actual.y} != ${expected.y}`); };
const closeQuad = (actual, expected) => { for (const key of ["tl", "tr", "bl", "br"]) closePoint(actual[key], expected[key]); };

test("la homografía recupera exactamente las cuatro esquinas con perspectiva y rotación", () => {
  for (const quad of [rectangle(5, 7, 150, 210), perspective, { tl: { x: 440, y: 300 }, tr: { x: 240, y: 300 }, bl: { x: 440, y: 100 }, br: { x: 240, y: 100 } }]) {
    const h = discQuadHomography(quad);
    closePoint(projectDiscPoint(h, 0, 0), quad.tl); closePoint(projectDiscPoint(h, 1, 0), quad.tr);
    closePoint(projectDiscPoint(h, 0, 1), quad.bl); closePoint(projectDiscPoint(h, 1, 1), quad.br);
    const css = quadToCssMatrix(quad, 178.25, 178.25);
    const values = css.slice(9, -1).split(",").map(Number);
    for (const [x, y, point] of [[0, 0, quad.tl], [178.25, 0, quad.tr], [0, 178.25, quad.bl], [178.25, 178.25, quad.br]]) {
      const divisor = values[3] * x + values[7] * y + values[15];
      closePoint({ x: (values[0] * x + values[4] * y + values[12]) / divisor, y: (values[1] * x + values[5] * y + values[13]) / divisor }, point);
    }
  }
});

test("alinear roll de180grados conserva área positiva en todo el viaje", () => {
  const from = { tl: { x: 400, y: 400 }, tr: { x: 200, y: 400 }, bl: { x: 400, y: 200 }, br: { x: 200, y: 200 } };
  const to = { tl: { x: 400, y: 500 }, tr: { x: 650, y: 500 }, bl: { x: 380, y: 620 }, br: { x: 670, y: 620 } };
  closeQuad(interpolateDiscQuad(from, to, 0), from);
  closeQuad(interpolateDiscQuad(from, to, 1), to);
  for (let step = 0; step <= 100; step++) {
    const quad = interpolateDiscQuad(from, to, step / 100);
    assert.ok(discQuadArea(quad) > 10000, `Colapsó en ${step}%`);
    for (const point of Object.values(quad)) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  }
});

test("lectura exige cuatro marcadores reales, sin sustituirlos por un bounding box", () => {
  let rectangles = 0;
  const element = { isConnected: true, getBoundingClientRect() { rectangles++; return { left: 1, top: 2, width: 300, height: 300 }; }, querySelector(selector) { const key = /="(.*?)"/.exec(selector)[1]; return { getBoundingClientRect: () => ({ left: perspective[key].x, top: perspective[key].y }) }; } };
  closeQuad(readDiscQuad(element), perspective);
  assert.equal(rectangles, 0);
  assert.equal(readDiscQuad({ ...element, querySelector() { return null; } }), null);
  assert.equal(readDiscQuad({ ...element, isConnected: false }), null);
  assert.equal(discQuadHomography(rectangle(0, 0, 0, 0)), null);
});

test("fases mecánicas mantienen tapasabiertas al bajar y acoplan al finalizar la bajada", () => {
  const source = rectangle(800, 350, 160, 160), target = rectangle(400, 400, 240, 120), air = rectangle(400, 100, 240, 240);
  closeQuad(sampleDiscFlight(source, target, air, 0).quad, source);
  assert.equal(sampleDiscFlight(source, target, air, 380).phase, "lifting");
  assert.equal(sampleDiscFlight(source, target, air, 1500).phase, "travelling");
  assert.equal(sampleDiscFlight(source, target, air, 2500).phase, "opening");
  const lower = sampleDiscFlight(source, target, air, 3100);
  assert.equal(lower.phase, "lowering"); assert.equal(lower.lidOffset, 135); assert.equal(lower.docked, false);
  const docked = sampleDiscFlight(source, target, air, DISC_FLIGHT_DURATION_MS * .91);
  assert.equal(docked.docked, true); closeQuad(docked.quad, target);
  const end = sampleDiscFlight(source, target, air, DISC_FLIGHT_DURATION_MS);
  assert.equal(end.complete, true); assert.equal(end.lidOffset, 0); closeQuad(end.quad, target);
});

test("salto largo de RAF o pestaña oculta obtiene el estado final por tiempo real", () => {
  const source = perspective, target = rectangle(300, 500, 240, 100), air = rectangle(300, 100, 240, 240);
  const end = sampleDiscFlight(source, target, air, 90_000);
  assert.equal(end.phase, "complete"); assert.equal(end.docked, true); assert.equal(end.complete, true); assert.equal(end.lidOffset, 0);
  closeQuad(end.quad, target);
});

test("resize cambia el destino leído en esa misma fase sin reiniciar su progreso", () => {
  const source = perspective, air = rectangle(300, 100, 240, 240);
  const before = sampleDiscFlight(source, rectangle(300, 500, 240, 100), air, 3650);
  const resized = rectangle(120, 240, 180, 80);
  const after = sampleDiscFlight(source, resized, air, 3650);
  assert.equal(before.progress, after.progress); assert.equal(before.lidOffset, after.lidOffset);
  closeQuad(after.quad, resized);
});

test("probeWebGL2 se cachea y libera inmediatamente el contexto", () => {
  let probes = 0, losses = 0;
  const support = load({ document: { createElement() { probes++; return { getContext(type) { assert.equal(type, "webgl2"); return { getExtension() { return { loseContext() { losses++; } }; } }; } }; } } });
  assert.equal(support.supportsDiscFlightMotion(), true);
  assert.equal(support.supportsDiscFlightMotion(), true);
  assert.equal(probes, 1); assert.equal(losses, 1);
  const unavailable = load({ document: { createElement() { return { getContext() { return null; } }; } } });
  assert.equal(unavailable.supportsDiscFlightMotion(), false);
});
