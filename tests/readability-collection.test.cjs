const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function runtime({ mock = false, respond = async () => { throw new Error("unexpected provider call"); }, overrides = {} } = {}) {
  const cache = new Map();
  const calls = [];
  const dependencies = {
    "next/server": { NextResponse: { json: (value, options) => Response.json(value, options) } },
    "@/lib/catalogServer": {
      CATALOG_PAGE_SIZE: 10,
      catalogOffset: (value) => Number(value ?? 0),
      nextCatalogOffset: (page) => page.next ? page.offset + page.limit : null,
      catalogRequest: async (url, endpoint, signal) => { calls.push({ url, endpoint, signal }); return respond(new URL(url, "https://api.spotify.com/v1/"), signal); },
    },
    ...overrides,
  };
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    if (path.extname(file) === ".json") return JSON.parse(fs.readFileSync(file, "utf8"));
    const module = { exports: {} };
    cache.set(file, module.exports);
    const javascript = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = (name) => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      const target = name.startsWith("@/") ? path.join(process.cwd(), "src", name.slice(2)) : name.startsWith(".") ? path.resolve(path.dirname(file), name) : null;
      return target ? load(target + (path.extname(target) ? "" : ".ts")) : require(name);
    };
    vm.runInNewContext(javascript, { module, exports: module.exports, require: localRequire, URL, URLSearchParams, Response, Request, AbortController, process: { env: { NEXT_PUBLIC_SPOTIFY_MOCK: mock ? "1" : "0" } } }, { filename: file });
    cache.set(file, module.exports);
    return module.exports;
  }
  return { load, calls };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const album = (id, date, name = "Órbita del sur", genres = ["rock"]) => ({ id, name, release_date: date, genres, uri: `spotify:album:${id}`, images: [], artists: [{ id: "vertice-id", name: "Vértice Magnético" }] });
const providerPage = (items, offset = 0, next = null) => ({ artists: { items, offset, limit: 10, total: items.length, next } });
const searchRequest = (query, offset = 0) => new Request(`http://local/api/search?${new URLSearchParams({ type: "artist", q: query, offset: String(offset) })}`);
const releaseRequest = (query, offset = 0) => new Request(`http://local/api/search?${new URLSearchParams({ type: "artist", scope: "releases", q: query, offset: String(offset) })}`);

test("búsqueda sin tildes conserva textos originales y ediciones distintas por ID", () => {
  const run = runtime();
  const text = run.load("src/lib/searchText.ts");
  const filters = run.load("src/lib/collectionFilters.ts");
  assert.equal(text.normalizeSearchText("  VE\u0301RTICE   MAGNÉTICO "), "vertice magnetico");
  const albums = [album("original", "1994"), album("reedition", "2024")];
  for (const query of ["vertice", "VÉRTICE", "orbita", "ÓRBITA"]) {
    const found = filters.filterCollection(albums, query, "all", "all");
    assert.deepEqual(plain(found.map((item) => item.id)), ["original", "reedition"]);
    assert.equal(found[0], albums[0]);
    assert.equal(found[0].name, "Órbita del sur");
    assert.equal(found[0].artists[0].name, "Vértice Magnético");
  }
});

test("años de edición validan fecha y se acotan por década desde todo el catálogo", () => {
  const { collectionYear, collectionYears } = runtime().load("src/lib/collectionFilters.ts");
  assert.equal(collectionYear("2000-02-29"), "2000");
  for (const invalid of [undefined, "", "2023-02-29", "2024-13", "2024-04-31", "199x", "0000"]) assert.equal(collectionYear(invalid), "unknown");
  const albums = [album("a", "1994"), album("b", "1997-02"), album("c", "1994-03-18"), album("d", "2024"), album("e", undefined)];
  assert.deepEqual(plain(collectionYears(albums, "1990s")), [{ id: "all", label: "TODOS", count: 3 }, { id: "1997", label: "1997", count: 1 }, { id: "1994", label: "1994", count: 2 }]);
  assert.deepEqual(plain(collectionYears(albums, "unknown").map((option) => option.id)), ["all", "unknown"]);
  assert.deepEqual(plain(collectionYears(albums).map((option) => option.id)), ["all", "2024", "1997", "1994", "unknown"]);
});

