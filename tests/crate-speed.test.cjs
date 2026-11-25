const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const albums = [{ id: 'saved-album', name: 'Edición guardada', uri: 'spotify:album:saved-album', images: [], artists: [{ id: 'artist', name: 'Artista' }] }];
const speeds = [];
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const loaded = { exports: {} };
  const dependency = (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.endsWith('useMarqueeBelt')) return { isMarqueeChapterActive: () => true, useMarqueeBelt: (options) => {
      speeds.push(options.speed);
      return { containerRef: React.createRef(), trackRef: React.createRef(), isDragging: false, page: 0, goTo() {}, stepPage() {} };
    } };
    if (name.endsWith('RailContext')) return { useRailActions: () => ({ stop() {}, start() {} }) };
    if (name.endsWith('SpotifyPlayerProvider')) return { useSpotifyPlayer: () => ({ authenticated: true }) };
    if (name.endsWith('collectionClient')) return { useCollectionCache: () => ({ albums, collectionState: 'ready', collectionRetryAt: 0 }), syncCollectionAuth() {}, loadCollection() {} };
    if (name.endsWith('AlbumDetailNavigation')) return { useAlbumDetailActions: () => ({ openAlbum() {} }) };
    if (name.endsWith('bateaAlbums')) return { bateaAlbums: (items) => items };
    if (name.endsWith('JewelFlyout')) return { JewelFlyout: () => null };
    if (name === './CrateShelf') return load('src/components/crate/CrateShelf.tsx');
    if (name === './JewelSpine') return load('src/components/crate/JewelSpine.tsx');
    throw new Error(`Unexpected dependency ${name}`);
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, { module: loaded, exports: loaded.exports, require: dependency, process });
  cache.set(file, loaded.exports);
  return loaded.exports;
}

test('sólo el capítulo Batea solicita 84px/s y todos los consumidores usan el acabado compartido', () => {
  const { CrateChapter } = load('src/components/crate/CrateChapter.tsx');
  const { CrateShelf } = load('src/components/crate/CrateShelf.tsx');
  speeds.length = 0;
  const main = renderToStaticMarkup(React.createElement(CrateChapter));
  assert.deepEqual(speeds, [84]);
  assert.equal((main.match(/data-jewel-material="shared"/g) ?? []).length, 3);
  for (const chapterIndex of [0, 2, 3]) {
    speeds.length = 0;
    const other = renderToStaticMarkup(React.createElement(CrateShelf, { albums, chapterIndex, onSelect() {} }));
    assert.deepEqual(speeds, [60]);
    assert.equal((other.match(/data-jewel-material="shared"/g) ?? []).length, 3);
  }
});
