const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function soundHarness({ mock = true, activation = true, visibility = "visible", audio = true, state = "running" } = {}) {
  const contexts = [], timers = new Map(), events = new Map();
  let timerId = 0;
  const document = {
    visibilityState: visibility,
    addEventListener(type, callback) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(callback); },
    removeEventListener(type, callback) { events.get(type)?.delete(callback); },
  };
  class AudioContext {
    constructor() { this.state = state; this.currentTime = 10; this.sampleRate = 48_000; this.destination = {}; this.buffers = []; this.sources = []; this.gains = []; this.resumeCalls = 0; this.closeCalls = 0; contexts.push(this); }
    resume() { this.resumeCalls++; return Promise.resolve(); }
    close() { this.closeCalls++; this.state = "closed"; return Promise.resolve(); }
    createBuffer(channels, length, sampleRate) { const buffer = { channels, length, sampleRate, samples: new Float32Array(length), getChannelData() { return this.samples; } }; this.buffers.push(buffer); return buffer; }
    createBufferSource() { const source = { onended: null, starts: [], stops: [], disconnected: false, connect(node) { this.connected = node; }, disconnect() { this.disconnected = true; }, start(at) { this.starts.push(at); }, stop(at) { this.stops.push(at); } }; this.sources.push(source); return source; }
    createGain() { const gain = { gain: { value: 1 }, disconnected: false, connect(node) { this.connected = node; }, disconnect() { this.disconnected = true; } }; this.gains.push(gain); return gain; }
  }
  const window = {
    AudioContext: audio ? AudioContext : undefined,
    setTimeout(callback, ms) { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const navigator = { userActivation: { isActive: activation } };
  const module = { exports: {} };
  const filename = "src/lib/mechanicalDockClick.ts";
  const javascript = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(javascript, { module, exports: module.exports, window, document, navigator, process: { env: { NEXT_PUBLIC_SPOTIFY_MOCK: mock ? "1" : "0" } } }, { filename });
  return {
    api: module.exports, contexts, timers, events, navigator,
    hide() { document.visibilityState = "hidden"; for (const callback of events.get("visibilitychange") ?? []) callback(); },
    options(overrides = {}) { return { safeToPlay: true, signal: new AbortController().signal, volume: .6, ...overrides }; },
  };
}

test("the click preference defaults to mock only and publishes stable changes", () => {
  const mock = soundHarness(), live = soundHarness({ mock: false });
  assert.equal(mock.api.getDockClickEnabled(), true);
  assert.equal(mock.api.getServerDockClickEnabled(), true);
  assert.equal(live.api.getDockClickEnabled(), false);
  assert.equal(live.api.getServerDockClickEnabled(), false);
  let notifications = 0;
  const unsubscribe = live.api.subscribeDockClickEnabled(() => notifications++);
  live.api.setDockClickEnabled(true); live.api.setDockClickEnabled(true);
  assert.equal(notifications, 1);
  unsubscribe(); live.api.setDockClickEnabled(false);
  assert.equal(notifications, 1);
});

test("a trusted, safe mock dock plays one original click shorter than 50 ms", async () => {
  const run = soundHarness();
  const armed = run.api.armMechanicalDockClick();
  const context = run.contexts[0];
  assert.equal(context.resumeCalls, 1, "Audio is armed synchronously in the trusted gesture.");
  const task = armed.play(run.options());
  const source = context.sources[0], gain = context.gains[0], buffer = context.buffers[0];
  assert.equal(context.sources.length, 1);
  assert.deepEqual(source.starts, [10]);
  assert.ok(source.stops[0] - source.starts[0] > 0 && source.stops[0] - source.starts[0] < .05);
  assert.equal(buffer.length / buffer.sampleRate, .028);
  assert.equal(buffer.channels, 1);
  assert.ok(buffer.samples.some((value) => value !== 0));
  assert.equal(Math.abs(buffer.samples[0]), 0);
  assert.ok(Math.abs(buffer.samples.at(-1)) < .00001);
  assert.ok(gain.gain.value > 0 && gain.gain.value <= .035);
  assert.equal(gain.connected, context.destination);
  source.onended();
  assert.equal(await task, "played");
  assert.equal(source.disconnected, true);
  assert.equal(gain.disconnected, true);
  assert.equal(run.timers.size, 0);
  assert.equal(run.events.get("visibilitychange").size, 0);
  assert.equal(await armed.play(run.options()), "cancelled", "One dock cannot sound twice.");
  armed.dispose(); armed.dispose();
  assert.equal(context.closeCalls, 1);
});

test("lack of activation, visibility, AudioContext or running context explicitly omits sound", async () => {
  for (const [options, expected] of [
    [{ activation: false }, "no-activation"], [{ visibility: "hidden" }, "hidden"],
    [{ audio: false }, "unavailable"], [{ state: "suspended" }, "suspended"],
  ]) {
    const run = soundHarness(options), armed = run.api.armMechanicalDockClick();
    run.navigator.userActivation.isActive = true;
    assert.equal(await armed.play(run.options()), expected);
    assert.equal(run.contexts.reduce((count, context) => count + context.sources.length, 0), 0);
    assert.ok(run.contexts.every((context) => context.resumeCalls === 1), "No autoplay retry is made at docking.");
    armed.dispose();
  }
});

test("live is silent until opted in and still requires confirmed safety and original volume", async () => {
  const run = soundHarness({ mock: false });
  const disabled = run.api.armMechanicalDockClick();
  assert.equal(await disabled.play(run.options()), "disabled");
  assert.equal(run.contexts.length, 0); disabled.dispose();
  run.api.setDockClickEnabled(true);
  for (const options of [{ safeToPlay: false }, { volume: 0 }, { volume: NaN }]) {
    const armed = run.api.armMechanicalDockClick();
    assert.equal(await armed.play(run.options(options)), "unsafe");
    assert.equal(run.contexts.at(-1).sources.length, 0); armed.dispose();
  }
});

test("abort, hiding, disabling and disposal stop an active click and release its nodes", async () => {
  for (const [reason, expected] of [["abort", "cancelled"], ["hidden", "hidden"], ["disable", "cancelled"], ["dispose", "cancelled"]]) {
    const run = soundHarness(), armed = run.api.armMechanicalDockClick(), controller = new AbortController();
    const task = armed.play(run.options({ signal: controller.signal }));
    const context = run.contexts[0], source = context.sources[0];
    if (reason === "abort") controller.abort();
    if (reason === "hidden") run.hide();
    if (reason === "disable") run.api.setDockClickEnabled(false);
    if (reason === "dispose") armed.dispose();
    assert.equal(await task, expected);
    assert.equal(source.disconnected, true);
    assert.equal(source.onended, null);
    assert.equal(context.gains[0].disconnected, true);
    assert.equal(run.timers.size, 0);
    armed.dispose(); assert.equal(context.closeCalls, 1);
  }
});

test("the guarded click finishes within the existing 45 ms cap if onended is unavailable", async () => {
  const run = soundHarness(), armed = run.api.armMechanicalDockClick();
  const task = armed.play(run.options());
  const timeout = [...run.timers.values()][0];
  assert.equal(timeout.ms, 45);
  timeout.callback();
  assert.equal(await task, "played");
  assert.equal(run.contexts[0].sources[0].disconnected, true);
  armed.dispose();
});
