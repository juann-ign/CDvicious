const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { makeAlbum, complete, partial, empty } = require("./fixtures/collection-filters.cjs");

function load(path, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: (name) => dependencies[name] ?? (name === "./searchText" ? load("src/lib/searchText.ts") : undefined), URL, URLSearchParams, Response, Request, Date, Number, setTimeout, clearTimeout, console, ...globals });
  return module.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test("enriquecimiento conserva catálogo, orden y edición actuales por ID", async () => {
  const original = [makeAlbum("a", "2024"), makeAlbum("b", "1994")];
  const api = client(async (url) => url.includes("includeGenres=0") ? Response.json(original) : Response.json([
    makeAlbum("foreign", "1970", ["wrong"]), makeAlbum("a", "1970", ["rock"], { genreMetadata: { state: "complete" } }),
  ], { headers: { "X-CDV-Genres-State": "complete" } }));
  await api.loadCollection(true); await api.loadCollectionGenres(true);
  const snapshot = api.useCollectionCache();
  assert.deepEqual(plain(snapshot.albums.map(a => [a.id, a.release_date])), [["a", "2024"], ["b", "1994"]]);
  assert.deepEqual(plain(snapshot.albums[0].genres), ["rock"]);
  assert.equal(snapshot.genresState, "partial");
});

test("catálogo vacío no inicia otra consulta de géneros", async () => {
  let calls = 0;
  const api = client(async () => { calls++; return Response.json([]); });
  await api.loadCollection(true); await api.loadCollectionGenres(true);
  assert.equal(calls, 1); assert.equal(api.useCollectionCache().genresState, "empty");
});

test("la grilla compacta mide filas completas sin scroll y conserva el ancla al paginar", () => {
  const { collectionLayout, pageForAnchor } = load("src/lib/collectionLayout.ts");
  // Frame widths already exclude the chapter's 24px inset on each side.
  for (const [width, height, columns, rows] of [[1232, 490, 10, 3], [1392, 590, 11, 3], [1872, 760, 15, 4], [992, 420, 8, 2], [752, 350, 6, 2], [592, 340, 5, 2], [352, 350, 3, 2]]) {
    const layout = collectionLayout(width, height);
    assert.equal(layout.columns, columns);
    assert.equal(layout.rows, rows);
    assert.equal(layout.capacity, columns * rows);
    assert.ok(layout.gap >= 20, "horizontal acrylic-case clearance is at least 20px");
    assert.equal(layout.rowGap, 18);
    assert.equal(layout.padding, 6, "padding is vertical; the frame already owns its side insets");
    assert.ok(layout.columns * layout.caseWidth + (layout.columns - 1) * layout.gap <= width + .01, `columns fit ${width}`);
    assert.ok((layout.columns + 1) * 100 + layout.columns * 20 > width, "column count is limited by readable cases, not an eight-column cap");
    assert.ok(layout.rows * layout.cardHeight + (layout.rows - 1) * layout.rowGap + layout.padding * 2 <= height + .01, `complete rows fit ${height}`);
    assert.ok(Math.abs(layout.cardHeight - (layout.caseWidth / 1.08 + 52)) < .01, "card footprint includes all metadata");
    assert.ok(layout.caseWidth >= 100 && layout.caseWidth <= 118, "readable cases do not become tiny tiles or grow beyond the visual cap");
    assert.ok((layout.rows + 1) * (100 / 1.08 + 52) + layout.rows * layout.rowGap + layout.padding * 2 > height, "another legible full row does not fit");
  }
  assert.equal(collectionLayout(1232, 490).capacity, 30);
  assert.equal(collectionLayout(1392, 590).capacity, 33);
  assert.equal(collectionLayout(1872, 760).capacity, 60);
  assert.equal(collectionLayout(1232, 1300).rows, 8, "eight full rows require the actual available height");
  assert.equal(pageForAnchor(2, 12, 16, 45), 1);
  assert.equal(pageForAnchor(2, 16, 12, 40), 2);
  assert.equal(pageForAnchor(2, 12, 16, 3), 0);
});

