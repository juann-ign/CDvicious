const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { latinArtists, page } = require("./fixtures/genre-search.cjs");

function runtime(respond) {
  const modules = new Map(), calls = [];
  const deps = {
    "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } },
    "@/lib/session": { getValidAccessToken: async () => "fixture-token" },
    "@/lib/catalogServer": { CATALOG_PAGE_SIZE: 10 },
    "@/lib/spotify": { fetchSpotifyWebApi: async (_token, endpoint, url, options) => {
      const query = new URL(url).searchParams;
      const request = { endpoint, query: query.get("q"), offset: Number(query.get("offset") ?? 0), limit: query.get("limit"), signal: options.signal };
      calls.push(request);
      return respond(request);
    } },
  };
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file, "utf8"));
    const module = { exports: {} };
    const localRequire = (name) => {
      if (Object.hasOwn(deps, name)) return deps[name];
      const target = name.startsWith("@/") ? path.resolve("src", name.slice(2)) : name.startsWith(".") ? path.resolve(path.dirname(file), name) : null;
      return target ? load(target + (path.extname(target) ? "" : ".ts")) : require(name);
    };
    const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(js, { module, exports: module.exports, require: localRequire, URL, URLSearchParams, Request, Response, Date, console, process: { env: { NEXT_PUBLIC_SPOTIFY_MOCK: "0" } } }, { filename: file });
    modules.set(file, module.exports);
    return module.exports;
  }
  return { route: load("src/app/api/genres/verify/route.ts"), calls };
}
const request = (artists, genre = "rock") => new Request("http://local/api/genres/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ genre, artists }) });

test("genre verification finds exact artist ID past the first Search page", async () => {
  const artist = latinArtists[2];
  const run = runtime(({ offset }) => Response.json(page(offset === 20 ? [artist.id] : Array.from({ length: 10 }, (_, i) => `other-${offset + i}`), offset, 21, offset < 20 ? "next" : null)));
  const input = request([artist]);
  const body = await (await run.route.POST(input)).json();
  assert.deepEqual(body.matchedArtistIds, [artist.id]);
  assert.deepEqual(run.calls.map(({ offset }) => offset), [0, 10, 20]);
  assert.ok(run.calls.every(({ signal, limit }) => signal === input.signal && limit === "10"));
});

test("an accented empty lookup tries its accent-free form before caching a negative", async () => {
  const artist = latinArtists[0];
  const run = runtime(({ query }) => Response.json(page(query.includes("García") ? [] : [artist.id])));
  const first = await (await run.route.POST(request([artist]))).json();
  assert.deepEqual(first.matchedArtistIds, [artist.id]);
  assert.deepEqual(run.calls.map(({ query }) => query), ['"Charly García" genre:rock', '"Charly Garcia" genre:rock']);
  await run.route.POST(request([artist]));
  assert.equal(run.calls.length, 2, "the verified ID result is cached");
});

test("homonymous candidates share one provider query while keeping exact ID decisions", async () => {
  const run = runtime(() => Response.json(page(["queen"])));
  const body = await (await run.route.POST(request([{ id: "queen", name: "Queen" }, { id: "other-queen", name: "Queen" }]))).json();
  assert.deepEqual(body.matchedArtistIds, ["queen"]);
  assert.deepEqual(body.checkedArtistIds, ["queen", "other-queen"]);
  assert.equal(run.calls.length, 1);
});

test("bounded inconclusive search resumes from saved progress instead of repeating the same pages", async () => {
  const artist = latinArtists[1];
  const run = runtime(({ offset }) => Response.json(page(offset === 30 ? [artist.id] : Array.from({ length: 10 }, (_, i) => `other-${offset + i}`), offset, 40, offset < 30 ? "next" : null)));
  const first = await (await run.route.POST(request([artist]))).json();
  assert.equal(first.partial, true);
  assert.deepEqual(first.checkedArtistIds, []);
  assert.equal(run.calls.length, 3);
  const next = await (await run.route.POST(request([artist]))).json();
  assert.deepEqual(next.matchedArtistIds, [artist.id]);
  assert.deepEqual(run.calls.map(({ offset }) => offset), [0, 10, 20, 30]);
});

test("a repeated provider page stays unknown and is not cached as a negative", async () => {
  const run = runtime(({ offset }) => Response.json(page(Array.from({ length: 10 }, (_, i) => `same-${i}`), offset, 100, "next")));
  const body = await (await run.route.POST(request([latinArtists[1]]))).json();
  assert.deepEqual(body.checkedArtistIds, []);
  assert.equal(body.partial, true);
  assert.equal(run.calls.length, 2);
});

test("verification has a global 24-request budget and preserves unresolved candidates", async () => {
  const run = runtime(({ query, offset }) => Response.json(page(Array.from({ length: 10 }, (_, i) => `other-${query}-${offset + i}`), offset, 500, "next")));
  const artists = Array.from({ length: 24 }, (_, i) => ({ id: `candidate-${i}`, name: `Artist ${i}` }));
  const body = await (await run.route.POST(request(artists))).json();
  assert.ok(run.calls.length <= 24);
  assert.equal(body.partial, true);
  assert.deepEqual(body.checkedArtistIds, []);
});

test("authentication and permission errors retain their actionable HTTP status", async () => {
  for (const status of [401, 403]) {
    const run = runtime(() => Response.json({ error: { status } }, { status }));
    const response = await run.route.POST(request([latinArtists[1]]));
    assert.equal(response.status, status);
    assert.equal(JSON.stringify(await response.json()).includes("fixture-token"), false);
  }
});

test("a failed provider request is recoverable and never cached as an absent genre", async () => {
  let failed = true;
  const artist = latinArtists[1];
  const run = runtime(() => failed ? new Response("unavailable", { status: 503 }) : Response.json(page([artist.id])));
  assert.equal((await run.route.POST(request([artist]))).status, 502);
  failed = false;
  assert.deepEqual((await (await run.route.POST(request([artist]))).json()).matchedArtistIds, [artist.id]);
  assert.equal(run.calls.length, 2);
});
