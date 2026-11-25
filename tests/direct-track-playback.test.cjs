const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(filename, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, {
    module, exports: module.exports, require: name => dependencies[name], AbortSignal, ...globals,
  }, { filename });
  return module.exports;
}

const albumId = "5ht7ItJgpBH7W6vJ5BqpPr";
const selection = { albumId, trackId: "desired", position: 4 };
const target = { deviceId: "web-device", sdkDeviceId: "web-device" };
const snapshot = (trackId, options = {}) => ({
  deviceId: target.deviceId,
  sampledAt: 10_000,
  isPlaying: true,
  progressMs: 0,
  track: { id: trackId, album: { id: albumId } },
  ...options,
});
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness(initial = snapshot("old")) {
  const { createDirectTrackPlayback } = load("src/lib/directTrackPlayback.ts");
  const listeners = new Set();
  const requests = [];
  let current = { data: initial, requestStartedAt: Date.now() };
  let refreshes = 0;
  const run = createDirectTrackPlayback({
    read: () => current,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    request: async (owner, requested, signal) => { requests.push({ owner, requested, signal }); },
    refresh: () => refreshes++,
  });
  return {
    run, listeners, requests, read: () => current, refreshes: () => refreshes,
    publish(data, requestStartedAt = Date.now()) {
      current = { data, requestStartedAt };
      for (const notify of listeners) notify();
    },
  };
}

test("an acknowledged track jump waits for the right fresh canonical snapshot", async () => {
  const run = harness(), owner = new AbortController();
  const picked = { ...selection, linkedFromId: "original-id" };
  let confirmed = false;
  const result = run.run(target, picked, owner.signal).then(() => { confirmed = true; });
  await settle();
  assert.equal(run.requests.length, 1);
  assert.equal(run.requests[0].owner.deviceId, "web-device");
  assert.equal(run.requests[0].requested.position, 4);
  assert.equal(run.refreshes(), 1);
  // Even a later server timestamp and exact target are stale if the client
  // request was already in flight when the user picked the track.
  run.publish(snapshot("desired", { sampledAt: 10_002 }), 0);
  for (const wrong of [
    snapshot("desired", { isPlaying: false }),
    snapshot("desired", { deviceId: "different" }),
    snapshot("desired", { sampledAt: 9_999 }),
    snapshot("desired", { track: { id: "desired", album: { id: "wrong" } } }),
    snapshot("previous-track"),
  ]) run.publish(wrong);
  await settle();
  assert.equal(confirmed, false);
  run.publish(snapshot("original-id", { sampledAt: 10_001 }));
  await result;
  assert.equal(run.listeners.size, 0);
});

test("the direct command rejects another album/device before transport and aborts an old observer", async () => {
  const run = harness(), owner = new AbortController();
  await assert.rejects(run.run(target, { ...selection, albumId: "different" }, owner.signal), /activo cambió/);
  await assert.rejects(run.run({ ...target, sdkDeviceId: "elsewhere" }, selection, owner.signal), /activo cambió/);
  assert.equal(run.requests.length, 0);
  const command = run.run(target, selection, owner.signal);
  await settle();
  owner.abort();
  await assert.rejects(command, { name: "AbortError" });
  assert.equal(run.listeners.size, 0);
});

test("a newly docked album can be selected until the poll catches up, without reviving an old device or cleared disc", () => {
  const { createTrackSelectionBaseline } = load("src/lib/directTrackPlayback.ts");
  const handoff = { phase: "confirmed", attempt: { attemptId: "just-docked" }, snapshot: snapshot("current") };
  const previous = snapshot("previous", { sampledAt: 9_999, track: { id: "previous", album: { id: "older-disc" } } });
  let observed = previous;
  const readBaseline = createTrackSelectionBaseline(() => observed, () => handoff);
  assert.equal(readBaseline(), handoff.snapshot);
  observed = { ...previous, deviceId: "external" };
  assert.equal(readBaseline(), observed);
  observed = snapshot("current", { sampledAt: 10_001 });
  assert.equal(readBaseline(), observed);
  observed = null;
  assert.equal(readBaseline(), null);
});

test("restarting the current track waits for a new zero-position observation", async () => {
  const initial = snapshot("desired", { progressMs: 45_000 });
  const run = harness(initial), owner = new AbortController();
  let confirmed = false;
  const command = run.run(target, selection, owner.signal).then(() => { confirmed = true; });
  await settle();
  run.publish(snapshot("desired", { progressMs: 46_000, sampledAt: 10_001 }));
  await settle();
  assert.equal(confirmed, false);
  run.publish(snapshot("desired", { sampledAt: 10_002 }));
  await command;
  assert.equal(run.listeners.size, 0);
});

function routeHarness({ token = "fixture-session", providerStatus = 204 } = {}) {
  const outgoing = [];
  const route = load("src/app/api/play/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/session": { getValidAccessToken: async () => token, clearSession: async () => undefined },
    "@/lib/spotify": { fetchSpotifyWebApi: async (...params) => {
      outgoing.push(params);
      return new Response(null, { status: providerStatus, headers: { "Retry-After": "3" } });
    } },
  }, { process: { env: { NEXT_PUBLIC_SPOTIFY_MOCK: "0" } } });
  return { ...route, outgoing };
}
const playRequest = (overrides = {}) => new Request("http://local/api/play", {
  method: "POST", body: JSON.stringify({ uri: `spotify:album:${albumId}`, deviceId: "web/a+b", trackPosition: 4, ...overrides }),
});

test("the authenticated provider command sends the album context, exact offset and SDK device", async () => {
  const run = routeHarness();
  const request = playRequest();
  const response = await run.POST(request);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  const [token, endpoint, url, init] = run.outgoing[0];
  assert.equal(token, "fixture-session");
  assert.equal(endpoint, "PUT /v1/me/player/play");
  assert.equal(new URL(url).searchParams.get("device_id"), "web/a+b");
  assert.equal(init.method, "PUT");
  assert.equal(init.headers.Authorization, "Bearer fixture-session");
  assert.deepEqual(JSON.parse(init.body), { context_uri: `spotify:album:${albumId}`, offset: { position: 4 }, position_ms: 0 });
  assert.equal(init.signal, request.signal);
});

test("bad offsets or missing auth never reach the provider and rate limits keep Retry-After", async () => {
  const invalid = routeHarness();
  for (const body of [{ trackPosition: -1 }, { trackPosition: 1.5 }, { trackPosition: "4" }, { uri: "spotify:track:4iV5W9uYEdYUVa79Axb7Rh" }]) {
    assert.equal((await invalid.POST(playRequest(body))).status, 400);
  }
  assert.equal(invalid.outgoing.length, 0);
  const unauthorized = routeHarness({ token: null });
  assert.equal((await unauthorized.POST(playRequest())).status, 401);
  assert.equal(unauthorized.outgoing.length, 0);
  const limited = routeHarness({ providerStatus: 429 });
  const response = await limited.POST(playRequest());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "3");
});