test("menos altura disponible reduce filas y conserva el disco enfocado en una página válida", () => {
  const { collectionLayout, pageForAnchor } = load("src/lib/collectionLayout.ts");
  const original = collectionLayout(1232, 490);
  const filtered = collectionLayout(1232, 430);
  assert.equal(original.capacity, 30);
  assert.equal(filtered.capacity, 20);
  const anchor = 43;
  const nextPage = pageForAnchor(1, original.capacity, filtered.capacity, 80, anchor);
  assert.equal(nextPage, 2);
  assert.ok(anchor >= nextPage * filtered.capacity && anchor < (nextPage + 1) * filtered.capacity);
  assert.equal(pageForAnchor(nextPage, filtered.capacity, original.capacity, 80, anchor), 1);
});

test("si no entra una caja legible completa la capacidad es cero y el ancla sigue siendo segura", () => {
  const { collectionLayout, pageForAnchor } = load("src/lib/collectionLayout.ts");
  const oneCardFrameHeight = 100 / 1.08 + 52 + 12;
  for (const [width, height] of [[1232, oneCardFrameHeight - .01], [99.99, 490], [0, 0], [Number.NaN, Number.POSITIVE_INFINITY]]) {
    const value = collectionLayout(width, height);
    assert.ok(Number.isFinite(value.caseWidth));
    assert.ok(Number.isFinite(value.cardHeight));
    assert.equal(value.rows, 0);
    assert.equal(value.capacity, 0);
  }
  const exactFit = collectionLayout(100, oneCardFrameHeight + .01);
  assert.equal(exactFit.columns, 1);
  assert.equal(exactFit.rows, 1);
  assert.equal(exactFit.capacity, 1);
  assert.equal(exactFit.caseWidth, 100);
  assert.equal(pageForAnchor(2, 30, 0, 80, 61), 0);
  assert.equal(pageForAnchor(0, 0, 30, 80, 61), 2, "a preserved explicit anchor restores the right page after space returns");
});
function client(fetch) {
  return load("src/lib/collectionClient.ts", {
    react: { useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() },
    "./collectionFilters": fs.existsSync("src/lib/collectionFilters.ts") ? load("src/lib/collectionFilters.ts") : {},
  }, { fetch });
}
function spotify(fetch) {
  return load("src/lib/spotify.ts", {
    "node:crypto": require("node:crypto"),
    "./constants": { SPOTIFY_ARTISTS_BATCH: 2, SPOTIFY_ARTISTS_URL: "http://spotify/artists" },
    "./collectionFilters": fs.existsSync("src/lib/collectionFilters.ts") ? load("src/lib/collectionFilters.ts") : {},
  }, { fetch, process: { env: { NODE_ENV: "production" } } });
}

test("las décadas provienen del catálogo completo y validan calendario sin inventar fechas", () => {
  const filters = load("src/lib/collectionFilters.ts");
  assert.equal(filters.collectionDecade("2000-02-29"), "2000s");
  assert.equal(filters.collectionDecade("2031"), "2030s");
  for (const invalid of [undefined, "", "0000", "198x", "2023-02-29", "2024-13", "2024-04-31", "2024-1", "2020-12-01junk"]) assert.equal(filters.collectionDecade(invalid), "unknown");
  const albums = [...complete, ...Array.from({ length: 40 }, (_, index) => makeAlbum(`other-${index}`, "1991"))];
  const options = filters.collectionDecades(albums);
  assert.deepEqual(plain(options.map((item) => item.id)), ["all", "2020s", "1990s", "1980s", "1970s", "unknown"]);
  assert.equal(options.find((item) => item.id === "unknown").count, 2);
  assert.equal(filters.filterCollection(albums, "Artista eighties", "1980s", "synth pop").length, 1);
  assert.equal(filters.filterCollection(albums, "", "unknown", "all").length, 2);
});

test("géneros normalizados se cuentan por álbum en todo el catálogo sin limitar opciones a diez", () => {
  const filters = load("src/lib/collectionFilters.ts");
  assert.deepEqual(plain(filters.normalizeGenres([" Rock ", "rock", "  Synth   POP ", "", "\n"])), ["rock", "synth pop"]);
  assert.deepEqual(plain(filters.normalizeGenres("rock")), []);
  assert.deepEqual(plain(filters.normalizeGenres([null, 5, "Rock", {}, " ROCK "])), ["rock"]);
  const albums = [...complete, ...Array.from({ length: 40 }, (_, index) => makeAlbum(`page-${index}`, "1990", [`género ${index}`]))];
  const options = filters.collectionGenres(albums);
  assert.equal(options.length, 43);
  assert.equal(options.find((item) => item.id === "rock").count, 1);
  assert.equal(options.some((item) => item.id === "género 39"), true);
});

