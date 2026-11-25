const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const loaded = { exports: {} };
  const requireLocal = (name) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return require(name);
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.endsWith("JewelFlyout")) return { JewelFlyout: () => null };
    const files = {
      "@/lib/artistShelfLayout": "src/lib/artistShelfLayout.ts",
      "@/hooks/useArtistShelfLayout": "src/hooks/useArtistShelfLayout.ts",
      "./useMarqueeBelt": "src/hooks/useMarqueeBelt.ts",
      "@/hooks/useMarqueeBelt": "src/hooks/useMarqueeBelt.ts",
      "./JewelSpine": "src/components/crate/JewelSpine.tsx",
    };
    if (files[name]) return load(files[name]);
    throw new Error(`Unexpected dependency ${name}`);
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { module: loaded, exports: loaded.exports, require: requireLocal, process });
  cache.set(file, loaded.exports);
  return loaded.exports;
}

const { artistShelfLayout, artistShelfPosition, artistShelfInitialOffset, artistShelfEntryComplete, rebaseArtistShelf, ARTIST_SHELF_SPEED, ARTIST_SHELF_REENTRY_SECONDS, ARTIST_SHELF_INITIAL_HOLD_MS } = load("src/lib/artistShelfLayout.ts");
const almost = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const realistic = (count) => artistShelfLayout(count, 1160, 127.6, 232, ARTIST_SHELF_SPEED, -7);

test("uno, pocos y siete discos caben estáticos y quedan centrados; ocho activan el ciclo", () => {
  for (const count of [1, 2, 3, 7]) {
    const layout = realistic(count);
    assert.equal(layout.fit, true);
    const left = artistShelfPosition(0, 0, layout);
    const right = artistShelfPosition(count - 1, 0, layout) + layout.slotWidth;
    almost((left + right) / 2, layout.width / 2);
    for (let index = 0; index < count; index++) almost(artistShelfPosition(index, 10_000, layout), artistShelfPosition(index, 0, layout));
  }
  assert.equal(realistic(8).fit, false);
});

test("el borde visible del primer disco arranca en el medio; paginar y redimensionar conservan el ancla", () => {
  assert.equal(ARTIST_SHELF_INITIAL_HOLD_MS, 1000);
  const ids = Array.from({ length: 20 }, (_, index) => `edition-${index}`);
  const before = realistic(ids.length);
  const initial = artistShelfInitialOffset(before);
  almost(artistShelfPosition(0, initial, before, true) + before.visualLeft, before.width / 2);
  almost(rebaseArtistShelf([], ids, 0, null, before), initial);
  const advanced = initial + 175;
  const left = artistShelfPosition(0, advanced, before, true);
  const appendedIds = Array.from({ length: 40 }, (_, index) => `edition-${index}`);
  const appended = realistic(appendedIds.length);
  const offset = rebaseArtistShelf(ids, appendedIds, advanced, before, appended, ids[0], true);
  almost(artistShelfPosition(0, offset, appended, true), left);
  assert.notEqual(offset, artistShelfInitialOffset(appended));
  const resized = artistShelfLayout(40, 860, 94.6, 172);
  const resizedOffset = rebaseArtistShelf(appendedIds, appendedIds, offset, appended, resized, ids[0], true);
  almost(artistShelfPosition(0, resizedOffset, resized, true) / resized.width, left / appended.width);
  assert.notEqual(resizedOffset, artistShelfInitialOffset(resized));
  assert.equal(artistShelfInitialOffset(realistic(3)), 0);
});

test("la primera secuencia deja la mitad izquierda vacía y no anticipa ninguna edición final", () => {
  for (const count of [8, 40, 250]) {
    const layout = realistic(count), initial = artistShelfInitialOffset(layout);
    assert.ok(initial < 0);
    const positions = Array.from({ length: count }, (_, index) => artistShelfPosition(index, initial, layout, true));
    almost(positions[0] + layout.visualLeft, layout.width / 2);
    assert.ok(positions.every((left) => left + layout.visualLeft >= layout.width / 2));
    for (let index = 1; index < positions.length; index++) almost(positions[index] - positions[index - 1], layout.pitch);
    assert.ok(positions.at(-1) > layout.width);
  }
});

