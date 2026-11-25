const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function runtime({ mock = false, respond = async () => { throw new Error("unexpected provider call"); } } = {}) {
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

test("búsqueda demo de artistas admite Vértice y Vertice manteniendo nombre e identidad", async () => {
  const run = runtime({ mock: true });
  const route = run.load("src/app/api/search/route.ts");
  for (const query of ["Vértice", "Vertice", "VERTICE", "VÉRTICE"]) {
    const body = await (await route.GET(searchRequest(query))).json();
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].id, "demo-vertice");
    assert.equal(body.items[0].name, "Vértice Magnético");
  }
  assert.equal(run.calls.length, 0);
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