test("géneros de artistas preservan lotes exitosos y distinguen faltantes de vacío confirmado", async () => {
  let calls = 0;
  const api = spotify(async () => ++calls === 1 ? Response.json({ artists: [{ id: "a", genres: [" Rock ", "rock", ""] }, { id: "b", genres: [] }] }) : Response.json({ error: { reason: "UPSTREAM" } }, { status: 503 }));
  const result = await api.fetchArtistGenresDetailed("private-token", ["a", "b", "c", "d", "a"]);
  assert.deepEqual(plain(result.byArtist), { a: ["rock"], b: [] });
  assert.deepEqual(plain(result.unresolvedArtistIds), ["c", "d"]);
  assert.equal(result.requestedArtistIds.length, 4);
  assert.equal(result.error.status, 503);
  assert.equal(calls, 2);
});

test("rate limit conserva resultados previos y Retry-After; wrapper legacy no oculta fallo total", async () => {
  let calls = 0;
  const api = spotify(async () => ++calls === 1 ? Response.json({ artists: [{ id: "a", genres: ["ambient"] }, { id: "b", genres: [] }] }) : Response.json({ error: { reason: "RATE_LIMITED" } }, { status: 429, headers: { "Retry-After": "7" } }));
  const result = await api.fetchArtistGenresDetailed("private-token", ["a", "b", "c"]);
  assert.deepEqual(plain(result.byArtist), { a: ["ambient"], b: [] });
  assert.equal(result.error.retryAfter, "7");
  const failed = spotify(async () => new Response("unavailable", { status: 503 }));
  await assert.rejects(failed.fetchArtistGenres("private-token", ["x"]), (error) => error.status === 503);
});

test("un fallo total 503 de artistas no debe devolverse como catálogo sin géneros exitoso", async () => {
  const api = spotify(async () => new Response("unavailable", { status: 503 }));
  await assert.rejects(api.fetchArtistGenres("private-token", ["x"]), (error) => error.status === 503);
});

test("cliente conserva cobertura parcial, permite retry y diferencia vacío confirmado", async () => {
  const requested = [];
  let genreCalls = 0;
  const api = client(async (url) => {
    requested.push(url);
    if (url.includes("includeGenres=0")) return Response.json(complete.map((album) => ({ ...album, genres: [] })));
    genreCalls++;
    return Response.json(genreCalls === 1 ? partial : empty, { headers: { "X-CDV-Genres-State": genreCalls === 1 ? "partial" : "empty", "X-CDV-Genres-Resolved-Artists": genreCalls === 1 ? "1" : "5", "X-CDV-Genres-Total-Artists": "5" } });
  });
  await api.loadCollection(true);
  const first = api.loadCollectionGenres(true);
  assert.strictEqual(api.loadCollectionGenres(true), first);
  await first;
  assert.equal(api.useCollectionCache().genresState, "partial");
  assert.equal(api.useCollectionCache().albums[0].genres[0], "rock");
  await api.loadCollectionGenres(true);
  assert.equal(api.useCollectionCache().genresState, "empty");
  assert.equal(requested.length, 3);
});

test("cliente conserva colección y permite recuperar error de géneros sin convertirlo en éxito", async () => {
  let fail = true;
  const api = client(async (url) => {
    if (url.includes("includeGenres=0")) return Response.json(complete);
    if (fail) return Response.json({ error: "spotify_error" }, { status: 502 });
    return Response.json(complete, { headers: { "X-CDV-Genres-State": "complete" } });
  });
  await api.loadCollection(true);
  await assert.rejects(api.loadCollectionGenres(true));
  assert.equal(api.useCollectionCache().genresState, "error");
  assert.equal(api.useCollectionCache().genresLoaded, false);
  assert.equal(api.useCollectionCache().albums.length, complete.length);
  fail = false;
  await api.loadCollectionGenres(true);
  assert.equal(api.useCollectionCache().genresState, "ready");
});

test("logout descarta respuesta tardía y limpia cobertura de géneros", async () => {
  let finish;
  const api = client(async () => { await new Promise((resolve) => { finish = resolve; }); return Response.json(complete); });
  api.syncCollectionAuth(true);
  const pending = api.loadCollection(true);
  api.syncCollectionAuth(false);
  finish(); await pending;
  assert.equal(api.useCollectionCache().albums, null);
  assert.equal(api.useCollectionCache().genresState, "idle");
});

