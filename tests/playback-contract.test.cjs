const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(source, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const javascript = ts.transpileModule(fs.readFileSync(source, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(javascript, { module, exports: module.exports, require: (name) => dependencies[name], Date, setTimeout, clearTimeout, AbortController, AbortSignal, ...globals }, { filename: source });
  return module.exports;
}
const coordinator = () => load("src/lib/playbackSnapshotCoordinator.ts");
const album = { id: "album-a", uri: "spotify:album:album-a", name: "A", artists: [], images: [] };
const snapshot = (overrides = {}) => ({ sampledAt: Date.now(), deviceId: "device-a", isPlaying: true, track: { id: "track-a", album: { id: "album-a" } }, ...overrides });

test("solo una observación fresca del álbum/dispositivo del intento vigente confirma", () => {
  const api = coordinator();
  let notifications = 0;
  const unsubscribe = api.subscribePlaybackConfirmation(() => { notifications++; });
  const attempt = api.beginPlaybackAttempt(album, "device-a");
  const time = Date.now();
  for (const invalid of [snapshot({ sampledAt: time - 10000 }), snapshot({ sampledAt: time + 20000 }), snapshot({ isPlaying: false }), snapshot({ deviceId: "other" }), snapshot({ track: { id: "other", album: { id: "other-album" } } }), snapshot({ sampledAt: undefined })]) {
    assert.equal(api.confirmPlaybackSnapshot(attempt, invalid, time), false);
    assert.equal(api.getConfirmedPlayback(), null);
    assert.equal(notifications, 0);
  }
  assert.equal(api.confirmPlaybackSnapshot(attempt, snapshot(), time), true);
  assert.equal(api.getConfirmedPlayback().attemptId, attempt.attemptId);
  assert.equal(notifications, 1);
  unsubscribe();
});

test("doble clic no abre otro intento y respuestas de intentos terminados no confirman", () => {
  const api = coordinator();
  const old = api.beginPlaybackAttempt(album, "device-a");
  assert.equal(api.beginPlaybackAttempt(album, "device-a"), null);
  api.finishPlaybackAttempt(old.attemptId);
  const current = api.beginPlaybackAttempt(album, "device-a");
  assert.notEqual(current.attemptId, old.attemptId);
  assert.equal(api.confirmPlaybackSnapshot(old, snapshot(), Date.now()), false);
  api.finishPlaybackAttempt(old.attemptId);
  assert.equal(api.isActivePlaybackAttempt(current.attemptId), true);
});

function executionHarness(observation, { dockReady = true } = {}) {
  const api = coordinator();
  const events = [];
  const volumes = [];
  const listeners = new Map();
  let calls = 0;
  const player = { getVolume: async () => .6, setVolume: async (value) => { volumes.push(value); }, pause: async () => {}, seek: async () => {}, resume: async () => {} };
  const runtime = load("src/lib/discPlayback.ts", { "./playbackSnapshotCoordinator": api, "./mockSpotifyStore": {} }, {
    process: { env: { NEXT_PUBLIC_SPOTIFY_MOCK: "0" } },
    document: { documentElement: { dataset: { discFlightPlaybackReady: dockReady ? "true" : "false" } } },
    window: {
      dispatchEvent: (event) => events.push(event), setTimeout: (fn, ms) => setTimeout(fn, ms > 10000 ? 45 : 1), clearTimeout,
      addEventListener: (name, listener) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener); },
      removeEventListener: (name, listener) => listeners.get(name)?.delete(listener),
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    fetch: async (url) => { if (url === "/api/play") { calls++; return { ok: true, json: async () => ({ success: true }) }; } return { ok: true, json: async () => observation() }; },
  });
  return { api, events, volumes, listeners, get calls() { return calls; }, execute: runtime.createDiscPlaybackExecution(album, "device-a", player), create: () => runtime.createDiscPlaybackExecution(album, "device-a", player) };
}
test("HTTP 200 y acople sin snapshot coherente terminan en timeout sin confirmar", async () => {
  const run = executionHarness(() => snapshot({ track: { id: "old-track", album: { id: "old-album" } } }));
  const result = await run.execute();
  assert.equal(result.success, false);
  assert.equal(run.api.getConfirmedPlayback(), null);
  assert.equal(run.events.some((event) => event.type === "cdvicious:disc-flight-playback-started"), false);
  assert.deepEqual(run.volumes, [0, .6]);
});
test("ejecución idempotente publica playback-started solo después de observar confirmación", async () => {
  const run = executionHarness(() => snapshot());
  assert.equal(run.create(), null);
  const [first, second] = await Promise.all([run.execute(), run.execute()]);
  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(run.calls, 1);
  assert.equal(run.events.filter((event) => event.type === "cdvicious:disc-flight-playback-started").length, 1);
  assert.deepEqual(run.volumes, [0, .6]);
});

test("cancelar la espera de acople restaura volumen y retira listeners sin confirmar", async () => {
  const run = executionHarness(() => snapshot(), { dockReady: false });
  const result = await run.execute();
  assert.equal(result.success, false);
  assert.equal(run.api.getConfirmedPlayback(), null);
  assert.equal(run.api.isActivePlaybackAttempt(run.events[0].detail.attemptId), false);
  assert.equal([...run.listeners.values()].reduce((total, entries) => total + entries.size, 0), 0);
  assert.deepEqual(run.volumes, [0, .6]);
});