test("búsqueda, género, década y año se combinan con AND y admiten cero coincidencias", () => {
  const { filterCollection } = runtime().load("src/lib/collectionFilters.ts");
  const albums = [album("chosen", "1994"), album("other-year", "1997"), album("other-genre", "1994", "Órbita del sur", ["ambient"]), album("other-name", "1994", "Otra obra"), album("unknown", undefined)];
  assert.deepEqual(plain(filterCollection(albums, "orbita", "1990s", "rock", "1994").map((item) => item.id)), ["chosen"]);
  assert.equal(filterCollection(albums, "orbita", "2020s", "rock", "1994").length, 0);
  assert.equal(filterCollection(albums, "", "unknown", "all", "unknown")[0].id, "unknown");
  assert.equal(filterCollection(albums, "", "all", "all").length, albums.length);
});

test("Colección y discografía combinan prefijos de artista y álbum sin alterar nombres ni IDs", () => {
  const run = runtime();
  const { filterCollection } = run.load("src/lib/collectionFilters.ts");
  const { findAlbumArtistMatches } = run.load("src/lib/searchText.ts");
  const redondos = { id: "redondos", name: "Patricio Rey y sus Redonditos de Ricota" };
  const gulp = { ...album("gulp", "1985", "Gulp!"), artists: [redondos, { id: "guest", name: "Invitado" }] };
  const otherRelease = { ...album("oktubre", "1986", "Oktubre"), artists: [redondos] };
  const homonym = album("other-gulp", "1985", "Gulp!");
  const collection = [gulp, otherRelease, homonym];
  for (const query of ["patricio rey gulp", "PÁTRÍCÍÓ REY GÚLP!", "gulp pat rey", "Patricio Rey y sus Redonditos de Ricota Gulp"]) {
    const result = filterCollection(collection, query, "1980s", "rock", "1985");
    assert.equal(result.length, 1);
    assert.equal(result[0], gulp);
    assert.deepEqual(plain(findAlbumArtistMatches(collection, query)), [{ ...redondos, images: [], matchedAlbum: { id: "gulp", name: "Gulp!" } }]);
  }
  assert.deepEqual(plain(filterCollection(collection, "pat rey", "all", "all").map(({ id }) => id)), ["gulp", "oktubre"]);
  assert.deepEqual(plain(filterCollection(collection, "gulp", "all", "all").map(({ id }) => id)), ["gulp", "other-gulp"]);
  assert.equal(filterCollection(collection, "patricio rey ausente", "all", "all").length, 0);
});

test("las sugerencias demo encuentran un álbum fuera de Colección y conservan el ID artista", async () => {
  const run = runtime({ mock: true });
  const route = run.load("src/app/api/search/route.ts");
  const result = await (await route.GET(releaseRequest("Beatles cámpo magn"))).json();
  assert.deepEqual(result, { items: [{ id: "demo-beatles", name: "The Beatles", images: [], matchedAlbum: { id: "demo-beatles-album-0", name: "Campo magnético" } }], total: 1, nextOffset: null });
  assert.equal(run.calls.length, 0);
});

test("Spotify usa créditos reales en sugerencias por álbum y acota la alternativa para un texto combinado", async () => {
  const redondos = { id: "redondos", name: "Patricio Rey y sus Redonditos de Ricota" };
  const gulp = { id: "album-id", name: "Gulp!", artists: [redondos, { id: "unrelated", name: "Invitado" }] };
  const calls = [];
  const run = runtime({ respond: async (url) => {
    const q = url.searchParams.get("q");
    calls.push([q, url.searchParams.get("type"), url.searchParams.get("limit")]);
    if (q === "Gulp!" || q?.startsWith('artist:"')) {
      return { albums: { items: [gulp, gulp, null, { id: null, name: "Gulp!", artists: [redondos] }] } };
    }
    return { ...providerPage([redondos]), albums: { items: [] } };
  } });
  const route = run.load("src/app/api/search/route.ts");
  const title = await route.GET(releaseRequest("Gulp!"));
  assert.equal(title.headers.get("X-CDV-Search-Requests"), "1");
  assert.deepEqual((await title.json()).items.map(({ id }) => id), ["redondos", "unrelated"], "title alone keeps the actual album credits");
  const combined = await route.GET(releaseRequest("patricio rey gulp"));
  assert.equal(combined.headers.get("X-CDV-Search-Requests"), "2");
  assert.deepEqual(await combined.json(), {
    items: [{ ...redondos, images: [], matchedAlbum: { id: "album-id", name: "Gulp!" } }], total: 1, nextOffset: null,
  });
  assert.deepEqual(calls, [["Gulp!", "artist,album", "10"], ["patricio rey gulp", "artist,album", "10"], ['artist:"patricio rey" album:"gulp"', "album", "10"]]);
  for (const query of [`${redondos.name} Gulp`, `Gulp ${redondos.name}`]) {
    const full = await route.GET(releaseRequest(query));
    assert.equal(full.headers.get("X-CDV-Search-Requests"), "2");
    assert.deepEqual((await full.json()).items.map(({ id }) => id), ["redondos"]);
    assert.deepEqual(calls.at(-1), [`artist:"${redondos.name}" album:"Gulp"`, "album", "10"]);
  }
  assert.equal((await route.GET(releaseRequest("Gulp!", 10))).status, 400);
});

