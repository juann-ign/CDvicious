const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const moduleUnderTest = { exports: {} };
const source = ts.transpileModule(fs.readFileSync("src/lib/lyricsPagination.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(source, { module: moduleUnderTest, exports: moduleUnderTest.exports });
const { paginateLyricsText, splitLyricsPageMargins, lastLyricsSpread, lyricsPageOffset, lyricsSpreadForOffset } = moduleUnderTest.exports;
const measure = (text) => Math.max(1, Math.ceil(text.length / 20)) * 16;

test("páginas impares se recorren por spreads sin duplicar ni saltar líneas", () => {
  for (const count of [1, 2, 3, 4, 5, 9]) {
    const starts = [];
    for (let index = 0; index <= lastLyricsSpread(count); index += 2) starts.push(index);
    const read = starts.flatMap((index) => [index, index + 1]).filter((index) => index < count);
    assert.deepEqual(read, Array.from({ length: count }, (_, index) => index));
    assert.equal(lastLyricsSpread(count) % 2, 0);
  }
});

test("115 líneas y estrofas conservan cada carácter con distintos altos", () => {
  const text = Array.from({ length: 115 }, (_, index) => index % 11 === 0 ? "" : `LINE-${String(index).padStart(3, "0")} original`).join("\n").trim();
  for (const first of [16, 85, 200]) for (const regular of [64, 160, 320]) {
    const pages = paginateLyricsText(text, first, regular, measure);
    assert.equal(pages.join(""), text);
    assert.equal(pages.every((page) => page.length > 0), true);
  }
});

test("una línea más alta que una página se divide sin perder palabras, espacios ni caracteres", () => {
  for (const text of [Array.from({ length: 600 }, (_, index) => `word-${index}`).join(" "), "a".repeat(3000)]) {
    const pages = paginateLyricsText(text, 64, 96, measure);
    assert.equal(pages.length > 1, true);
    assert.equal(pages.join(""), text);
    pages.forEach((page, index) => assert.equal(measure(page) <= (index === 0 ? 64 : 96), true));
  }
});

test("medidas cero o menores que una línea conservan el texto completo para fallback scrollable", () => {
  const text = "FIRST\n\nSECOND\nTHIRD";
  for (const sizes of [[0, 0], [0, 96], [8, 96], [32, 0]]) assert.equal(paginateLyricsText(text, ...sizes, measure).join(""), text);
});

test("los blancos en el límite conservan el original y no ocupan el primer o último renglón", () => {
  const source = "\n\t\nPrimer verso\n\nSegundo verso\n\n\nTercero\n\n";
  const split = splitLyricsPageMargins(source);
  assert.deepEqual({ ...split }, { leading: "\n\t\n", body: "Primer verso\n\nSegundo verso\n\n\nTercero", trailing: "\n\n" });
  assert.equal(split.leading + split.body + split.trailing, source);

  const measureRows = (text) => text ? text.split("\n").length * 16 : 0;
  const pages = Array.from(paginateLyricsText(source, 48, 32, measureRows));
  assert.equal(pages.join(""), source);
  assert.equal(pages.length, 2);
  assert.equal(splitLyricsPageMargins(pages[0]).body, "Primer verso\n\nSegundo verso");
  assert.equal(splitLyricsPageMargins(pages[1]).body, "Tercero");
  assert.equal(pages.every(page => splitLyricsPageMargins(page).body.trim().length > 0), true);
});

test("la medida de página completa evita acumular fracciones y perder el último renglón", () => {
  const measureRows = (text) => Math.round((text ? text.split("\n").length : 0) * 10.4);
  const source = "uno\ndos\ntres\ncuatro\ncinco";
  const pages = Array.from(paginateLyricsText(source, 30, 30, measureRows));
  assert.deepEqual(pages, ["uno\ndos\n", "tres\ncuatro\n", "cinco"]);
  assert.equal(pages.join(""), source);
  assert.equal(pages.every(page => measureRows(splitLyricsPageMargins(page).body) <= 30), true);
});

test("al redimensionar el verso de lectura sigue visible aunque cambie de cara o de spread", () => {
  const before = ["VERSO UNO\n", "VERSO DOS\n", "VERSO TRES\n", "VERSO CUATRO\n", "VERSO CINCO\n", "VERSO SEIS"];
  const anchor = lyricsPageOffset(before, 4);
  const wider = ["VERSO UNO\nVERSO DOS\nVERSO TRES\n", "VERSO CUATRO\nVERSO CINCO\n", "VERSO SEIS"];
  const after = lyricsSpreadForOffset(wider, anchor);
  assert.equal(after, 0); // The verse moved from the third spread to its right face.
  assert.equal(wider.slice(after, after + 2).join("").includes("VERSO CINCO"), true);
  assert.equal(lyricsSpreadForOffset(before, anchor), 4);
  assert.equal(lyricsSpreadForOffset(wider, Number.MAX_SAFE_INTEGER), 2);
  assert.equal(lyricsSpreadForOffset([], anchor), 0);
});
