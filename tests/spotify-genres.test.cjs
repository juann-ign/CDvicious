const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const plain = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function runtime({ fetch = async () => { throw new Error("unexpected request"); }, mock = false, session = {}, globals = {}, react } = {}) {
  const modules = new Map();
  const deps = {
    "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } },
    "@/lib/session": { getValidAccessToken: async () => "fixture-token", ...session },
    ...(react ? { react } : {}),
  };
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    if (file.endsWith(".json")) return JSON.parse(fs.readFileSync(file, "utf8"));
    const module = { exports: {} };
    const requireModule = (name) => {
      if (Object.hasOwn(deps, name)) return deps[name];
      const target = name.startsWith("@/") ? path.resolve("src", name.slice(2)) : name.startsWith(".") ? path.resolve(path.dirname(file), name) : null;
      return target ? load(target + (path.extname(target) ? "" : ".ts")) : require(name);
    };
    const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(js, { module, exports: module.exports, require: requireModule, URL, URLSearchParams, Response, Request, AbortController, Date, setInterval, clearInterval, console, fetch, process: { env: { NODE_ENV: "production", NEXT_PUBLIC_SPOTIFY_MOCK: mock ? "1" : "0" } }, ...globals }, { filename: file });
    modules.set(file, module.exports);
    return module.exports;
  }
  return { load };
}
const requestGenres = (id, retry = false) => new Request(`http://local/api/artists/${id}/genres${retry ? "?retry=1" : ""}`);
const context = (id) => ({ params: Promise.resolve({ id }) });

test("Spotify omission is unavailable, [] is known empty and malformed genres never become empty", async () => {
  const run = runtime({ fetch: async () => Response.json({ artists: [{ id: "missing" }, { id: "empty", genres: [] }, { id: "invalid", genres: [6] }] }) });
  const result = await run.load("src/lib/spotify.ts").fetchArtistGenresDetailed("fixture-token", ["missing", "empty", "invalid"]);
  assert.deepEqual(plain(result.byArtist), { empty: [] });
  assert.deepEqual(plain(result.unavailableArtistIds), ["missing"]);
  assert.deepEqual(plain(result.unresolvedArtistIds), ["missing", "invalid"]);
  assert.equal(result.error.reason, "INVALID_ARTIST_RESPONSE");
});

test("selected artist uses one individual lookup, memoizes omitted field and explicit retry can recover", async () => {
  const calls = [];
  let supplied = false;
  const run = runtime({ fetch: async (url, options) => { calls.push({ url, signal: options.signal }); return Response.json({ id: "artist-id", ...(supplied ? { genres: [" Ambient "] } : {}) }); } });
  const route = run.load("src/app/api/artists/[id]/genres/route.ts");
  const firstRequest = requestGenres("artist-id");
  const first = await route.GET(firstRequest, context("artist-id"));
  assert.equal(first.status, 200);
  assert.equal((await first.json()).state, "unavailable");
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.equal(calls[0].url, "https://api.spotify.com/v1/artists/artist-id");
  assert.equal(calls[0].signal, firstRequest.signal);
  await route.GET(requestGenres("artist-id"), context("artist-id"));
  assert.equal(calls.length, 1);
  supplied = true;
  const retried = await (await route.GET(requestGenres("artist-id", true), context("artist-id"))).json();
  assert.equal(retried.state, "complete");
  assert.deepEqual(retried.genres, ["ambient"]);
  await route.GET(requestGenres("artist-id"), context("artist-id"));
  assert.equal(calls.length, 2);
});

test("artist success cache is shared with collection, while omission cache stays scoped to identity", async () => {
  const calls = [];
  const run = runtime({ fetch: async (url) => { calls.push(url); return String(url).includes("?ids=") ? Response.json({ artists: [{ id: "a", genres: ["rock"] }, { id: "b" }] }) : Response.json({ id: "b", genres: [] }); } });
  const api = run.load("src/lib/spotify.ts");
  await api.fetchArtistGenresDetailed("first-identity", ["a", "b"]);
  const cached = await api.fetchArtistGenresDetailed("first-identity", ["a", "b"], { individual: true });
  assert.deepEqual(plain(cached.byArtist), { a: ["rock"] });
  assert.deepEqual(plain(cached.unavailableArtistIds), ["b"]);
  assert.equal(calls.length, 1);
  const second = await api.fetchArtistGenresDetailed("second-identity", ["b"], { individual: true });
  assert.deepEqual(plain(second.byArtist), { b: [] });
  assert.equal(calls.length, 2);
});