test("búsqueda demo de artistas admite prefijos breves y acentos manteniendo nombre e identidad", async () => {
  const run = runtime({ mock: true });
  const route = run.load("src/app/api/search/route.ts");
  for (const query of ["V", "Ve", "Vé", "Vértice", "Vertice", "VERTICE", "VÉRTICE"]) {
    const body = await (await route.GET(searchRequest(query))).json();
    assert.deepEqual(body.items.map(({ id }) => id), query === "V" ? ["demo-vertice", "demo-empty"] : ["demo-vertice"]);
    assert.equal(body.items[0].id, "demo-vertice");
    assert.equal(body.items[0].name, "Vértice Magnético");
  }
  assert.equal(run.calls.length, 0);
});

test("Spotify: las sugerencias breves priorizan coincidencias sin tildes y deduplican por ID dentro de la página", async () => {
  const candidates = [
    { id: "unrelated", name: "Otra banda" },
    { id: "contains", name: "Clavé" },
    { id: "word", name: "Las Vértices" },
    { id: "prefix", name: "Vértice Magnético" },
    { id: "prefix", name: "Vertice Magnetico" },
    null,
  ];
  const run = runtime({ respond: async () => ({ artists: { items: candidates, total: 16, offset: 0, limit: 10, next: "provider-next" } }) });
  const route = run.load("src/app/api/search/route.ts");
  for (const query of ["v", "ve", "vé"]) {
    const body = await (await route.GET(searchRequest(query))).json();
    assert.deepEqual(body.items.map(({ id }) => id), ["prefix", "word", "contains", "unrelated"]);
    assert.equal(body.items[0].name, "Vértice Magnético");
    assert.equal(body.nextOffset, 10);
    assert.equal(body.total, 16);
  }
  assert.deepEqual(run.calls.map(({ url }) => new URL(url, "http://local").searchParams.get("q")), ["v", "ve", "vé"]);
});

test("la página de álbumes conserva reediciones, fechas y créditos y excluye duplicados y apariciones", async () => {
  const original = album("original", "1994", "Álbum");
  const reissue = { ...album("reedition", "2024-06-03", "Álbum"), release_date_precision: "day" };
  const run = runtime({ respond: async () => ({ items: [original, original, reissue, { ...original, id: "guest", album_group: "appears_on" }], total: 24, offset: 10, limit: 10, next: "provider-next" }) });
  const route = run.load("src/app/api/artists/[id]/albums/route.ts");
  const response = await route.GET(new Request("http://local/api/artists/artist/albums?group=album&offset=10"), { params: Promise.resolve({ id: "artist" }) });
  const body = await response.json();
  assert.deepEqual(body.items, [original, reissue]);
  assert.equal(body.nextOffset, 20);
  assert.equal(body.total, 24);
  assert.equal(run.calls.length, 1);
});

test("Spotify conserva consulta original, IDs, texto y paginación cuando encuentra resultados", async () => {
  const run = runtime({ respond: async () => providerPage([{ id: "artist-id", name: "Vértice" }], 10, "next") });
  const response = await run.load("src/app/api/search/route.ts").GET(searchRequest("Vértice", 10));
  const body = await response.json();
  assert.equal(run.calls.length, 1);
  const params = new URL(run.calls[0].url, "http://local").searchParams;
  assert.equal(params.get("q"), "Vértice");
  assert.equal(params.get("offset"), "10");
  assert.equal(params.get("limit"), "10");
  assert.equal(body.items[0].name, "Vértice");
  assert.equal(body.items[0].id, "artist-id");
  assert.equal(body.nextOffset, 20);
  assert.equal(response.headers.get("x-cdv-search-requests"), "1");
});

