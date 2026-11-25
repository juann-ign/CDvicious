const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, dependencies, globals = {}) {
  const module = { exports: {} };
  const javascript = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(javascript, { module, exports: module.exports, require: (name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, ...globals }, { filename: file });
  return module.exports;
}

function harness() {
  const cells = [];
  const effects = [];
  const frames = new Map();
  let cursor = 0;
  let dirty = true;
  let queued = [];
  let frameId = 0;
  let value;
  let readHook;
  let measured = true;
  const events = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = initial;
      return [cells[index], (next) => {
        const result = typeof next === "function" ? next(cells[index]) : next;
        if (!Object.is(cells[index], result)) { cells[index] = result; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return cells[index] ??= { current: initial };
    },
    useCallback(callback, dependencies) {
      const index = cursor++;
      const previous = cells[index];
      if (!previous || dependencies.some((item, at) => !Object.is(item, previous.dependencies[at]))) cells[index] = { callback, dependencies };
      return cells[index].callback;
    },
    useEffect(callback, dependencies) {
      const index = cursor++;
      const previous = effects[index];
      if (!previous || dependencies.some((item, at) => !Object.is(item, previous.dependencies[at]))) queued.push({ index, callback, dependencies });
    },
  };
  const scrollToChapter = (chapter) => events.push(`scroll:${chapter}`);
  const hook = load("src/hooks/useDiscPlaybackLaunch.ts", {
    react,
    "@/components/scroll/RailContext": { useRailActions: () => ({ scrollToChapter }) },
    "@/lib/discFlightGeometry": { captureDiscOrigin: () => { events.push("capture"); return measured ? { visual: {}, quad: {} } : null; } },
  }, {
    document: { documentElement: { dataset: { chapter: "3" } } },
    requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  readHook = hook.useDiscPlaybackLaunch;
  const render = () => {
    dirty = false; cursor = 0;
    value = readHook();
    const pending = queued; queued = [];
    for (const effect of pending) {
      effects[effect.index]?.cleanup?.();
      effects[effect.index] = { dependencies: effect.dependencies, cleanup: effect.callback() };
    }
  };
  render();
  return {
    events,
    source: { isConnected: true, closest: () => null, focus: () => events.push("focus:source") },
    get current() { if (dirty) render(); return value; },
    invalidCapture() { measured = false; },
    async settle() { for (let index = 0; index < 4; index++) { await new Promise(setImmediate); if (dirty) render(); } },
    frame() { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(); if (dirty) render(); },
    unmount() { for (const effect of effects) effect?.cleanup?.(); },
  };
}

function execution(id = "fixture-attempt") {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  const run = () => { run.calls++; return promise; };
  run.attempt = { attemptId: id };
  run.calls = 0;
  run.cancellations = 0;
  run.cancel = () => { run.cancellations++; return true; };
  run.resolve = resolve;
  return run;
}
const album = { id: "fixture-album", name: "Fixture album" };

test("invalid physical source cancels before playback or hiding the box", () => {
  const view = harness();
  const run = execution();
  view.invalidCapture();
  assert.equal(view.current.launch(album, view.source, run, {
    onCaptured: () => view.events.push("hide"), onRecover: () => view.events.push("recover"),
  }), false);
  assert.equal(run.calls, 0);
  assert.equal(run.cancellations, 1);
  assert.deepEqual(view.events, ["capture", "recover"]);
  assert.equal(view.current.flight, null);
});

test("double launch is guarded synchronously and visual completion cannot release an executing request", async () => {
  const view = harness();
  const first = execution();
  const second = execution("second-attempt");
  const callbacks = { onCaptured: () => view.events.push("hide"), onRecover: () => assert.fail("Successful launch must not recover") };
  assert.equal(view.current.launch(album, view.source, first, callbacks), true);
  assert.equal(view.current.launch(album, view.source, second, callbacks), false);
  assert.deepEqual(view.events, ["capture", "hide"]);
  assert.equal(first.calls, 1);
  assert.equal(second.calls, 0);
  assert.equal(second.cancellations, 1);
  view.current.onDone();
  assert.equal(view.current.pending, true);
  first.resolve({ success: true });
  await view.settle();
  assert.equal(view.current.pending, false);
});

test("failure returns to the original chapter before recovery and restores the surviving source focus", async () => {
  const view = harness();
  const run = execution();
  view.current.launch(album, view.source, run, { onRecover: (message) => view.events.push(`recover:${message}`) });
  run.resolve({ success: false, message: "Fixture failure" });
  await view.settle();
  assert.equal(view.current.flight, null);
  assert.deepEqual(view.events, ["capture"]);
  view.frame();
  assert.deepEqual(view.events, ["capture", "scroll:3", "recover:Fixture failure"]);
  view.frame();
  assert.equal(view.events.at(-1), "focus:source");
  assert.equal(view.current.pending, false);
});

test("cancelled execution recovers with distinct feedback", async () => {
  const view = harness();
  const run = execution();
  view.current.launch(album, view.source, run, { onRecover: (message) => view.events.push(message) });
  run.resolve({ success: false, cancelled: true });
  await view.settle();
  view.frame();
  assert.match(view.events.at(-1), /Carga cancelada/);
});

test("unmount cancels the actual execution and ignores its late result", async () => {
  const view = harness();
  const run = execution();
  view.current.launch(album, view.source, run, { onRecover: () => assert.fail("Unmount must not restore a dead view") });
  view.unmount();
  assert.equal(run.cancellations, 1);
  run.resolve({ success: false });
  await view.settle();
  view.frame();
  assert.deepEqual(view.events, ["capture"]);
});
