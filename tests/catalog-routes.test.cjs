const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
function load(path, dependencies, globals = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require: (name) => dependencies[name] ?? (name === "@/lib/searchText" ? load("src/lib/searchText.ts", {}) : undefined), URL, URLSearchParams, Response, Request, Number, Date, ...globals });
  return module.exports;
}
const next = { NextResponse: { json: (value, options) => Response.json(value, options) } };
test("catálogo servidor usa sesión, límite vigente y conserva Retry-After sin exponer tokens", async () => {
  let observed;
  const server = load("src/lib/catalogServer.ts", {
    "next/server": next,
    "./session": { getValidAccessToken: async () => "private-token" },
    "./spotify": { fetchSpotifyWebApi: async (...args) => { observed = args; return Response.json({ error: { reason: "RATE_LIMITED" } }, { status: 429, headers: { "Retry-After": "12" } }); } },
  });
  const response = await server.catalogRequest("artists/abc/albums?limit=10", "artist-albums", new AbortController().signal);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "12");
  assert.equal((await response.text()).includes("private-token"), false);
  assert.equal(observed[3].headers.Authorization, "Bearer private-token");
  assert.equal(server.CATALOG_PAGE_SIZE, 10);
  assert.equal(server.catalogOffset("-1"), null);
  assert.equal(server.catalogOffset("1.5"), null);
});
test("búsqueda de álbumes conserva array; artista es explícito y paginado", async () => {
  const calls = [];
  const api = load("src/app/api/search/route.ts", {
    "next/server": next,
    "@/lib/catalogServer": { CATALOG_PAGE_SIZE: 10, catalogOffset: (s) => Number(s ?? 0), nextCatalogOffset: () => 10, catalogRequest: async (path) => { calls.push(path); return { albums: { items: [{ id: "album" }] }, artists: { items: [{ id: "artist", name: "Example" }], total: 20, offset: 0, limit: 10 } }; } },
    "@/mocks/artistCatalog": {}, "@/mocks/collection.json": [],
  }, { process: { env: { NEXT_PUBLIC_SPOTIFY_MOCK: "0" } } });
  const albums = await (await api.GET(new Request("http://local/api/search?q=example"))).json();
  assert.deepEqual(albums, [{ id: "album" }]);
  const artists = await (await api.GET(new Request("http://local/api/search?q=example&type=artist"))).json();
  assert.equal(artists.items[0].id, "artist");
  assert.equal(artists.nextOffset, 10);
  assert.equal(calls[0].includes("type=album"), true);
  assert.equal(calls[1].includes("type=artist"), true);
});
test("discografía consulta por ID y grupo, con offset y límite 10; rechaza apariciones", async () => {
  let observed;
  const api = load("src/app/api/artists/[id]/albums/route.ts", {
    "next/server": next,
    "@/lib/catalogServer": { CATALOG_PAGE_SIZE: 10, catalogOffset: (s) => Number(s ?? 0), nextCatalogOffset: () => 20, catalogRequest: async (path) => { observed = path; return { items: [{ id: "release" }], total: 35 }; } },
    "@/mocks/artistCatalog": {},
  }, { process: { env: { NEXT_PUBLIC_SPOTIFY_MOCK: "0" } } });
  const response = await api.GET(new Request("http://local/api/artists/artist123/albums?group=single&offset=10"), { params: Promise.resolve({ id: "artist123" }) });
  assert.equal(observed, "artists/artist123/albums?include_groups=single&limit=10&offset=10");
  assert.equal((await response.json()).nextOffset, 20);
  const invalid = await api.GET(new Request("http://local/api/artists/artist123/albums?group=appears_on"), { params: Promise.resolve({ id: "artist123" }) });
  assert.equal(invalid.status, 400);
});

test("la lista de álbum recorre todas las páginas y ordena discos sin perder offsets ni restricciones", async () => {
  const calls = [];
  const entry = (id, disc, number, extra = {}) => ({
    id, uri: `spotify:track:${id}`, name: id, duration_ms: 182000,
    disc_number: disc, track_number: number, ...extra,
  });
  const server = load("src/lib/catalogServer.ts", {
    "next/server": next,
    "./session": { getValidAccessToken: async () => "fake-token" },
    "./spotify": { fetchSpotifyWebApi: async (_token, endpoint, url, options) => {
      calls.push({ endpoint, url, signal: options.signal });
      const offset = Number(new URL(url).searchParams.get("offset"));
      if (offset === 0) return Response.json({ offset, limit: 50, next: "https://unrelated.example/next", items: [
        entry("disc2-start", 2, 1),
        entry("restricted", 1, 2, { restrictions: { reason: "market" } }),
        entry("replacement", 1, 1, { linked_from: { id: "original" } }),
        null,
      ] });
      assert.equal(offset, 50);
      return Response.json({ offset, limit: 50, next: null, items: [entry("disc2-end", 2, 2)] });
    } },
  });
  const api = load("src/app/api/album/[id]/tracks/route.ts", {
    "next/server": next,
    "@/lib/catalogServer": server,
    "@/mocks/demoCatalog": {},
  }, { process: { env: { NEXT_PUBLIC_SPOTIFY_MOCK: "0" } } });
  const request = new Request("http://local/api/album/album123/tracks");
  const response = await api.GET(request, { params: Promise.resolve({ id: "album123" }) });
  assert.equal(response.status, 200);
  const { tracks } = await response.json();
  assert.deepEqual(tracks.map(({ id, disc_number, track_number, position, playable }) => [id, disc_number, track_number, position, playable]), [
    ["replacement", 1, 1, 2, true], ["restricted", 1, 2, 1, false], [null, 1, 4, 3, false],
    ["disc2-start", 2, 1, 0, true], ["disc2-end", 2, 2, 50, true],
  ]);
  assert.equal(tracks[0].linkedFromId, "original");
  assert.equal(tracks[0].uri, "spotify:track:replacement");
  assert.deepEqual(calls.map(({ url }) => url), [
    "https://api.spotify.com/v1/albums/album123/tracks?limit=50&offset=0",
    "https://api.spotify.com/v1/albums/album123/tracks?limit=50&offset=50",
  ]);
  assert.ok(calls.every(({ signal }) => signal === request.signal));
});