test("dos coberturas parciales complementarias conservan datos; un vacío completo sí los reemplaza", async () => {
  let iteration = 0;
  const api = client(async (url) => {
    if (url.includes("includeGenres=0")) return Response.json([makeAlbum("a", "1980")]);
    iteration++;
    const genres = iteration === 1 ? ["rock"] : iteration === 2 ? ["ambient"] : [];
    return Response.json([makeAlbum("a", "1980", genres, { genreMetadata: { source: "spotify-artist", state: iteration < 3 ? "partial" : "complete", resolvedArtists: 1, totalArtists: 2 } })], { headers: { "X-CDV-Genres-State": iteration < 3 ? "partial" : "complete" } });
  });
  await api.loadCollection(true); await api.loadCollectionGenres(true); await api.loadCollectionGenres(true);
  assert.deepEqual(plain(api.useCollectionCache().albums[0].genres), ["rock", "ambient"]);
  await api.loadCollectionGenres(true);
  assert.deepEqual(plain(api.useCollectionCache().albums[0].genres), []);
  assert.equal(api.useCollectionCache().genresState, "empty");
});

test("header desconocido no se publica como éxito y Retry-After impide consultas anticipadas", async () => {
  let calls = 0;
  const api = client(async (url) => {
    if (url.includes("includeGenres=0")) return Response.json(complete);
    calls++;
    return Response.json(complete, { headers: { "X-CDV-Genres-State": "unexpected", "Retry-After": "10" } });
  });
  await api.loadCollection(true);
  await assert.rejects(api.loadCollectionGenres(true));
  assert.equal(api.useCollectionCache().genresState, "error");
  await assert.rejects(api.loadCollectionGenres(true));
  assert.equal(calls, 1);
});

test("batch no disponible usa artistas individuales acotados, sin fallback para 401 o 429", async () => {
  const urls = [];
  const api = spotify(async (url) => {
    urls.push(String(url));
    if (String(url).includes("?ids=")) return new Response("unsupported", { status: 403 });
    const id = String(url).split("/").at(-1);
    return Response.json({ id, genres: id === "b" ? [] : [" Ambient "] });
  });
  const ids = Array.from({ length: 53 }, (_, index) => `id-${index}`);
  const first = await api.fetchArtistGenresDetailed("private-token", ids);
  assert.equal(Object.keys(first.byArtist).length, 50);
  assert.equal(first.unresolvedArtistIds.length, 3);
  const beforeRetry = urls.length;
  const next = await api.fetchArtistGenresDetailed("private-token", ids);
  assert.equal(next.unresolvedArtistIds.length, 0);
  assert.equal(urls.length - beforeRetry, 3); // The unsupported batch is remembered; only unresolved artists are retried.
  for (const status of [401, 429]) {
    const attempts = [];
    const blocked = spotify(async (url) => { attempts.push(url); return new Response("blocked", { status }); });
    const result = await blocked.fetchArtistGenresDetailed("private-token", ["a", "b", "c"]);
    assert.equal(attempts.length, 1);
    assert.equal(result.error.status, status);
  }
});

test("artista sin campo genres queda sin resolver, mientras [] es vacío confirmado", async () => {
  const api = spotify(async () => Response.json({ artists: [{ id: "a" }, { id: "b", genres: [] }] }));
  const result = await api.fetchArtistGenresDetailed("private-token", ["a", "b"]);
  assert.deepEqual(plain(result.byArtist), { b: [] });
  assert.deepEqual(plain(result.unresolvedArtistIds), ["a"]);
});

test("wrapper legacy conserva los géneros obtenidos ante fallo parcial", async () => {
  let calls = 0;
  const api = spotify(async () => ++calls === 1 ? Response.json({ artists: [{ id: "a", genres: ["rock"] }, { id: "b", genres: [] }] }) : new Response("unavailable", { status: 503 }));
  assert.deepEqual(plain(await api.fetchArtistGenres("private-token", ["a", "b", "c"])), { a: ["rock"], b: [] });
});

