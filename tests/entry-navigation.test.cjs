const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { NextResponse } = require("next/server");

function transpile(file, imports = {}, env = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, URL, URLSearchParams,
    process: { env }, require: (name) => imports[name] });
  return module.exports;
}
const entry = transpile("src/lib/entryNavigation.ts");
const origin = "http://127.0.0.1:3006";

test("opción A solo existe con una intención explícita y el destino de reauth tiene prioridad", () => {
  assert.equal(entry.initialChapter(new URLSearchParams()), null);
  assert.equal(entry.initialChapter(new URLSearchParams("entry=collection")), 3);
  assert.equal(entry.initialChapter(new URLSearchParams("chapter=1&entry=collection")), 1);
  assert.equal(entry.initialChapter(new URLSearchParams("chapter=split")), 1);
  for (const value of ["5", "-1", "01", "1.0", "unknown", ""]) assert.equal(entry.chapterIndex(value), null);
});

test("destino OAuth queda acotado al root y a cinco capítulos conocidos", () => {
  assert.equal(entry.safeAuthReturn("/?chapter=3&album=arbitrary&entry=collection#fragment", origin), "/?chapter=3");
  assert.equal(entry.safeAuthReturn("/?chapter=batea", origin), "/?chapter=2");
  for (const value of [null, "https://evil.example/?chapter=1", "//evil.example/?chapter=1", "/\\evil.example/?chapter=1", "/path?chapter=1", "/?chapter=9", "/?entry=collection", "?chapter=1"]) {
    assert.equal(entry.safeAuthReturn(value, origin), null);
  }
});

function login(env = { SPOTIFY_CLIENT_ID: "fixture-client", SPOTIFY_CLIENT_SECRET: "fixture-secret", SPOTIFY_REDIRECT_URI: `${origin}/api/auth/callback` }) {
  return transpile("src/app/api/auth/login/route.ts", {
    "next/server": { NextResponse },
    crypto: { randomBytes: () => ({ toString: () => "fixture-state" }) },
    "@/lib/spotify": { buildAuthUrl: (state) => `https://accounts.spotify.com/authorize?state=${state}` },
    "@/lib/entryNavigation": entry,
  }, env);
}
const loginRequest = (query = "") => ({ nextUrl: new URL(`${origin}/api/auth/login${query}`) });

test("login nuevo guarda Colección como entrada y vincula intención a cookies OAuth de cinco minutos", async () => {
  const response = await login().GET(loginRequest());
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://accounts.spotify.com/authorize?state=fixture-state");
  const destination = response.cookies.get("sp_oauth_return");
  assert.equal(destination.value, "/?entry=collection");
  assert.equal(destination.httpOnly, true);
  assert.equal(destination.sameSite, "lax");
  assert.equal(destination.maxAge, 300);
  assert.equal(response.cookies.get("sp_oauth_state").value, "fixture-state");
});

test("reauth conserva capítulo y login rechaza redirect externo sin redirigir fuera del proveedor", async () => {
  const api = login();
  const good = await api.GET(loginRequest(`?returnTo=${encodeURIComponent("/?chapter=split")}`));
  assert.equal(good.cookies.get("sp_oauth_return").value, "/?chapter=1");
  const unsafe = await api.GET(loginRequest(`?returnTo=${encodeURIComponent("//evil.example/?chapter=1")}`));
  assert.equal(unsafe.cookies.get("sp_oauth_return").value, "/?entry=collection");
});

test("sin configuración OAuth conserva el 503 existente y no fabrica estado ni destino", async () => {
  const response = await login({}).GET(loginRequest());
  assert.equal(response.status, 503);
  assert.equal(response.cookies.get("sp_oauth_state"), undefined);
  assert.equal(response.cookies.get("sp_oauth_return"), undefined);
  assert.equal((await response.json()).error, "SPOTIFY_NOT_CONFIGURED");
});
