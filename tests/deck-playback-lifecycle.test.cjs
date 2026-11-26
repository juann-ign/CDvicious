const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(filename, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const javascript = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(javascript, { module, exports: module.exports, require: (name) => dependencies[name], Date, setTimeout, clearTimeout, AbortController, AbortSignal, ...globals }, { filename });
  return module.exports;
}
const tick = () => new Promise(setImmediate);
const album = { id: "album-target", uri: "spotify:album:album-target", name: "Target", artists: [], images: [] };
function harness({ getVolume, setVolume, pause, resume, observation, click, playResponse, clock = Date } = {}) {
  const coordinator = load("src/lib/playbackSnapshotCoordinator.ts", {}, { Date: clock });
  const events = [], operations = [], listeners = new Map(), timers = new Map();
  let timerId = 0, currentVolume = .6;
  class Event { constructor(type) { this.type = type; } }
  class CustomEvent extends Event { constructor(type, { detail }) { super(type); this.detail = detail; } }
  const window = {
    dispatchEvent(event) { events.push(event); for (const listener of [...listeners.get(event.type) ?? []]) listener(event); },
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    setTimeout(callback, ms) { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const player = {
    getVolume: async () => { operations.push(["get-volume"]); return getVolume ? getVolume() : currentVolume; },
    setVolume: async (value) => { operations.push(["volume", value]); await setVolume?.(value); currentVolume = value; },
    pause: async () => { operations.push(["pause"]); return pause?.(); },
    seek: async (value) => { operations.push(["seek", value]); },
    resume: async () => { operations.push(["resume"]); return resume?.(); },
  };
  const mechanical = { armMechanicalDockClick: () => ({ play: async (options) => { operations.push(["click", options.safeToPlay]); return click ? click(options) : options.safeToPlay ? "disabled" : "unsafe"; }, dispose() { operations.push(["dispose"]); } }) };
  const runtime = load("src/lib/discPlayback.ts", { "./playbackSnapshotCoordinator": coordinator, "./mockPlayback": { mockPlayback: null }, "./mechanicalDockClick": mechanical }, {
    process: { env: { NEXT_PUBLIC_SPOTIFY_MOCK: "0" } }, window, Date: clock,
    document: { documentElement: { dataset: {} }, visibilityState: "visible" },
    Event, CustomEvent,
    fetch: async (url, options) => {
      operations.push(["fetch", url, options?.body]);
      if (url === "/api/play" && playResponse) return playResponse(options);
      return { ok: true, status: 200, json: async () => url === "/api/play" ? { success: true } : observation ? observation() : { sampledAt: Date.now(), deviceId: "device-target", isPlaying: true, track: { id: "track-target", album: { id: album.id } } } };
    },
  });
  const execute = runtime.createDiscPlaybackExecution(album, "device-target", player);
  return {
    execute, coordinator, events, operations, listeners, timers,
    attempt: execute.attempt ?? events[0].detail,
    create: () => runtime.createDiscPlaybackExecution(album, "device-target", player),
    event(type, attemptId) { window.dispatchEvent(new CustomEvent(type, { detail: { attemptId } })); },
    async cleanup(task) {
      for (let pass = 0; pass < 5; pass++) {
        const batch = [...timers.values()]; timers.clear(); batch.forEach(({ callback }) => callback()); await tick();
      }
      await task;
    },
  };
}

test("cancelled for the active attempt aborts docking now, restores volume and never confirms", async () => {
  const run = harness();
  let result;
  const task = run.execute().then((value) => { result = value; return value; });
  try {
    await tick();
    run.event("cdvicious:disc-flight-cancelled", run.attempt.attemptId);
    await tick();
    assert.equal(result?.success, false, "Cancellation must settle without waiting for the 25-second deadline.");
    assert.equal(run.coordinator.getConfirmedPlayback(), null);
    assert.equal(run.operations.some(([kind]) => kind === "resume"), false);
    assert.equal(run.operations.filter(([kind]) => kind === "volume").at(-1)[1], .6);
    assert.equal([...run.listeners.values()].reduce((sum, set) => sum + set.size, 0), 0);
  } finally { await run.cleanup(task); }
});

test("a ready event from another attempt cannot resume or confirm this attempt", async () => {
  const run = harness();
  const task = run.execute();
  try {
    await tick();
    run.event("cdvicious:disc-flight-playback-ready", "stale-other-attempt");
    await tick();
    assert.equal(run.operations.some(([kind]) => kind === "resume"), false, "Only this attempt's real dock may release its SDK resume.");
    assert.equal(run.coordinator.getConfirmedPlayback(), null);
  } finally { await run.cleanup(task); }
});

test("cancelling before execution releases admission without a POST or volume mutation", async () => {
  const run = harness();
  assert.equal(run.execute.cancel(), true);
  assert.equal(run.coordinator.getPlaybackState().phase, "cancelled");
  assert.equal(run.coordinator.getPlaybackState().busy, false);
  const result = await run.execute();
  assert.equal(result.success, false);
  assert.equal(result.cancelled, true);
  assert.equal(run.operations.some(([kind]) => ["fetch", "volume", "resume"].includes(kind)), false);
  const next = run.create();
  assert.ok(next);
  next.cancel();
});

test("dock, synthetic click completion and original volume restoration precede confirmation", async () => {
  let finishClick;
  const run = harness({ click: () => new Promise((resolve) => { finishClick = () => resolve("played"); }) });
  const stable = run.coordinator.getPlaybackState();
  assert.equal(stable, run.coordinator.getPlaybackState());
  const task = run.execute();
  assert.equal(task, run.execute(), "Repeated callers must share one execution.");
  await tick();
  assert.equal(run.operations.some(([kind]) => kind === "click"), false);
  assert.equal(run.operations.some(([kind]) => kind === "resume"), false);
  assert.equal(run.execute.markDocked(), true);
  assert.equal(run.execute.markDocked(), true);
  await tick();
  assert.equal(run.coordinator.getPlaybackState().phase, "docked");
  assert.equal(run.operations.filter(([kind]) => kind === "click").length, 1);
  assert.equal(run.operations.find(([kind]) => kind === "click")[1], true);
  assert.equal(run.operations.some(([kind]) => kind === "resume"), false, "A running click must finish before SDK audio resumes.");
  finishClick();
  const result = await task;
  assert.equal(result.success, true);
  assert.equal(run.coordinator.getPlaybackState().phase, "confirmed");
  assert.equal(run.coordinator.getPlaybackState().busy, false);
  assert.equal(run.coordinator.getPlaybackState().dockClick, "played");
  assert.equal(run.operations.filter(([kind, url]) => kind === "fetch" && url === "/api/play").length, 1);
  assert.equal(run.operations.filter(([kind]) => kind === "volume").at(-1)[1], .6);
  assert.equal(run.events.filter(({ type }) => type === "cdvicious:disc-flight-playback-started").length, 1);
});

test("stale ready and cancel events cannot mutate a newer attempt", async () => {
  const run = harness();
  const oldId = run.attempt.attemptId;
  run.execute.cancel();
  const next = run.create();
  assert.notEqual(next.attempt.attemptId, oldId);
  assert.equal(Object.isFrozen(next.attempt), true);
  assert.equal(next.attempt.albumName, "Target");
  const task = next();
  await tick();
  run.event("cdvicious:disc-flight-playback-ready", oldId);
  run.event("cdvicious:disc-flight-cancelled", oldId);
  await tick();
  assert.equal(run.coordinator.getPlaybackState().phase, "loading");
  assert.equal(run.coordinator.getPlaybackState().attempt.attemptId, next.attempt.attemptId);
  assert.equal(run.operations.some(([kind]) => kind === "resume"), false);
  run.event("cdvicious:disc-flight-playback-ready", next.attempt.attemptId);
  assert.equal((await task).success, true);
  assert.equal(run.coordinator.getConfirmedPlayback().attemptId, next.attempt.attemptId);
});

test("the real 25-second deadline fails docking and restores volume before publishing failed", async () => {
  const run = harness();
  const task = run.execute();
  await tick();
  const deadline = [...run.timers.values()].find(({ ms }) => ms === 25_000);
  assert.ok(deadline, "The playback deadline must remain 25 seconds.");
  deadline.callback();
  const result = await task;
  assert.equal(result.success, false);
  assert.equal(run.coordinator.getPlaybackState().phase, "failed");
  assert.equal(run.coordinator.getPlaybackState().busy, false);
  assert.equal(run.operations.some(([kind]) => kind === "resume"), false);
  assert.equal(run.operations.filter(([kind]) => kind === "volume").at(-1)[1], .6);
  assert.equal(run.timers.size, 0);
});

test("a slow dock leaves the full confirmation window after resume, even if the tab was suspended", async () => {
  for (const observationDelay of [14_999, 15_001]) {
    let time = 100_000;
    let returnObservation;
    const run = harness({
      clock: class extends Date { static now() { return time; } },
      observation: () => new Promise((resolve) => { returnObservation = resolve; }),
    });
    const task = run.execute();
    await tick();
    time += 22_000;
    run.execute.markDocked();
    await tick();
    assert.deepEqual([...run.timers.values()].map(({ ms }) => ms), [15_000]);
    time += observationDelay;
    returnObservation({
      sampledAt: time, deviceId: "device-target", isPlaying: true,
      track: { id: "track-target", album: { id: album.id } },
    });
    const inTime = observationDelay < 15_000;
    assert.equal((await task).success, inTime);
    assert.equal(run.coordinator.getPlaybackState().phase, inTime ? "confirmed" : "degraded");
    assert.equal(Boolean(run.coordinator.getConfirmedPlayback()), inTime);
    assert.deepEqual(run.operations.filter(([kind]) => kind === "volume").map(([, value]) => value), [0, .6]);
    assert.equal(run.timers.size, 0);
  }
});

test("volume-read failure never invents 0.5, mutes or sends a playback request", async () => {
  const run = harness({ getVolume: async () => { throw new Error("unavailable"); } });
  const result = await run.execute();
  assert.equal(result.success, false);
  assert.match(result.message, /volumen/);
  assert.equal(run.operations.some(([kind]) => ["fetch", "volume", "click", "resume"].includes(kind)), false);
  assert.equal(run.coordinator.getPlaybackState().phase, "failed");
});

test("failed original-volume restoration cannot publish confirmed playback", async () => {
  const run = harness({ setVolume: async (value) => { if (value !== 0) throw new Error("restore failed"); } });
  run.execute.markDocked();
  const result = await run.execute();
  assert.equal(result.success, false);
  assert.match(result.message, /restaurar el volumen original/);
  assert.equal(run.coordinator.getConfirmedPlayback(), null);
  assert.equal(run.coordinator.getPlaybackState().phase, "failed");
  assert.deepEqual(run.operations.filter(([kind]) => kind === "volume").map(([, value]) => value), [0, .6]);
});

test("an uncertain SDK pause skips sound while retaining the fresh playback contract", async () => {
  const run = harness({ pause: async () => { throw new Error("pause unavailable"); } });
  run.execute.markDocked();
  const result = await run.execute();
  assert.equal(result.success, true);
  assert.equal(run.operations.find(([kind]) => kind === "click")[1], false);
  assert.equal(run.coordinator.getPlaybackState().dockClick, "unsafe");
});

test("cancelling a pending POST aborts its signal and ignores a late successful response", async () => {
  let resolvePost, postSignal;
  const run = harness({ playResponse: (options) => { postSignal = options.signal; return new Promise((resolve) => { resolvePost = resolve; }); } });
  const task = run.execute();
  await tick();
  assert.equal(postSignal.aborted, false);
  assert.equal(run.execute.cancel(), true);
  const result = await task;
  assert.equal(postSignal.aborted, true);
  assert.equal(result.cancelled, true);
  assert.equal(run.coordinator.getPlaybackState().busy, false);
  resolvePost({ ok: true, status: 200, json: async () => ({ success: true }) });
  await tick();
  assert.equal(run.coordinator.getPlaybackState().phase, "cancelled");
  assert.equal(run.coordinator.getConfirmedPlayback(), null);
  assert.equal(run.operations.some(([kind]) => kind === "resume"), false);
  assert.deepEqual(run.operations.filter(([kind]) => kind === "volume").map(([, value]) => value), [0, .6]);
});

test("cancellation during a click stops resume and keeps admission blocked through volume cleanup", async () => {
  let resolveClick, restoreVolume;
  const run = harness({
    click: () => new Promise((resolve) => { resolveClick = resolve; }),
    setVolume: (value) => value === 0 ? undefined : new Promise((resolve) => { restoreVolume = resolve; }),
  });
  const task = run.execute(); run.execute.markDocked();
  await tick();
  assert.equal(typeof resolveClick, "function");
  run.execute.cancel();
  await tick();
  assert.equal(run.coordinator.getPlaybackState().phase, "cancelled");
  assert.equal(run.coordinator.getPlaybackState().busy, true);
  assert.equal(run.create(), null, "A newer attempt must not race the old volume restoration.");
  restoreVolume();
  assert.equal((await task).cancelled, true);
  resolveClick("played"); await tick();
  assert.equal(run.operations.some(([kind]) => kind === "resume"), false);
  assert.equal(run.coordinator.getPlaybackState().busy, false);
  assert.equal(run.coordinator.getPlaybackState().dockClick, null, "A late click completion cannot publish into a cancelled attempt.");
});

test("HTTP authentication, permission and rate-limit failures restore volume before publishing failure", async () => {
  for (const status of [401, 403, 429]) {
    const run = harness({ playResponse: () => ({ ok: false, status, json: async () => ({ success: false }) }) });
    const publications = [];
    run.coordinator.subscribePlaybackState(() => {
      if (run.coordinator.getPlaybackState().phase === "failed") publications.push(run.operations.filter(([kind]) => kind === "volume").at(-1)[1]);
    });
    const result = await run.execute();
    assert.equal(result.success, false);
    assert.equal(run.coordinator.getPlaybackState().phase, "failed");
    assert.ok(publications.length > 0);
    assert.ok(publications.every((value) => value === .6));
    assert.equal(run.coordinator.getConfirmedPlayback(), null);
    assert.equal(run.operations.some(([kind]) => ["click", "resume"].includes(kind)), false);
    assert.equal(run.timers.size, 0);
  }
});

module.exports = { harness, tick };