function collectionRoute({ fetchAlbums, detailed, mock = false, expireBase = false }) {
  class SpotifyApiError extends Error {
    constructor(message, status, reason, retryAfter) { super(message); Object.assign(this, { status, reason, retryAfter }); }
  }
  const cache = new Map();
  return load("src/app/api/collection/route.ts", {
    "node:crypto": require("node:crypto"),
    "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } },
    "@/lib/session": { getSession: async () => ({ accessToken: "private-token" }) },
    "@/mocks/collection.json": { default: require("../src/mocks/collection.json") },
    "@/lib/collectionFilters": load("src/lib/collectionFilters.ts"),
    "@/lib/serverCache": { cached: async (key, _ttl, loader) => { if (expireBase && key.startsWith("collection:base:")) return loader(); if (cache.has(key)) return cache.get(key); const result = await loader(); cache.set(key, result); return result; } },
    "@/lib/spotify": { SpotifyApiError, fetchSpotifyWebApi: fetchAlbums, fetchArtistGenresDetailed: detailed },
  }, { process: { env: { NEXT_PUBLIC_SPOTIFY_MOCK: mock ? "1" : "0" } } });
}
const collectionRequest = (genres) => ({ nextUrl: new URL(`http://local/api/collection?includeGenres=${genres ? "1" : "0"}`) });

test("enriquecimiento cacheado no devuelve el catálogo anterior al vencer la caché base", async () => {
  let current = [makeAlbum("old", "1994")];
  const api = collectionRoute({ expireBase: true,
    fetchAlbums: async () => Response.json({ items: current.map(album => ({ album })), next: null }),
    detailed: async (_token, ids) => ({ byArtist: Object.fromEntries(ids.map(id => [id, ["rock"]])), requestedArtistIds: ids, unresolvedArtistIds: [] }),
  });
  assert.equal((await (await api.GET(collectionRequest(true))).json())[0].id, "old");
  current = [makeAlbum("new", "2024")];
  const result = await (await api.GET(collectionRequest(true))).json();
  assert.deepEqual(plain(result.map(album => album.id)), ["new"]);
  assert.equal(result[0].release_date, "2024");
});

test("API mantiene array, fuente por álbum y cobertura parcial no cacheada que se recupera", async () => {
  let genreCalls = 0;
  const albums = [makeAlbum("a", "2001"), makeAlbum("b", "1970")];
  const api = collectionRoute({
    fetchAlbums: async () => Response.json({ items: albums.map((album) => ({ album })), next: null }),
    detailed: async () => {
      genreCalls++;
      return { byArtist: genreCalls === 1 ? { "artist-a": ["rock"] } : { "artist-a": ["rock"], "artist-b": [] }, requestedArtistIds: ["artist-a", "artist-b"], unresolvedArtistIds: genreCalls === 1 ? ["artist-b"] : [] };
    },
  });
  const first = await api.GET(collectionRequest(true));
  assert.equal(first.headers.get("X-CDV-Genres-State"), "partial");
  assert.equal(first.headers.get("X-CDV-Genres-Resolved-Artists"), "1");
  const payload = await first.json();
  assert.equal(Array.isArray(payload), true);
  assert.equal(payload[0].genreMetadata.source, "spotify-artist");
  assert.equal(payload[1].genreMetadata.state, "unavailable");
  assert.equal((await api.GET(collectionRequest(true))).headers.get("X-CDV-Genres-State"), "complete");
  await api.GET(collectionRequest(true));
  assert.equal(genreCalls, 2); // Complete result cached, partial result was not.
});

test("colección completa supera 3000 álbumes y rechaza paginación estancada", async () => {
  let calls = 0;
  const api = collectionRoute({ fetchAlbums: async (_token, _endpoint, url) => {
    calls++;
    const offset = Number(new URL(url).searchParams.get("offset"));
    const count = Math.min(50, 3001 - offset);
    return Response.json({ items: Array.from({ length: count }, (_, index) => ({ album: makeAlbum(`album-${offset + index}`, "1980") })), next: offset + count < 3001 ? `https://api.spotify.com/v1/me/albums?offset=${offset + 50}` : null });
  } });
  const response = await api.GET(collectionRequest(false));
  assert.equal((await response.json()).length, 3001);
  assert.equal(calls, 61);
  const stuck = collectionRoute({ fetchAlbums: async () => Response.json({ items: [{ album: makeAlbum("same", "2001") }], next: "https://api.spotify.com/v1/me/albums?offset=50" }) });
  const rejected = await stuck.GET(collectionRequest(false));
  assert.equal(rejected.status, 502);
  assert.equal((await rejected.json()).reason, "INVALID_PAGINATION");
});

