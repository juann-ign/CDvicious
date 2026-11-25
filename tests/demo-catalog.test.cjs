const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function demoRuntime() {
  const modules = new Map();
  const network = [];
  const neverLive = async () => { throw new Error("The demo must not use a real Spotify session."); };
  const next = { NextResponse: { json: (value, options) => Response.json(value, options) } };
  const overrides = {
    "next/server": next,
    "@/lib/session": { getValidAccessToken: neverLive, getSession: neverLive },
    "@/lib/spotify": { fetchNowPlaying: neverLive, SpotifyApiError: class extends Error {} },
    "@/lib/catalogServer": {
      CATALOG_PAGE_SIZE: 10,
      catalogOffset: (value) => Number(value ?? 0),
      nextCatalogOffset: (offset, length, total) => offset + length < total ? offset + length : null,
      catalogRequest: neverLive,
    },
  };
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    if (path.extname(file) === ".json") {
      const value = JSON.parse(fs.readFileSync(file, "utf8"));
      modules.set(file, value);
      return value;
    }
    const module = { exports: {} };
    modules.set(file, module.exports);
    const javascript = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const requireLocal = (name) => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      const source = name.startsWith("@/") ? path.join(process.cwd(), "src", name.slice(2))
        : name.startsWith(".") ? path.resolve(path.dirname(file), name) : null;
      return source ? load(source + (path.extname(source) ? "" : ".ts")) : require(name);
    };
    vm.runInNewContext(javascript, {
      module, exports: module.exports, require: requireLocal,
      URL, URLSearchParams, Response, Request, AbortController, AbortSignal,
      Date, setTimeout, clearTimeout, setInterval, clearInterval, console,
      process: { env: { NEXT_PUBLIC_SPOTIFY_MOCK: "1" } },
      fetch: async (url) => { network.push(String(url)); throw new Error("Mock mode must never fetch a lyrics provider."); },
    }, { filename: file });
    modules.set(file, module.exports);
    return module.exports;
  }
  return { load, network };
}

function lyricsRequest(track) {
  return new Request(`http://local/api/lyrics?${new URLSearchParams({
    artist: track.artists[0].name,
    title: track.name,
    album: track.album.name,
    duration: String(track.duration_ms / 1000),
  })}`);
}

test("mock de letras: una pista desconocida no recibe letra genérica ni consulta proveedores", async () => {
  const run = demoRuntime();
  const route = run.load("src/app/api/lyrics/route.ts");
  const response = await route.GET(new Request("http://local/api/lyrics?artist=Desconocido&title=Sin%20registro&album=Otro&duration=180"));
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.status, "unavailable");
  assert.equal(result.lyrics, null);
  assert.equal(result.provenance.provider, "demo");
  assert.equal(run.network.length, 0);
});

test("siguiente y anterior conservan el álbum de Explorar artista que no pertenece a Colección", async () => {
  const run = demoRuntime();
  const catalog = run.load("src/mocks/artistCatalog.ts");
  const album = catalog.mockArtistReleases("demo-vertice", "album")[4];
  const store = run.load("src/lib/mockSpotifyStore.ts");
  store.loadMockAlbum(album);
  const first = store.getSnapshot().data.track;
  assert.equal(first.album.id, album.id);
  await store.mockSpotifyPlayer.resume();
  await store.mockSpotifyPlayer.nextTrack();
  const second = store.getSnapshot().data.track;
  assert.equal(second.album.id, album.id);
  assert.notEqual(second.id, first.id);
  await store.mockSpotifyPlayer.previousTrack();
  assert.equal(store.getSnapshot().data.track.id, first.id);
  assert.equal(store.getSnapshot().data.isPlaying, true);
});

const listeningAlbums = [
  ["mock-album-01", "demo-vertice"],
  ["demo-vertice-album-0", "demo-vertice"],
  ["mock-album-02", "demo-satelite"],
  ["demo-satelite-album-1", "demo-satelite"],
  ["mock-album-03", "demo-inerciales"],
  ["demo-inerciales-album-0", "demo-inerciales"],
];