test("fallback Spotify solo ante vacío acentuado usa una alternativa en la misma página", async () => {
  for (const found of [[], [{ id: "artist-id", name: "Vértice" }]]) {
    const run = runtime({ respond: async (url) => providerPage(url.searchParams.get("q") === "Vértice" ? [] : found, 10) });
    const request = searchRequest("Vértice", 10);
    const response = await run.load("src/app/api/search/route.ts").GET(request);
    const body = await response.json();
    assert.equal(run.calls.length, 2);
    assert.deepEqual(run.calls.map((call) => new URL(call.url, "http://local").searchParams.get("q")), ["Vértice", "Vertice"]);
    assert.equal(run.calls.every((call) => new URL(call.url, "http://local").searchParams.get("offset") === "10" && call.signal === request.signal), true);
    assert.deepEqual(body.items, found);
    assert.equal(response.headers.get("x-cdv-search-requests"), "2");
  }
});

test("consulta sin acentos, cancelación y fallos de Spotify no generan búsquedas extra", async () => {
  const plainRun = runtime({ respond: async () => providerPage([]) });
  await plainRun.load("src/app/api/search/route.ts").GET(searchRequest("Vertice"));
  assert.equal(plainRun.calls.length, 1);
  for (const status of [401, 403, 429]) {
    const run = runtime({ respond: async () => Response.json({ error: "provider" }, { status, headers: { "Retry-After": "7" } }) });
    const response = await run.load("src/app/api/search/route.ts").GET(searchRequest("Vértice"));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("retry-after"), "7");
    assert.equal(run.calls.length, 1);
  }
  const controller = new AbortController();
  const aborted = new Request(searchRequest("Vértice"), { signal: controller.signal });
  controller.abort();
  const cancelled = runtime({ respond: async () => providerPage([]) });
  await cancelled.load("src/app/api/search/route.ts").GET(aborted);
  assert.equal(cancelled.calls.length, 1);
});

test("fallo del único fallback se informa como error recuperable, no como cero resultados", async () => {
  const run = runtime({ respond: async (url) => url.searchParams.get("q") === "Vértice" ? providerPage([]) : Response.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "5" } }) });
  const response = await run.load("src/app/api/search/route.ts").GET(searchRequest("Vértice"));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "5");
  assert.equal(run.calls.length, 2);
});

function verifyRequest(genre, artists) {
  return new Request("http://local/api/genres/verify", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ genre, artists }),
  });
}

test("la búsqueda por género en demo confirma únicamente los IDs con géneros configurados localmente", async () => {
  const unexpectedProvider = async () => assert.fail("El modo demo no requiere una sesión ni llamadas a Spotify");
  const run = runtime({ mock: true, overrides: {
    "@/lib/session": { getValidAccessToken: unexpectedProvider },
    "@/lib/spotify": { fetchSpotifyWebApi: unexpectedProvider },
  } });
  const api = run.load("src/app/api/genres/verify/route.ts");
  const artists = [
    { id: "demo-vertice", name: "Vértice Magnético" },
    { id: "demo-satelite", name: "Satélite Sur" },
    { id: "demo-empty", name: "Archivo sin editar" },
    { id: "unknown-artist", name: "Vértice Magnético" },
  ];
  const response = await api.POST(verifyRequest("electronic", artists));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    genre: "electronic", matchedArtistIds: ["demo-vertice", "demo-satelite"],
    checkedArtistIds: ["demo-vertice", "demo-satelite", "demo-empty"], partial: true,
  });
});

