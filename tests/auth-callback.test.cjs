const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { NextResponse } = require("next/server");
const entryModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/entryNavigation.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { module: entryModule, exports: entryModule.exports, URL, URLSearchParams });

function callback({ exchange, save = async () => {}, env = {} }) {
  const module = { exports: {} };
  const messages = [];
  const js = ts.transpileModule(fs.readFileSync("src/app/api/auth/callback/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(js, {
    module, exports: module.exports, URL, Error,
    process: { env }, console: { error: (...args) => messages.push(args) },
    require: (name) => ({
      "next/server": { NextResponse },
      "@/lib/spotify": { exchangeCodeForTokens: exchange },
      "@/lib/session": { setSession: save },
      "@/lib/entryNavigation": entryModule.exports,
    })[name],
  });
  return { GET: module.exports.GET, messages };
}

function request(state = "matching", returnTo) {
  return {
    nextUrl: new URL(`http://127.0.0.1:3002/api/auth/callback?code=one-use-code&state=${state}`),
    cookies: { get: (name) => name === "sp_oauth_state" ? { value: "matching" } : name === "sp_oauth_return" && returnTo ? { value: returnTo } : undefined },
  };
}

test("callback sin APP_URL guarda la sesión y vuelve al origen sin falso error de token", async () => {
  let saved;
  const api = callback({
    exchange: async (code) => {
      assert.equal(code, "one-use-code");
      return { access_token: "private-access", refresh_token: "private-refresh", expires_in: 3600 };
    },
    save: async (session) => { saved = session; },
  });
  const response = await api.GET(request());
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://127.0.0.1:3002/?entry=collection");
  assert.equal(saved.accessToken, "private-access");
  assert.equal(saved.refreshToken, "private-refresh");
  assert.match(response.headers.get("set-cookie"), /sp_oauth_state=;/);
  assert.equal(api.messages.length, 0);
});

test("state inválido no intercambia el código y limpia la cookie", async () => {
  const api = callback({ exchange: async () => { assert.fail("No debe intercambiar un código sin state válido"); } });
  const response = await api.GET(request("different"));
  assert.equal(response.headers.get("location"), "http://127.0.0.1:3002/?auth_error=invalid_state");
  assert.match(response.headers.get("set-cookie"), /sp_oauth_state=;/);
  assert.match(response.headers.get("set-cookie"), /sp_oauth_return=;/);
});

test("callback conserva 127.0.0.1 del redirect configurado si Next normaliza el origen a localhost", async () => {
  const api = callback({
    env: { SPOTIFY_REDIRECT_URI: "http://127.0.0.1:3002/api/auth/callback" },
    exchange: async () => ({ access_token: "private-access", refresh_token: "private-refresh", expires_in: 3600 }),
  });
  const incoming = request();
  incoming.nextUrl = new URL(incoming.nextUrl.href.replace("127.0.0.1", "localhost"));
  const response = await api.GET(incoming);
  assert.equal(response.headers.get("location"), "http://127.0.0.1:3002/?entry=collection");
});

test("rechazo real de Spotify redirige con error absoluto y registra solo el status", async () => {
  const api = callback({ exchange: async () => { throw new Error("spotify token exchange failed: 401"); } });
  const response = await api.GET(request());
  assert.equal(response.headers.get("location"), "http://127.0.0.1:3002/?auth_error=token_exchange_failed");
  assert.equal(api.messages[0][1].status, "401");
  assert.equal(JSON.stringify(api.messages).includes("one-use-code"), false);
});

test("fallo al guardar cookies se distingue del intercambio y respeta APP_URL configurado", async () => {
  const api = callback({
    env: { APP_URL: "https://cd.example" },
    exchange: async () => ({ access_token: "private-access", refresh_token: "private-refresh", expires_in: 3600 }),
    save: async () => { throw new Error("cookie failure private-access"); },
  });
  const response = await api.GET(request());
  assert.equal(response.headers.get("location"), "https://cd.example/?auth_error=session_failed");
  assert.equal(JSON.stringify(api.messages).includes("private-access"), false);
});

test("callback de reautenticación vuelve al capítulo guardado y consume ambas cookies OAuth", async () => {
  const api = callback({ exchange: async () => ({ access_token: "private-access", refresh_token: "private-refresh", expires_in: 3600 }) });
  const response = await api.GET(request("matching", "/?chapter=split&entry=collection"));
  assert.equal(response.headers.get("location"), "http://127.0.0.1:3002/?chapter=1");
  assert.match(response.headers.get("set-cookie"), /sp_oauth_state=;/);
  assert.match(response.headers.get("set-cookie"), /sp_oauth_return=;/);
});

test("callback nunca usa un destino externo o un capítulo inventado", async () => {
  const api = callback({ exchange: async () => ({ access_token: "private-access", refresh_token: "private-refresh", expires_in: 3600 }) });
  for (const destination of ["https://evil.example/?chapter=1", "//evil.example/?chapter=1", "/?chapter=99", "/account?chapter=1", "/\\evil.example/?chapter=1"]) {
    const response = await api.GET(request("matching", destination));
    assert.equal(response.headers.get("location"), "http://127.0.0.1:3002/?entry=collection");
  }
});