test("seis álbumes demo conservan identidad en Colección, Explorar artista y ficha de edición", async () => {
  const run = demoRuntime();
  const demo = run.load("src/mocks/demoCatalog.ts");
  const collection = run.load("src/mocks/collection.json");
  const catalog = run.load("src/mocks/artistCatalog.ts");
  const meta = run.load("src/app/api/album/[id]/release-meta/route.ts");
  for (const [id] of listeningAlbums) {
    const saved = collection.find((album) => album.id === id);
    assert.ok(saved, `Missing collection album ${id}`);
    const release = catalog.mockArtistReleases(saved.artists[0].id, "album").find((album) => album.id === id);
    const album = demo.getMockAlbum(id);
    assert.ok(release, `Missing artist album ${id}`);
    for (const field of ["id", "name", "uri", "release_date"]) {
      assert.equal(album[field], saved[field], `${id}: collection ${field}`);
      assert.equal(release[field], saved[field], `${id}: artist ${field}`);
    }
    assert.equal(release.artists[0].name, saved.artists[0].name);
    assert.equal(album.images[0].url, saved.images[0].url);
    const response = await meta.GET(new Request(`http://local/api/album/${id}/release-meta`), { params: Promise.resolve({ id }) });
    const details = await response.json();
    assert.equal(details.year, album.release_date.slice(0, 4));
    assert.equal(details.label, album.label);
    assert.deepEqual(details.tags, Array.from(album.genres));
  }
  assert.equal(run.network.length, 0);
});

test("tracklist y Now Playing usan los mismos IDs, orden, duración y metadatos durante cada álbum", async () => {
  const run = demoRuntime();
  const demo = run.load("src/mocks/demoCatalog.ts");
  const route = run.load("src/app/api/album/[id]/tracks/route.ts");
  const store = run.load("src/lib/mockSpotifyStore.ts");
  const seen = new Set();
  for (const [id] of listeningAlbums) {
    const album = demo.getMockAlbum(id);
    const response = await route.GET(new Request(`http://local/api/album/${id}/tracks`), { params: Promise.resolve({ id }) });
    const { tracks } = await response.json();
    assert.equal(tracks.length, 10);
    store.loadMockAlbum(album);
    await store.mockSpotifyPlayer.resume();
    for (let index = 0; index < tracks.length; index++) {
      const track = tracks[index];
      const current = store.getSnapshot().data;
      assert.equal(track.id, `mock-track-${id}-${index + 1}`);
      assert.equal(track.track_number, index + 1);
      assert.equal(seen.has(track.id), false);
      seen.add(track.id);
      assert.equal(current.track.id, track.id);
      assert.equal(current.track.name, track.name);
      assert.equal(current.durationMs, track.duration_ms);
      assert.equal(current.track.duration_ms, track.duration_ms);
      assert.equal(current.track.album.id, id);
      assert.equal(current.track.album.name, album.name);
      assert.equal(current.track.artists[0].name, album.artists[0].name);
      assert.ok(Number.isInteger(track.duration_ms) && track.duration_ms > 0);
      if (index + 1 < tracks.length) await store.mockSpotifyPlayer.nextTrack();
    }
  }
  assert.equal(seen.size, 60);
  const initial = await (await run.load("src/app/api/now-playing/route.ts").GET()).json();
  const first = demo.getMockTracks("mock-album-01")[0];
  assert.equal(initial.track.id, first.id);
  assert.equal(initial.track.name, first.name);
  assert.equal(initial.durationMs, first.duration_ms);
  assert.equal(initial.track.album.id, "mock-album-01");
  assert.equal(run.network.length, 0);
});

test("las 60 pistas tienen resultado explícito y cada letra disponible comienza con una línea distinta", async () => {
  const run = demoRuntime();
  const demo = run.load("src/mocks/demoCatalog.ts");
  const route = run.load("src/app/api/lyrics/route.ts");
  const firstLines = new Set();
  const lengths = [];
  const lineCounts = [];
  const states = new Map();
  const specialStates = {
    "mock-track-mock-album-01-4": "instrumental",
    "mock-track-mock-album-01-5": "unavailable",
    "mock-track-demo-satelite-album-1-5": "instrumental",
    "mock-track-mock-album-03-5": "unavailable",
  };
  for (const [id] of listeningAlbums) {
    const tracks = demo.getMockTracks(id);
    for (const track of tracks) {
      const response = await route.GET(lyricsRequest(track));
      const result = await response.json();
      assert.equal(response.status, 200);
      assert.equal(result.provenance.provider, "demo");
      assert.equal(result.status, specialStates[track.id] ?? "available", track.id);
      states.set(result.status, (states.get(result.status) ?? 0) + 1);
      if (result.status === "available") {
        assert.equal(typeof result.lyrics, "string");
        assert.ok(result.lyrics.trim().length > 0, track.id);
        const firstLine = result.lyrics.split("\n")[0];
        assert.equal(firstLines.has(firstLine), false, `${track.id}: repeated first line ${firstLine}`);
        assert.equal(result.lyrics.includes("[LETRA FICTICIA / SESIÓN MOCK]"), false);
        firstLines.add(firstLine);
        lengths.push(result.lyrics.length);
        lineCounts.push(result.lyrics.split("\n").length);
      } else {
        assert.equal(result.lyrics, null);
      }
    }
  }
  assert.equal([...states.values()].reduce((sum, value) => sum + value, 0), 60);
  assert.ok(states.get("instrumental") >= 1);
  assert.ok(states.get("unavailable") >= 1);
  assert.ok(Math.min(...lengths) < 600, "A short lyric must be available.");
  assert.ok(Math.max(...lengths) > 2000 && Math.max(...lineCounts) >= 60, "A long lyric must exercise several pages.");
  assert.equal(run.network.length, 0);
});

