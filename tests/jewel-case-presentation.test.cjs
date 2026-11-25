const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

let tracks = [];
let requests = [];
const rail = React.createContext(null);
const code = ts.transpileModule(fs.readFileSync('src/components/crate/JewelCasePresentation.tsx', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const loaded = { exports: {} };
vm.runInNewContext(code, { exports: loaded.exports, module: loaded, require: (name) => {
  if (name === 'react' || name === 'react/jsx-runtime') return require(name);
  if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
  if (name === 'next/image') return { __esModule: true, default: ({ src, alt }) => React.createElement('img', { src, alt }) };
  if (name.endsWith('RailContext')) return { RailContext: rail };
  if (name.endsWith('useAlbumTracks')) return { useAlbumTracks: (id, enabled) => {
    requests.push({ id, enabled });
    return { tracks, loading: false, error: false, errorMessage: null, canRetry: true, retry() {} };
  } };
  if (name.endsWith('useDiscSurfaceDrag')) return { useDiscSurfaceDrag: () => ({ rotation: 0, isDragging: false, cancel() {}, pointerHandlers: {} }) };
  throw new Error(`Unexpected dependency: ${name}`);
} });
const { JewelCasePresentation } = loaded.exports;
const album = { id: 'case-fixture', name: 'Álbum de prueba', artists: [{ id: 'artist', name: 'Artista' }], images: [], uri: 'spotify:album:case-fixture' };
const render = (open) => renderToStaticMarkup(React.createElement(JewelCasePresentation, {
  album, open, onOpen() {}, onClose() {}, discRef: React.createRef(),
}));

test('la caja cerrada no solicita TOC ni duplica metadatos o placeholders de la ficha', () => {
  requests = []; tracks = [];
  const html = render(false);
  assert.deepEqual(requests, [{ id: album.id, enabled: false }]);
  assert.equal(html.includes('RELEASE DATA'), false);
  assert.equal(html.includes('closedMeta'), false);
  assert.equal(html.includes('closedMetaCode'), false);
  assert.ok(html.includes('data-testid="jewel-case-open-target"'));
  assert.ok(html.includes('data-case-edge="open"'));
  assert.equal((html.match(/data-jewel-material="shared"/g) ?? []).length, 1);
  assert.equal((html.match(/data-jewel-detail="booklet-mold"/g) ?? []).length, 2);
});

test('una edición larga conserva orden DOM, títulos completos y duraciones en ambas columnas', () => {
  tracks = Array.from({ length: 64 }, (_, position) => ({
    position, id: `track-${position}`, name: `Pista extraordinariamente larga ${position + 1}`,
    duration_ms: 183000, track_number: position + 1, disc_number: 1,
  }));
  requests = [];
  const html = render(true);
  assert.deepEqual(requests, [{ id: album.id, enabled: true }]);
  assert.ok(html.includes('data-track-layout="columns"'));
  assert.ok(html.includes('--track-rows:32'));
  const rows = [...html.matchAll(/<li[^>]*aria-label="(\d+)\. ([^"]+)"/g)].map((match) => ({ index: Number(match[1]), label: match[2] }));
  assert.deepEqual(rows.map(({ index }) => index), tracks.map((_, index) => index + 1));
  for (const track of tracks) assert.ok(html.includes(`title="${track.name}"`));
  assert.equal((html.match(/class="trackDurationDense"/g) ?? []).length, tracks.length);
  assert.ok(rows.every(({ label }) => label.endsWith(', 3:03')));
});

test('cada borde de cierre tiene nombre propio y el CD mantiene un único slider con sus cuatro anclas', () => {
  tracks = [];
  const html = render(true);
  assert.equal((html.match(/aria-label="Cerrar caja de CD"/g) ?? []).length, 1);
  assert.equal((html.match(/aria-label="Cerrar caja desde el borde derecho"/g) ?? []).length, 1);
  assert.equal((html.match(/role="slider"/g) ?? []).length, 1);
  for (const corner of ['tl', 'tr', 'bl', 'br']) assert.equal((html.match(new RegExp(`data-disc-pose-corner="${corner}"`, 'g')) ?? []).length, 1);
});
