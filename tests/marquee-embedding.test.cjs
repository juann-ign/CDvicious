const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function harness(chapter) {
  const hooks = [], pending = [], frames = new Map(), observers = [], timers = new Map();
  let cursor = 0, serial = 0, now = 1000, output;
  const root = { dataset: { chapter: String(chapter), railMoving: "false" } };
  const pointerCapture = new Set();
  const events = () => {
    const callbacks = new Map();
    return {
      addEventListener(name, callback) { if (!callbacks.has(name)) callbacks.set(name, new Set()); callbacks.get(name).add(callback); },
      removeEventListener(name, callback) { callbacks.get(name)?.delete(callback); },
      dispatch(name, event = {}) { for (const callback of [...(callbacks.get(name) ?? [])]) callback(event); },
    };
  };
  const viewport = { ...events(), setPointerCapture(id) { pointerCapture.add(id); }, hasPointerCapture(id) { return pointerCapture.has(id); }, releasePointerCapture(id) { pointerCapture.delete(id); } };
  const track = { style: {} };
  const window = { ...events(), setTimeout(callback) { const id = ++serial; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); } };
  const react = {
    useRef(value) { const at = cursor++; return hooks[at] ??= { current: value }; },
    useState(value) { const at = cursor++; if (!hooks[at]) hooks[at] = { value }; return [hooks[at].value, (next) => { hooks[at].value = typeof next === "function" ? next(hooks[at].value) : next; }]; },
    useEffect(callback, deps) {
      const at = cursor++;
      if (!hooks[at] || deps.some((value, index) => value !== hooks[at].deps[index])) pending.push(() => {
        hooks[at]?.cleanup?.();
        hooks[at] = { deps, cleanup: callback() };
      });
    },
  };
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/hooks/useMarqueeBelt.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module: loaded, exports: loaded.exports, require: () => react, window,
    document: { querySelector: () => ({ parentElement: root }) },
    performance: { now: () => now },
    requestAnimationFrame(callback) { const id = ++serial; frames.set(id, callback); return id; }, cancelAnimationFrame(id) { frames.delete(id); },
    MutationObserver: class { constructor(callback) { this.callback = callback; this.active = false; observers.push(this); } observe() { this.active = true; } disconnect() { this.active = false; } },
  });
  return {
    root, viewport, window, pointerCapture,
    render(options = {}) {
      cursor = 0;
      output = loaded.exports.useMarqueeBelt({ speed: 60, length: 1000, pages: 4, ...options });
      output.containerRef.current = viewport;
      output.trackRef.current = track;
      while (pending.length) pending.shift()();
      return output;
    },
    frame(time) { now = time; const ready = [...frames.values()]; frames.clear(); ready.forEach((callback) => callback(time)); },
    notify() { observers.filter((observer) => observer.active).forEach((observer) => observer.callback()); },
    position() { return track.style.transform; },
    frameCount() { return frames.size; },
  };
}

test("la misma cinta avanza en Colección capítulo3 sin activar la Batea capítulo2", () => {
  const embedded = harness(3);
  embedded.render({ chapterIndex: 3 });
  embedded.frame(1020);
  assert.ok(Math.abs(Number(/^translate3d\((.*?)px/.exec(embedded.position())[1]) + 1.2) < 1e-9);
  const standalone = harness(3);
  standalone.render();
  standalone.frame(1020);
  assert.equal(standalone.position(), undefined);
  standalone.root.dataset.chapter = "2";
  standalone.notify();
  standalone.frame(1040);
  assert.notEqual(standalone.position(), undefined);
});

test("abrir ficha o mover rail pausa; volver conserva posición y excluye tiempo inactivo", () => {
  const run = harness(3);
  run.render({ chapterIndex: 3 });
  run.frame(1020);
  const before = run.position();
  run.root.dataset.albumDetailOpen = "true";
  run.notify();
  assert.equal(run.frameCount(), 0);
  run.frame(5000);
  assert.equal(run.position(), before);
  delete run.root.dataset.albumDetailOpen;
  run.notify();
  run.frame(5020);
  assert.ok(Math.abs(Number(/^translate3d\((.*?)px/.exec(run.position())[1]) + 2.4) < 1e-9);
  run.root.dataset.railMoving = "true";
  run.notify();
  assert.equal(run.frameCount(), 0);
});

test("desactivar una cinta capturada libera el rail y no duplica listeners al reactivarla", () => {
  const run = harness(3);
  let grabs = 0, releases = 0;
  const callbacks = { chapterIndex: 3, onGrabStart: () => grabs++, onGrabEnd: () => releases++ };
  run.render(callbacks);
  run.viewport.dispatch("pointerdown", { clientX: 100, pointerId: 7 });
  run.window.dispatch("pointermove", { clientX: 120 });
  assert.equal(grabs, 1);
  assert.equal(run.pointerCapture.has(7), true);
  run.render({ ...callbacks, enabled: false });
  assert.equal(releases, 1);
  assert.equal(run.pointerCapture.size, 0);
  assert.equal(run.frameCount(), 0);
  run.render(callbacks);
  run.window.dispatch("pointermove", { clientX: 180 });
  assert.equal(grabs, 1);
  run.viewport.dispatch("pointerdown", { clientX: 200, pointerId: 8 });
  run.window.dispatch("pointermove", { clientX: 220 });
  run.window.dispatch("pointerup");
  assert.equal(grabs, 2);
  assert.equal(releases, 2);
});

test("activación posterior a una lista vacía instala el arrastre y cancela un gesto aún sin captura", () => {
  const run = harness(3);
  let grabs = 0;
  const callbacks = { chapterIndex: 3, onGrabStart: () => grabs++ };
  run.render({ ...callbacks, enabled: false, length: 0 });
  run.render(callbacks);
  run.viewport.dispatch("pointerdown", { clientX: 100, pointerId: 1 });
  run.render({ ...callbacks, enabled: false });
  run.render(callbacks);
  run.window.dispatch("pointermove", { clientX: 200 });
  assert.equal(grabs, 0);
  run.viewport.dispatch("pointerdown", { clientX: 200, pointerId: 2 });
  run.window.dispatch("pointermove", { clientX: 225 });
  assert.equal(grabs, 1);
});

test("84px/s aumenta el avance un 40% y conserva pausa, reanudación y la posición al volver de ficha", () => {
  const baseline = harness(2), faster = harness(2);
  baseline.render({ speed: 60 }); faster.render({ speed: 84 });
  baseline.frame(1020); faster.frame(1020);
  const position = (run) => -Number(/^translate3d\((.*?)px/.exec(run.position())[1]);
  assert.ok(Math.abs(position(faster) - 1.68) < 1e-9);
  assert.ok(Math.abs(position(faster) / position(baseline) - 1.4) < 1e-9);
  faster.render({ speed: 84, paused: true }); faster.frame(1040);
  assert.ok(Math.abs(position(faster) - 1.68) < 1e-9);
  faster.render({ speed: 84, paused: false }); faster.frame(1060);
  assert.ok(Math.abs(position(faster) - 3.36) < 1e-9);
  faster.root.dataset.albumDetailOpen = "true"; faster.notify();
  faster.frame(5000);
  assert.ok(Math.abs(position(faster) - 3.36) < 1e-9);
  delete faster.root.dataset.albumDetailOpen; faster.notify(); faster.frame(5020);
  assert.ok(Math.abs(position(faster) - 5.04) < 1e-9);
});