test("omitted genre field is retried after its short cache expires", async () => {
  let now = 0, calls = 0;
  class Clock extends Date { static now() { return now; } }
  const run = runtime({ globals: { Date: Clock }, fetch: async () => Response.json({ id: "a", ...(++calls > 1 ? { genres: ["rock"] } : {}) }) });
  const api = run.load("src/lib/spotify.ts");
  await api.fetchArtistGenresDetailed("fixture-token", ["a"], { individual: true });
  await api.fetchArtistGenresDetailed("fixture-token", ["a"], { individual: true });
  assert.equal(calls, 1);
  now = 10 * 60 * 1000 + 1;
  assert.deepEqual(plain((await api.fetchArtistGenresDetailed("fixture-token", ["a"], { individual: true })).byArtist), { a: ["rock"] });
  assert.equal(calls, 2);
});

test("genre endpoint preserves provider errors and retry delay; unauthenticated lookup never contacts provider", async () => {
  for (const status of [401, 403, 404, 429, 503]) {
    const run = runtime({ fetch: async () => Response.json({ error: { reason: status === 429 ? "QUOTA_EXCEEDED" : "UPSTREAM" } }, { status, headers: { "Retry-After": "9" } }) });
    const response = await run.load("src/app/api/artists/[id]/genres/route.ts").GET(requestGenres("a"), context("a"));
    assert.equal(response.status, status === 503 ? 502 : status);
    assert.equal(response.headers.get("retry-after"), "9");
    const body = await response.json();
    assert.equal(body.state, "error");
    assert.deepEqual(body.genres, []);
    assert.equal(JSON.stringify(body).includes("fixture-token"), false);
  }
  const noSession = runtime({ session: { getValidAccessToken: async () => null } });
  const response = await noSession.load("src/app/api/artists/[id]/genres/route.ts").GET(requestGenres("a"), context("a"));
  assert.equal(response.status, 401);
});

test("genre mock has explicit per-ID fixtures and no provider fallback for unknown artist", async () => {
  const route = runtime({ mock: true }).load("src/app/api/artists/[id]/genres/route.ts");
  for (const id of ["demo-vertice", "mock-artist-01"]) {
    const body = await (await route.GET(requestGenres(id), context(id))).json();
    assert.equal(body.artistId, id);
    assert.equal(body.source, "demo");
    assert.deepEqual(body.genres, ["indie", "electronic"]);
  }
  assert.equal((await (await route.GET(requestGenres("demo-empty"), context("demo-empty"))).json()).state, "empty");
  assert.equal((await route.GET(requestGenres("unknown"), context("unknown"))).status, 404);
});

test("artist client validates matching identity and explicit empty/unavailable without inventing genres", async () => {
  for (const [body, accepted] of [
    [{ artistId: "a", genres: [], source: "spotify-artist", state: "unavailable" }, true],
    [{ artistId: "a", genres: [], source: "spotify-artist", state: "empty" }, true],
    [{ artistId: "a", genres: [" Rock "], source: "spotify-artist", state: "complete" }, true],
    [{ artistId: "b", genres: ["rock"], source: "spotify-artist", state: "complete" }, false],
    [{ artistId: "a", genres: [], source: "spotify-artist", state: "complete" }, false],
    [{ artistId: "a", genres: ["rock"], source: "spotify-artist", state: "empty" }, false],
  ]) {
    const client = runtime({ fetch: async () => Response.json(body) }).load("src/lib/artistGenreClient.ts");
    const pending = client.fetchArtistGenres("a", new AbortController().signal);
    if (accepted) assert.equal((await pending).state, body.state);
    else await assert.rejects(pending, (error) => error.status === 502);
  }
});

function hookRuntime(fetch) {
  const cells = [], effects = [], pending = [], intervals = new Map();
  let cursor = 0, dirty = false, args = [undefined, false], output, now = 10000;
  const react = {
    useRef: (value) => { const index = cursor++; return cells[index] ??= { current: value }; },
    useState: (value) => { const index = cursor++; if (!(index in cells)) cells[index] = typeof value === "function" ? value() : value; return [cells[index], (next) => { cells[index] = typeof next === "function" ? next(cells[index]) : next; dirty = true; }]; },
    useEffect: (effect, deps) => { const index = cursor++; if (!effects[index] || deps.some((value, i) => !Object.is(value, effects[index].deps[i]))) pending.push({ index, effect, deps }); },
  };
  class Clock extends Date { static now() { return now; } }
  const run = runtime({ react, fetch, globals: { Date: Clock, setInterval: (callback) => { const key = Symbol(); intervals.set(key, callback); return key; }, clearInterval: (key) => intervals.delete(key) } });
  const hook = run.load("src/hooks/useArtistGenres.ts").useArtistGenres;
  const render = (...next) => {
    if (next.length) args = next;
    for (let iteration = 0; iteration < 12; iteration++) {
      dirty = false; cursor = 0; output = hook(...args);
      for (const entry of pending.splice(0)) { effects[entry.index]?.cleanup?.(); effects[entry.index] = { deps: entry.deps, cleanup: entry.effect() }; }
      if (!dirty) return output;
    }
    throw new Error("render did not settle");
  };
  return { render, async flush() { for (let i = 0; i < 12; i++) { await Promise.resolve(); if (dirty) render(); } return output; }, tick(milliseconds) { now += milliseconds; for (const callback of intervals.values()) callback(); return render(); }, close() { for (const effect of effects) effect?.cleanup?.(); } };
}

