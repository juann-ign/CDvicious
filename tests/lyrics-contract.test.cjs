const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ts = require("typescript");

function routeHarness(respond) {
  const calls = [];
  const cache = new Map();
  const globals = {
    URL, URLSearchParams, Response, Request, AbortController, AbortSignal,
    setTimeout, clearTimeout, console: { error() {}, warn() {}, log() {} },
    process: { env: { NEXT_PUBLIC_SPOTIFY_MOCK: "0" } },
    fetch: async (url, options) => { calls.push({ url: String(url), options }); return respond(new URL(url), options); },
  };
  const load = (file) => {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    if (path.extname(file) === ".json") return JSON.parse(fs.readFileSync(file, "utf8"));
    const module = { exports: {} };
    cache.set(file, module.exports);
    const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const requireLocal = (name) => {
      if (name === "next/server") return { NextResponse: { json: (value, options) => Response.json(value, options) } };
      const resolved = name.startsWith("@/") ? path.join(process.cwd(), "src", name.slice(2)) : name.startsWith(".") ? path.resolve(path.dirname(file), name) : null;
      if (resolved) return load(resolved + (path.extname(resolved) ? "" : ".ts"));
      return require(name);
    };
    vm.runInNewContext(js, { module, exports: module.exports, require: requireLocal, ...globals }, { filename: file });
    cache.set(file, module.exports);
    return module.exports;
  };
  return { calls, GET: load("src/app/api/lyrics/route.ts").GET };
}
const request = (extra = "") => new Request(`http://local/api/lyrics?artist=Demo%20Artist&title=Signal&album=Archive&duration=180${extra}`);
const record = (overrides = {}) => ({ id: 7, trackName: "Signal", artistName: "Demo Artist", albumName: "Archive", duration: 180, instrumental: false, plainLyrics: "One line\nAnother line", syncedLyrics: null, ...overrides });

test("letra valida identidad y duración aunque el primer resultado sea ajeno", async () => {
  const run = routeHarness((url) => url.pathname.endsWith("/get")
    ? Response.json({ message: "not found" }, { status: 404 })
    : Response.json([record({ id: 1, artistName: "Someone Else", duration: 90, plainLyrics: "WRONG" }), record()]));
  const response = await run.GET(request());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "available");
  assert.equal(body.lyrics, "One line\nAnother line");
  assert.equal(body.provenance.provider, "lrclib");
  assert.equal(run.calls.some(({ url }) => new URL(url).searchParams.get("duration") === "180"), true);
});

test("HTTP 200 de upstream con espacios nunca publica letra disponible", async () => {
  const run = routeHarness((url) => Response.json(url.pathname.endsWith("/get") ? record({ plainLyrics: "  \n\t " }) : [record({ plainLyrics: "  \n\t " })]));
  const response = await run.GET(request());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "unavailable");
  assert.equal(body.lyrics, null);
});

test("instrumental requiere declaración explícita del registro validado", async () => {
  for (const instrumental of [true, false]) {
    const run = routeHarness((url) => Response.json(url.pathname.endsWith("/get") ? record({ instrumental, plainLyrics: null }) : [record({ instrumental, plainLyrics: null })]));
    const response = await run.GET(request());
    const body = await response.json();
    assert.equal(body.status, instrumental ? "instrumental" : "unavailable");
    assert.equal(body.lyrics, null);
  }
});

test("no acepta artista, álbum ni duración de otro lanzamiento como letra actual", async () => {
  for (const overrides of [{ artistName: "Other" }, { albumName: "Other" }, { duration: 240 }]) {
    const run = routeHarness((url) => Response.json(url.pathname.endsWith("/get") ? record(overrides) : [record(overrides)]));
    const body = await (await run.GET(request())).json();
    assert.equal(body.status, "unavailable");
    assert.equal(body.lyrics, null);
  }
});

test("error de proveedor conserva fallo HTTP y nunca se imprime como letra", async () => {
  const run = routeHarness(() => Response.json({ message: "upstream failed" }, { status: 503 }));
  const response = await run.GET(request());
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.status, "error");
  assert.equal(body.lyrics, null);
});

test("rate limit conserva Retry-After y no afirma instrumental", async () => {
  const run = routeHarness(() => Response.json({}, { status: 429, headers: { "Retry-After": "9" } }));
  const response = await run.GET(request());
  const body = await response.json();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "9");
  assert.equal(body.status, "error");
  assert.equal(body.lyrics, null);
});

test("404 y respuesta sin letra se distinguen de un fallo de red", async () => {
  const absent = routeHarness(() => Response.json({}, { status: 404 }));
  const notFound = await absent.GET(request());
  assert.equal(notFound.status, 200);
  assert.equal((await notFound.json()).status, "unavailable");
  assert.equal(notFound.headers.get("Cache-Control"), "no-store");
  const offline = routeHarness(() => { throw new TypeError("offline"); });
  const failure = await offline.GET(request());
  assert.equal(failure.status, 502);
  assert.equal((await failure.json()).lyrics, null);
});

test("firma exacta admite el margen documentado de dos segundos y rechaza fuera del margen", async () => {
  for (const difference of [-2, 2, 2.01]) {
    const run = routeHarness((url) => Response.json(url.pathname.endsWith("/get") ? record({ duration: 180 + difference }) : []));
    const body = await (await run.GET(request())).json();
    assert.equal(body.status, Math.abs(difference) <= 2 ? "available" : "unavailable");
  }
});

test("sin datos válidos no consulta proveedor; LRC se presenta sin timestamps", async () => {
  const invalid = routeHarness(() => { throw new Error("must not fetch"); });
  const response = await invalid.GET(new Request("http://local/api/lyrics?artist=Artist&title=Signal&duration=0"));
  assert.equal(response.status, 400);
  assert.equal(invalid.calls.length, 0);
  const synced = routeHarness((url) => Response.json(url.pathname.endsWith("/get") ? record({ plainLyrics: null, syncedLyrics: "[00:01.00]First\n[00:02.00]Second" }) : []));
  const body = await (await synced.GET(request())).json();
  assert.equal(body.status, "available");
  assert.equal(body.lyrics, "First\nSecond");
});