test("API mock declara demo; un fallo total de géneros conserva array, error y Retry-After", async () => {
  const mock = collectionRoute({ mock: true });
  const base = await mock.GET(collectionRequest(false));
  assert.equal(base.headers.get("X-CDV-Genres-State"), "not-requested");
  assert.equal((await base.json()).every((album) => album.genres.length === 0), true);
  const demo = await mock.GET(collectionRequest(true));
  assert.equal(demo.headers.get("X-CDV-Genres-State"), "complete");
  assert.equal((await demo.json()).every((album) => album.genreMetadata.source === "demo"), true);
  let calls = 0;
  const failed = collectionRoute({ fetchAlbums: async () => Response.json({ items: [{ album: makeAlbum("a", "2001") }], next: null }), detailed: async () => {
    calls++;
    return { byArtist: {}, requestedArtistIds: ["artist-a"], unresolvedArtistIds: ["artist-a"], error: { status: 429, retryAfter: "8" } };
  } });
  const response = await failed.GET(collectionRequest(true));
  assert.equal(response.headers.get("X-CDV-Genres-State"), "error");
  assert.equal(response.headers.get("Retry-After"), "8");
  assert.equal(Array.isArray(await response.json()), true);
  await failed.GET(collectionRequest(true));
  assert.equal(calls, 2);
});

test("error de colección base se puede reintentar y no se convierte en vacío", async () => {
  let calls = 0;
  const api = client(async () => ++calls === 1 ? new Response("unavailable", { status: 503 }) : Response.json([]));
  await assert.rejects(api.loadCollection(true));
  assert.equal(api.useCollectionCache().collectionState, "error");
  assert.equal(api.useCollectionCache().albums, null);
  await api.loadCollection(true);
  assert.equal(api.useCollectionCache().collectionState, "empty");
  assert.deepEqual(plain(api.useCollectionCache().albums), []);
});

test("logout durante enriquecimiento evita publicar géneros de una sesión anterior", async () => {
  let finish;
  const api = client(async (url) => {
    if (url.includes("includeGenres=0")) return Response.json(complete);
    await new Promise((resolve) => { finish = resolve; });
    return Response.json(complete, { headers: { "X-CDV-Genres-State": "complete" } });
  });
  api.syncCollectionAuth(true); await api.loadCollection(true);
  const pending = api.loadCollectionGenres(true);
  await Promise.resolve();
  api.syncCollectionAuth(false);
  finish(); await pending;
  assert.equal(api.useCollectionCache().albums, null);
  assert.equal(api.useCollectionCache().genresState, "idle");
});

test("B2 shape: upstream sin items o con album inválido devuelve 502 y no se cachea como colección vacía", async () => {
  for (const invalid of [{}, { items: [{ album: {} }], next: null }]) {
    let calls = 0;
    const api = collectionRoute({ fetchAlbums: async () => { calls++; return Response.json(invalid); } });
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await api.GET(collectionRequest(false));
      assert.equal(response.status, 502);
      assert.equal((await response.json()).reason, "INVALID_COLLECTION_RESPONSE");
    }
    assert.equal(calls, 2);
  }
});

test("B2 shape: cliente rechaza álbum malformado y conserva datos ante enriquecimiento inválido", async () => {
  let calls = 0;
  const api = client(async () => {
    calls++;
    return calls === 2 ? Response.json(complete) : Response.json([{}], { headers: { "X-CDV-Genres-State": "complete" } });
  });
  await assert.rejects(api.loadCollection(true));
  assert.equal(api.useCollectionCache().collectionState, "error");
  assert.equal(api.useCollectionCache().albums, null);
  await api.loadCollection(true);
  await assert.rejects(api.loadCollectionGenres(true));
  assert.equal(api.useCollectionCache().genresState, "error");
  assert.equal(api.useCollectionCache().albums[0].id, "present");
  assert.deepEqual(plain(api.useCollectionCache().albums[0].genres), ["rock"]);
});

test("B2 shape: una fecha numérica u objeto no se convierte en década confirmada", () => {
  const filters = load("src/lib/collectionFilters.ts");
  for (const invalid of [2024, { toString: () => "2024" }, true, null]) assert.equal(filters.collectionDecade(invalid), "unknown");
  assert.equal(filters.collectionDecade("2024"), "2020s");
});
