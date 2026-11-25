const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const loaded = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/artistCaseLayout.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: loaded, exports: loaded.exports, Map, Date });
const { ARTIST_CYCLE_STEP_MS, artistCaseSlots, advanceArtistCycle, compareArtistEditions, fitArtistTitle, wrapArtistIndex } = loaded.exports;

test("un solo disco no se duplica; pocos y muchos mantienen un control canónico por edición visible", () => {
  assert.equal(artistCaseSlots(1, 0, true).length, 1);
  for (const count of [2, 3, 7, 11, 31]) for (let index = 0; index < count; index++) {
    const slots = artistCaseSlots(count, index, true);
    const controls = slots.filter((slot) => !slot.copy);
    assert.equal(controls.length, Math.min(count, 11));
    assert.equal(new Set(controls.map((slot) => slot.at)).size, controls.length);
    assert.equal(slots.length, 11);
    slots.forEach((slot) => assert.equal(slot.at, wrapArtistIndex(index + slot.offset, count)));
  }
});

test("el rebase del ciclo conserva cada posición interior, incluido el último al primero", () => {
  for (const count of [2, 3, 31]) for (let index = 0; index < count; index++) {
    const before = artistCaseSlots(count, index, true);
    const after = artistCaseSlots(count, wrapArtistIndex(index + 1, count), true);
    for (const slot of before.filter((slot) => slot.offset > -5)) {
      const samePosition = after.find((next) => next.offset === slot.offset - 1);
      assert.equal(samePosition.at, slot.at);
      assert.equal(slot.offset - 1, samePosition.offset);
    }
  }
  assert.equal(advanceArtistCycle(.75, ARTIST_CYCLE_STEP_MS / 4).steps, 1);
  assert.equal(advanceArtistCycle(.75, ARTIST_CYCLE_STEP_MS / 4).phase, 0);
  assert.equal(advanceArtistCycle(.4, 0).phase, .4);
});

test("selección mantiene vecinas cronológicas y una única edición por ID", () => {
  for (const count of [1, 3, 31]) for (let index = 0; index < count; index++) {
    const slots = artistCaseSlots(count, index, false);
    assert.equal(slots.every((slot) => !slot.copy), true);
    assert.equal(slots.some((slot) => slot.at === index && slot.offset === 0), true);
    for (let at = 1; at < slots.length; at++) assert.equal(slots[at].at, slots[at - 1].at + 1);
  }
});

test("fechas de edición válidas se ordenan sin fusionar nombres ni inventar fechas", () => {
  const items = [{ id: "missing" }, { id: "invalid", release_date: "1993-02-30" }, { id: "b", release_date: "2001" }, { id: "a", release_date: "1994-05-11" }, { id: "c", release_date: "2001-01-01" }, { id: "edition-2", release_date: "1994-05-11" }];
  const result = items.sort(compareArtistEditions);
  assert.deepEqual(result.map((item) => item.id), ["a", "edition-2", "b", "c", "invalid", "missing"]);
  assert.equal(result.at(-1).release_date, undefined);
});

test("título corto permanece intacto; el largo corta solo entre palabras completas", () => {
  const measure = (text) => text.length;
  assert.equal(fitArtistTitle("Campo magnético", 40, measure), "Campo magnético");
  assert.equal(fitArtistTitle("El mapa de las habitaciones vacías", 15, measure), "El mapa de las…");
  assert.equal(fitArtistTitle("Supercalifragilístico", 8, measure), "…");
  assert.equal(fitArtistTitle("Vértice magnético", 10, measure), "Vértice…");
});