test("letra mock rechaza artista, álbum o duración ajenos y no inventa letra para pistas sin configurar", async () => {
  const run = demoRuntime();
  const demo = run.load("src/mocks/demoCatalog.ts");
  const route = run.load("src/app/api/lyrics/route.ts");
  const track = demo.getMockTracks("mock-album-01")[0];
  for (const alter of [
    (query) => query.set("artist", "Otro artista"),
    (query) => query.set("album", "Otra edición"),
    (query) => query.set("duration", String(track.duration_ms / 1000 + 30)),
    (query) => query.set("title", "Pista sin configurar"),
  ]) {
    const url = new URL(lyricsRequest(track).url);
    alter(url.searchParams);
    const response = await route.GET(new Request(url));
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.status, "unavailable");
    assert.equal(result.lyrics, null);
  }
  const unconfigured = demo.getMockTracks("mock-album-04")[0];
  const result = await (await route.GET(lyricsRequest(unconfigured))).json();
  assert.equal(result.status, "unavailable");
  assert.equal(result.lyrics, null);
  assert.equal(run.network.length, 0);
});

test("el catálogo conserva los 18 álbumes previos, vacío, paginación y ediciones distintas", () => {
  const run = demoRuntime();
  const collection = run.load("src/mocks/collection.json");
  const catalog = run.load("src/mocks/artistCatalog.ts");
  for (let index = 1; index <= 18; index++) {
    const serial = String(index).padStart(2, "0");
    const album = collection.find((entry) => entry.id === `mock-album-${serial}`);
    assert.ok(album, `Previous album mock-album-${serial} must remain.`);
    assert.equal(album.uri, `spotify:album:mock-${serial}`);
  }
  assert.equal(catalog.mockArtistReleases("demo-empty", "album").length, 0);
  assert.equal(catalog.mockArtistReleases("does-not-exist", "album").length, 0);
  for (const [group, count] of [["album", 27], ["single", 13], ["compilation", 3]]) {
    const releases = catalog.mockArtistReleases("demo-vertice", group);
    assert.equal(releases.length, count);
    for (let index = 0; index < count; index++) {
      assert.ok(releases.some((album) => album.id === `demo-vertice-${group}-${index}`));
    }
  }
  const releases = catalog.mockArtistReleases("demo-vertice", "album");
  const original = releases.find((album) => album.id === "demo-vertice-album-0");
  const edition = releases.find((album) => album.id === "demo-vertice-album-12");
  assert.notEqual(original.id, edition.id);
  assert.notEqual(original.release_date, edition.release_date);
});

test("los filtros combinan búsqueda, género compartido y década con el catálogo demo normal", () => {
  const run = demoRuntime();
  const albums = run.load("src/mocks/collection.json");
  const filters = run.load("src/lib/collectionFilters.ts");
  const options = filters.collectionDecades(albums);
  assert.ok(options.some((option) => option.id === "1990s"));
  assert.ok(options.some((option) => option.id === "2020s"));
  const found = filters.filterCollection(albums, "Vértice", "1990s", "electronic");
  assert.equal(found.length, 1);
  assert.equal(found[0].id, "demo-vertice-album-0");
  const shared = filters.filterCollection(albums, "", "1990s", "electronic");
  assert.ok(shared.length >= 2, "The shared genre must span more than one artist.");
  assert.equal(filters.filterCollection(albums, "Vértice", "2020s", "electronic")[0].id, "mock-album-01");
  assert.equal(filters.filterCollection(albums, "nonexistent", "1990s", "electronic").length, 0);
  assert.equal(filters.filterCollection(albums, "", "all", "all").length, albums.length);
});