test("el paso de entrada a ciclo es continuo para las vecinas y la primera vuelve después del orden completo", () => {
  for (const count of [8, 40]) {
    const layout = realistic(count), initial = artistShelfInitialOffset(layout);
    const boundary = layout.inset + layout.slotWidth + layout.overscan;
    assert.equal(artistShelfEntryComplete(boundary - .1, layout), false);
    assert.equal(artistShelfEntryComplete(boundary, layout), true);
    for (let index = 1; index < count; index++) almost(artistShelfPosition(index, boundary, layout, true), artistShelfPosition(index, boundary, layout));
    const seen = new Set();
    let firstLeft = false, firstReturned = false;
    for (let offset = initial; offset < initial + layout.length * 2; offset += 4) {
      const entry = !artistShelfEntryComplete(offset, layout);
      for (let index = 0; index < count; index++) {
        const left = artistShelfPosition(index, offset, layout, entry);
        const visible = left + layout.slotWidth > 0 && left < layout.width;
        if (index === 0 && left + layout.slotWidth <= 0) firstLeft = true;
        if (visible) {
          if (index === 0 && firstLeft) { assert.equal(seen.size, count); firstReturned = true; }
          seen.add(index);
        }
      }
      if (firstReturned) break;
    }
    assert.equal(firstReturned, true);
    assert.deepEqual([...seen], Array.from({ length: count }, (_, index) => index));
  }
});

test("cada edición conserva una posición única con ocho y cuarenta discos", () => {
  for (const count of [8, 40, 250]) {
    const layout = realistic(count);
    assert.equal(layout.fit, false);
    assert.ok(layout.length >= count * layout.pitch);
    for (let sample = 0; sample < 80; sample++) {
      const offset = layout.length * sample / 79;
      const positions = Array.from({ length: count }, (_, index) => artistShelfPosition(index, offset, layout));
      assert.equal(new Set(positions.map((value) => value.toFixed(7))).size, count);
      const fullyVisible = positions.filter((left) => left >= 0 && left + layout.slotWidth <= layout.width);
      assert.ok(fullyVisible.length <= 7);
      assert.ok(fullyVisible.length >= 4);
    }
  }
});

test("la misma caja solo se recicla fuera de ambos bordes y después del orden completo", () => {
  for (const count of [8, 40]) {
    const layout = realistic(count);
    const exit = layout.inset + layout.slotWidth + layout.overscan;
    const before = artistShelfPosition(0, exit - .1, layout);
    const after = artistShelfPosition(0, exit + .1, layout);
    assert.ok(before + layout.slotWidth + layout.visualOverflow < 0);
    assert.ok(after - layout.visualOverflow > layout.width);
    assert.ok((after - layout.overscan - layout.width) / ARTIST_SHELF_SPEED >= ARTIST_SHELF_REENTRY_SECONDS - .01);
    assert.ok(layout.length / ARTIST_SHELF_SPEED >= count * layout.pitch / ARTIST_SHELF_SPEED);
  }
});

test("filtrar o añadir ediciones conserva el ID leído y su posición, sin reiniciar la cinta", () => {
  const beforeIds = Array.from({ length: 40 }, (_, index) => `edition-${index}`);
  const nextIds = beforeIds.filter((id) => id !== "edition-3");
  const before = realistic(beforeIds.length), next = realistic(nextIds.length);
  const offset = 817;
  const oldLeft = artistShelfPosition(beforeIds.indexOf("edition-12"), offset, before);
  const rebased = rebaseArtistShelf(beforeIds, nextIds, offset, before, next, "edition-12");
  almost(artistShelfPosition(nextIds.indexOf("edition-12"), rebased, next), oldLeft);
  const appended = ["earlier-edition", ...nextIds, "later-edition"];
  const final = realistic(appended.length);
  const appendedOffset = rebaseArtistShelf(nextIds, appended, rebased, next, final, "edition-12");
  almost(artistShelfPosition(appended.indexOf("edition-12"), appendedOffset, final), oldLeft);
});

