// Regression against the actual source modules. All tokens are
// fictional fixtures; no browser, real HTTP, Spotify account or cookie jar.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { NextResponse } = require("next/server");

function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const javascript = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(javascript, { module, exports: module.exports, require: (name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, console: { log() {}, error() {} }, process: { env: { NEXT_PUBLIC_SPOTIFY_MOCK: "0" } }, ...globals }, { filename: file });
  return module.exports;
}

function providerHarness() {
  let serverToken = "fixture-sdk-initial";
  let sessionRequests = 0;
  let failure = false;
  const client = load("src/lib/clientSession.ts", {}, { fetch: async (url) => {
    assert.equal(url, "/api/auth/session");
    sessionRequests++;
    if (failure) throw new Error("Fixture session request failed");
    return { ok: true, json: async () => ({ authenticated: !!serverToken, accessToken: serverToken }) };
  } });
  const cells = [];
  const effects = [];
  let cursor = 0;
  let dirty = true;
  let queued = [];
  const react = {
    createContext: (value) => ({ value, Provider: "fixture-provider" }),
    useContext: (context) => context.value,
    useState: (initial) => {
      const index = cursor++;
      if (!(index in cells)) cells[index] = initial;
      return [cells[index], (next) => {
        const value = typeof next === "function" ? next(cells[index]) : next;
        if (!Object.is(cells[index], value)) { cells[index] = value; dirty = true; }
      }];
    },
    useEffect: (callback, dependencies) => {
      const index = cursor++;
      const previous = effects[index];
      if (!previous || dependencies.some((value, at) => !Object.is(value, previous.dependencies[at]))) queued.push({ index, callback, dependencies });
    },
  };
  const scripts = [];
  const players = [];
  let context;
  const browser = { dispatchEvent() {}, Spotify: { Player: class {
    constructor(options) { this.options = options; this.listeners = {}; this.disconnects = 0; players.push(this); }
    addListener(name, callback) { this.listeners[name] = callback; }
    removeListener() {}
    connect() { return Promise.resolve(true); }
    disconnect() { this.disconnects++; }
  } } };
  const document = {
    createElement: () => ({ src: "", async: false }),
    body: { appendChild: (element) => scripts.push(element), contains: (element) => scripts.includes(element), removeChild: (element) => scripts.splice(scripts.indexOf(element), 1) },
  };
  const provider = load("src/components/SpotifyPlayerProvider.tsx", {
    react,
    "react/jsx-runtime": { jsx: (type, props) => { context = props.value; return { type, props }; } },
    "@/lib/clientSession": client,
    "@/lib/serializedPlayerVolume": load("src/lib/serializedPlayerVolume.ts"),
    "@/lib/mockSpotifyStore": { mockSpotifyPlayer: {} },
  }, { window: browser, document, Event: class { constructor(type) { this.type = type; } } });
  function render() {
    dirty = false;
    cursor = 0;
    provider.SpotifyPlayerProvider({ children: null });
    const pending = queued;
    queued = [];
    for (const effect of pending) {
      effects[effect.index]?.cleanup?.();
      effects[effect.index] = { dependencies: effect.dependencies, cleanup: effect.callback() };
    }
  }
  async function settle() {
    for (let index = 0; index < 12; index++) {
      if (dirty) render();
      await new Promise(setImmediate);
      if (!dirty && queued.length === 0) return;
    }
    throw new Error("Fixture did not settle");
  }
  return {
    async boot() {
      await settle();
      assert.equal(typeof browser.onSpotifyWebPlaybackSDKReady, "function");
      browser.onSpotifyWebPlaybackSDKReady();
      players[0].listeners.ready({ device_id: "fixture-sdk-device" });
      await settle();
    },
    async sdkToken() { return new Promise((resolve) => players.at(-1).options.getOAuthToken(resolve)); },
    requestSdkToken(callback) { players.at(-1).options.getOAuthToken(callback); },
    refreshServerSession() { serverToken = "fixture-sdk-refreshed"; },
    expireServerSession() { serverToken = null; },
    failSessionRequest(value) { failure = value; },
    settle,
    unmount() { for (const effect of effects) effect?.cleanup?.(); },
    get sessionRequests() { return sessionRequests; },
    get connectedPlayers() { return players.length; },
    get disconnects() { return players.reduce((count, player) => count + player.disconnects, 0); },
    get context() { return context; },
  };
}

test("fixture: the real provider initializes one SDK player from the initial session", async () => {
  const run = providerHarness();
  await run.boot();
  assert.equal(await run.sdkToken(), "fixture-sdk-initial");
  assert.equal(run.connectedPlayers, 1);
});

test("SDK renewal must obtain the current session token instead of a captured startup token", async () => {
  const run = providerHarness();
  await run.boot();
  assert.equal(await run.sdkToken(), "fixture-sdk-initial");
  run.refreshServerSession();
  assert.equal(await run.sdkToken(), "fixture-sdk-refreshed");
  await run.settle();
  assert.equal(run.connectedPlayers, 1, "Refreshing the SDK token must not replace the active device");
  assert.equal(run.disconnects, 0);
  assert.equal(run.context.deviceId, "fixture-sdk-device");
  assert.equal(run.context.isReady, true);
});