test("buscar por género comprueba IDs exactos, distingue ausencia de falta de cobertura y reutiliza resultados comprobados", async () => {
  const calls = [];
  const run = runtime({ overrides: {
    "@/lib/session": { getValidAccessToken: async () => "token-fixture" },
    "@/lib/spotify": { fetchSpotifyWebApi: async (_token, endpoint, url, options) => {
      const query = new URL(url).searchParams;
      calls.push({ endpoint, query, signal: options.signal });
      if (query.get("q").startsWith("Queen ")) return Response.json(providerPage([{ id: "queen", name: "Queen" }]));
      return Response.json(providerPage([{ id: "also-same-name" }], 0, "next-page"));
    } },
  } });
  const api = run.load("src/app/api/genres/verify/route.ts");
  const artists = [
    { id: "queen", name: "Queen" }, { id: "homonym", name: "Queen" },
    { id: "unknown", name: "Various Artists" }, { id: "queen", name: "Queen" },
  ];
  const request = verifyRequest(" ROCK ", artists);
  const response = await api.POST(request);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { genre: "rock", matchedArtistIds: ["queen"], checkedArtistIds: ["queen", "homonym"], partial: true });
  assert.equal(calls.length, 2, "Homonymous candidates share their provider query");
  assert.ok(calls.every(({ endpoint, query, signal }) => endpoint === "GET /v1/search" && query.get("type") === "artist" && query.get("limit") === "10" && signal === request.signal));
  assert.deepEqual(calls.map(({ query }) => query.get("q")), ["Queen genre:rock", '"Various Artists" genre:rock']);
  assert.equal(JSON.stringify(await (await api.POST(verifyRequest("rock", artists))).json()).includes("token-fixture"), false);
  assert.equal(calls.length, 3, "Only the inconclusive result needs another lookup");
});

test("verificación de género acota candidatos y neutraliza sintaxis de filtros en nombres", async () => {
  const queries = [];
  let token = null;
  const run = runtime({ overrides: {
    "@/lib/session": { getValidAccessToken: async () => token },
    "@/lib/spotify": { fetchSpotifyWebApi: async (_token, _endpoint, url) => {
      queries.push(new URL(url).searchParams.get("q"));
      return Response.json(providerPage([]));
    } },
  } });
  const api = run.load("src/app/api/genres/verify/route.ts");
  const artists = [{ id: "queen", name: 'Queen" genre:jazz' }];
  assert.equal((await api.POST(verifyRequest("rock", artists))).status, 401);
  token = "token-fixture";
  assert.equal((await api.POST(verifyRequest("rock genre:jazz", artists))).status, 400);
  assert.equal((await api.POST(verifyRequest("rock", Array.from({ length: 25 }, (_, index) => ({ id: `artist-${index}`, name: `Artista ${index}` }))))).status, 400);
  assert.deepEqual(queries, []);
  assert.deepEqual(await (await api.POST(verifyRequest("Hip Hop", artists))).json(), { genre: "hip hop", matchedArtistIds: [], checkedArtistIds: [], partial: true });
  assert.deepEqual(queries, ['"Queen genre jazz" genre:"hip hop"']);
});

test("el límite de Spotify frena nuevas verificaciones y conserva resultados parciales y Retry-After", async () => {
  for (const keepOne of [true, false]) {
    let calls = 0;
    const run = runtime({ overrides: {
      "@/lib/session": { getValidAccessToken: async () => "token-fixture" },
      "@/lib/spotify": { fetchSpotifyWebApi: async (_token, _endpoint, url) => {
        calls++;
        const releaseOne = new URL(url).searchParams.get("q").startsWith('"Artista 1"');
        if (keepOne && releaseOne) return Response.json(providerPage([{ id: "artist-1" }]));
        return Response.json({ private: "UPSTREAM_SECRET" }, { status: 429, headers: { "Retry-After": "11" } });
      } },
    } });
    const api = run.load("src/app/api/genres/verify/route.ts");
    const artists = Array.from({ length: 24 }, (_, index) => ({ id: `artist-${index}`, name: `Artista ${index}` }));
    const response = await api.POST(verifyRequest("rock", artists));
    assert.equal(calls, 2);
    assert.equal(response.status, keepOne ? 200 : 429);
    assert.equal(response.headers.get("retry-after"), "11");
    const body = await response.json();
    assert.equal(JSON.stringify(body).includes("UPSTREAM_SECRET"), false);
    if (keepOne) assert.deepEqual(body, { genre: "rock", matchedArtistIds: ["artist-1"], checkedArtistIds: ["artist-1"], partial: true });
    else assert.deepEqual(body, { error: "RATE_LIMITED" });
  }
});