test("cambiar ancho conserva la posición relativa del ID y volver a pocos recentra sin movimiento", () => {
  const ids = Array.from({ length: 40 }, (_, index) => `edition-${index}`);
  const before = realistic(40), next = artistShelfLayout(40, 600, 82.5, 150);
  const x = artistShelfPosition(4, 190, before);
  const offset = rebaseArtistShelf(ids, ids, 190, before, next, "edition-4");
  almost(artistShelfPosition(4, offset, next) / next.width, x / before.width);
  assert.equal(rebaseArtistShelf(ids, ids.slice(0, 3), offset, next, realistic(3), "edition-1"), 0);
});

test("el componente real renderiza un solo JewelSpine por ID, también si la fuente repite un registro", () => {
  const { CrateShelf } = load("src/components/crate/CrateShelf.tsx");
  for (const count of [1, 3, 8, 40]) {
    const albums = Array.from({ length: count }, (_, index) => ({ id: `edition-${index}`, name: `Edición ${index}`, artists: [{ id: "artist", name: "Artista" }], images: [], uri: `spotify:album:edition-${index}` }));
    const html = renderToStaticMarkup(React.createElement(CrateShelf, { mode: "ordered", albums: [...albums, albums[0]], onSelect() {} }));
    const ids = [...html.matchAll(/data-batea-album-id="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(ids.length, count, html.slice(0, 1800));
    assert.equal(new Set(ids).size, count);
    assert.deepEqual(ids, albums.map(({ id }) => id));
    if (count <= 3) {
      assert.equal(html.includes('aria-label="Desplazamiento automático"'), false);
      assert.equal(html.includes('aria-label="Página anterior"'), false);
      assert.equal(html.includes('aria-label="Página siguiente"'), false);
    }
  }
});

test("Batea, Artista y Next listen comparten el marco metálico, la presentación y el molde de cada caja", () => {
  const { CrateShelf } = load("src/components/crate/CrateShelf.tsx");
  const albums = Array.from({ length: 3 }, (_, index) => ({ id: `edition-${index}`, name: `Disco ${index}`, artists: [{ id: "artist", name: "Artista" }], images: [], uri: `spotify:album:edition-${index}` }));
  const props = { albums, onSelect() {} };
  const main = renderToStaticMarkup(React.createElement(CrateShelf, props));
  const artist = renderToStaticMarkup(React.createElement(CrateShelf, { ...props, mode: "ordered", startAt: "center" }));
  const listening = renderToStaticMarkup(React.createElement(CrateShelf, { ...props, mode: "ordered", startAt: "leading", chapterIndex: 0 }));
  for (const [html, count] of [[main, 9], [artist, albums.length], [listening, albums.length]]) {
    assert.match(html, /data-shelf-presentation="metal"/);
    assert.match(html, /class="stage metalRack"/);
    assert.equal((html.match(/data-shelf-viewport=/g) ?? []).length, 1);
    assert.equal((html.match(/data-shelf-track=/g) ?? []).length, 1);
    assert.equal((html.match(/data-batea-album-id=/g) ?? []).length, count);
    assert.equal((html.match(/data-jewel-material="shared"/g) ?? []).length, count);
    assert.equal((html.match(/data-jewel-detail="booklet-mold"/g) ?? []).length, count);
    assert.equal((html.match(/class="outerRim rimVertical"/g) ?? []).length, count);
    assert.equal((html.match(/class="bottomRim rimHorizontal"/g) ?? []).length, count);
  }
});

test("Next listen fills the opening shelf from its leading edge without wrapping any editions into view", () => {
  const layout = artistShelfLayout(18, 780, 92, 154, ARTIST_SHELF_SPEED, -8, "leading");
  const offset = artistShelfInitialOffset(layout);
  assert.ok(!layout.fit);
  assert.equal(artistShelfPosition(0, offset, layout, true) + layout.visualLeft, 24);
  assert.ok(artistShelfPosition(17, offset, layout, true) > layout.width);
});