test("simultaneous SDK callbacks share the fresh session request", async () => {
  const run = providerHarness();
  await run.boot();
  const requestsBefore = run.sessionRequests;
  run.refreshServerSession();
  assert.deepEqual(await Promise.all([run.sdkToken(), run.sdkToken()]), ["fixture-sdk-refreshed", "fixture-sdk-refreshed"]);
  assert.equal(run.sessionRequests, requestsBefore + 1);
  assert.equal(run.connectedPlayers, 1);
});

test("failed SDK renewal does not reuse a cached token and can retry", async () => {
  const run = providerHarness();
  await run.boot();
  assert.equal(await run.sdkToken(), "fixture-sdk-initial");
  run.failSessionRequest(true);
  const received = [];
  run.requestSdkToken((token) => received.push(token));
  await run.settle();
  assert.deepEqual(received, []);
  assert.equal(run.context.authenticated, false);
  run.failSessionRequest(false);
  run.refreshServerSession();
  assert.equal(await run.sdkToken(), "fixture-sdk-refreshed");
  await run.settle();
  assert.equal(run.context.authenticated, true);
  assert.equal(run.context.deviceId, "fixture-sdk-device");
  assert.equal(run.connectedPlayers, 1);
  assert.equal(run.disconnects, 0);
});

test("expired session never supplies the old token to the SDK", async () => {
  const run = providerHarness();
  await run.boot();
  run.expireServerSession();
  const received = [];
  run.requestSdkToken((token) => received.push(token));
  await run.settle();
  assert.deepEqual(received, []);
  assert.equal(run.context.authenticated, false);
});

test("a session response after provider cleanup cannot reach the old SDK callback", async () => {
  const run = providerHarness();
  await run.boot();
  const received = [];
  run.requestSdkToken((token) => received.push(token));
  run.unmount();
  await new Promise(setImmediate);
  assert.deepEqual(received, []);
  assert.equal(run.disconnects, 1);
});

test("expired auth/session must supply a refreshed token for the SDK", async () => {
  let refreshChecks = 0;
  const route = load("src/app/api/auth/session/route.ts", {
    "next/server": { NextResponse },
    "@/lib/session": {
      getSession: async () => ({ accessToken: "fixture-sdk-expired", refreshToken: "fixture-refresh", expiresAt: 0, isExpired: true }),
      getValidAccessToken: async () => { refreshChecks++; return "fixture-sdk-refreshed"; },
    },
  });
  const response = await route.GET();
  const body = await response.json();
  assert.equal(body.accessToken, "fixture-sdk-refreshed");
  assert.equal(refreshChecks, 1);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("auth/session returns an unauthenticated uncached response after failed refresh", async () => {
  const route = load("src/app/api/auth/session/route.ts", {
    "next/server": { NextResponse },
    "@/lib/session": { getValidAccessToken: async () => null },
  });
  const response = await route.GET();
  assert.deepEqual(await response.json(), { authenticated: false, accessToken: null });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("mock auth/session keeps its existing contract without reading a real session", async () => {
  const route = load("src/app/api/auth/session/route.ts", {
    "next/server": { NextResponse },
    "@/lib/session": { getValidAccessToken: async () => assert.fail("Mock must not read live session cookies") },
  }, { process: { env: { NEXT_PUBLIC_SPOTIFY_MOCK: "1" } } });
  const response = await route.GET();
  assert.deepEqual(await response.json(), { authenticated: true, accessToken: null });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("cached consumers join forced renewal and failure invalidates the stale cache", async () => {
  let calls = 0;
  let next;
  const client = load("src/lib/clientSession.ts", {}, { fetch: () => {
    calls++;
    return new Promise((resolve, reject) => { next = { resolve, reject }; });
  } });
  const initial = client.getClientAuthSession();
  next.resolve({ ok: true, json: async () => ({ authenticated: true, accessToken: "fixture-sdk-initial" }) });
  await initial;
  assert.equal((await client.getClientAuthSession()).accessToken, "fixture-sdk-initial");
  assert.equal(calls, 1);
  const renewal = client.getClientAuthSession({ refresh: true });
  assert.equal(client.getClientAuthSession(), renewal);
  assert.equal(client.getClientAuthSession({ refresh: true }), renewal);
  next.reject(new Error("Fixture network failure"));
  await assert.rejects(renewal, /Fixture network failure/);
  const retry = client.getClientAuthSession();
  assert.equal(calls, 3, "A failed fresh request must not make the old cached session visible");
  next.resolve({ ok: true, json: async () => ({ authenticated: true, accessToken: "fixture-sdk-refreshed" }) });
  assert.equal((await retry).accessToken, "fixture-sdk-refreshed");
});