test("switching selected artists aborts the old request; late response cannot replace the active artist", async () => {
  const old = deferred(), calls = [];
  const run = hookRuntime(async (url, options) => { calls.push({ url, signal: options.signal }); return url.includes("/a/") ? old.promise : Response.json({ artistId: "b", genres: ["ambient"], source: "spotify-artist", state: "complete" }); });
  assert.equal(run.render("a", true).state, "loading");
  run.render("b", true);
  assert.equal(calls[0].signal.aborted, true);
  assert.deepEqual(plain((await run.flush()).genres), ["ambient"]);
  old.resolve(Response.json({ artistId: "a", genres: ["wrong old genre"], source: "spotify-artist", state: "complete" }));
  assert.deepEqual(plain((await run.flush()).genres), ["ambient"]);
  run.render("b", false);
  assert.equal(run.render("b", true).state, "complete");
  assert.equal(calls.length, 2);
  run.close();
});

test("unavailable lookup stays cached across navigation but manual retry explicitly refreshes it", async () => {
  const calls = [];
  const run = hookRuntime(async (url) => { calls.push(url); return Response.json({ artistId: "a", genres: calls.length === 1 ? [] : ["rock"], source: "spotify-artist", state: calls.length === 1 ? "unavailable" : "complete" }); });
  run.render("a", true);
  assert.equal((await run.flush()).state, "unavailable");
  run.render("a", false); run.render("a", true);
  assert.equal(calls.length, 1);
  run.render().retry(); run.render();
  assert.deepEqual(plain((await run.flush()).genres), ["rock"]);
  assert.equal(calls[1], "/api/artists/a/genres?retry=1");
  run.close();
});

test("genre retry waits for Retry-After and does not drop a previously available result", async () => {
  let calls = 0;
  const run = hookRuntime(async () => ++calls === 1 ? Response.json({ artistId: "a", genres: ["rock"], source: "spotify-artist", state: "complete" }) : new Response("limited", { status: 429, headers: { "Retry-After": "3" } }));
  run.render("a", true); await run.flush();
  run.render().retry(); run.render();
  const limited = await run.flush();
  assert.equal(limited.state, "error");
  assert.deepEqual(plain(limited.genres), ["rock"]);
  assert.equal(limited.waitSeconds, 3);
  limited.retry(); run.render(); await run.flush();
  assert.equal(calls, 2);
  assert.equal(run.tick(3000).waitSeconds, 0);
  run.render().retry(); run.render(); await run.flush();
  assert.equal(calls, 3);
  run.close();
});

test("collection refreshes expired session before requesting albums or genres", async () => {
  const calls = [];
  const run = runtime({ session: { getSession: async () => ({ accessToken: "expired-fixture", refreshToken: "refresh-fixture", isExpired: true }), getValidAccessToken: async () => { calls.push("refresh"); return "renewed-fixture"; } }, fetch: async (_url, options) => { calls.push(options.headers.Authorization); return Response.json({ items: [{ album: { id: "a", name: "A", uri: "spotify:album:a", images: [], artists: [{ id: "artist-a", name: "Artist" }] } }], next: null }); } });
  const route = run.load("src/app/api/collection/route.ts");
  const response = await route.GET({ nextUrl: new URL("http://local/api/collection?includeGenres=0") });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["refresh", "Bearer renewed-fixture"]);
});

test("collection marks omitted genres as unavailable, retains catalog, and explicit retry can recover", async () => {
  let genreCalls = 0;
  const run = runtime({ session: { getSession: async () => ({ accessToken: "fixture-token" }) }, fetch: async (url) => {
    if (String(url).includes("/me/albums")) return Response.json({ items: [{ album: { id: "a", name: "A", uri: "spotify:album:a", images: [], artists: [{ id: "artist-a", name: "Artist" }] } }], next: null });
    genreCalls++;
    return Response.json({ artists: [{ id: "artist-a", ...(genreCalls > 1 ? { genres: ["rock"] } : {}) }] });
  } });
  const route = run.load("src/app/api/collection/route.ts");
  const request = (retry = false) => ({ nextUrl: new URL(`http://local/api/collection?includeGenres=1${retry ? "&retry=1" : ""}`) });
  const first = await route.GET(request());
  assert.equal(first.headers.get("X-CDV-Genres-State"), "unavailable");
  assert.equal((await first.json())[0].id, "a");
  await route.GET(request());
  assert.equal(genreCalls, 1);
  const recovered = await route.GET(request(true));
  assert.equal(recovered.headers.get("X-CDV-Genres-State"), "complete");
  assert.deepEqual((await recovered.json())[0].genres, ["rock"]);
  assert.equal(genreCalls, 2);
});
