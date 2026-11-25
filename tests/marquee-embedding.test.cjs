const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const pointer = (pointerId, clientX, changes = {}) => ({ pointerId, clientX, button: 0, buttons: 1, isPrimary: true, ...changes });
const translated = (run) => Number(/^translate3d\((.*?)px/.exec(run.position())[1]);
const ringDelta = (a, b, length = 1000) => ((b - a + length * 1.5) % length) - length / 2;

function harness(chapter, kind = "marquee", reducedMotion = false) {
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
  const artistRoot = { dataset: {} };
  let slots = [], focusedId = null;
  const viewport = { ...events(), clientWidth: 600, scrollLeft: 0, parentElement: { scrollLeft: 0 },
    closest: () => artistRoot, contains: (node) => slots.some((slot) => slot.button === node),
    setPointerCapture(id) { pointerCapture.add(id); }, hasPointerCapture(id) { return pointerCapture.has(id); }, releasePointerCapture(id) { pointerCapture.delete(id); } };
  const track = { style: {}, querySelectorAll: () => slots, get firstElementChild() { return slots[0]; } };
  const media = { ...events(), matches: reducedMotion };
  const window = { ...events(), matchMedia: () => media, setTimeout(callback) { const id = ++serial; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); } };
  const document = { ...events(), hidden: false, querySelector: () => ({ parentElement: root }) };
  const createSlot = (id) => {
    const button = { dataset: { bateaAlbumId: id }, offsetWidth: 85, offsetHeight: 154, getBoundingClientRect: () => ({ left: 0 }),
      firstElementChild: { children: [{ getBoundingClientRect: () => ({ left: -7 }) }] },
      closest: () => button,
      focus() { focusedId = id; viewport.dispatch("focusin", { target: button }); },
    };
    return { button, style: { setProperty() {} }, querySelector: () => button };
  };
  const react = {
    useRef(value) { const at = cursor++; return hooks[at] ??= { current: value }; },
    useState(value) { const at = cursor++; if (!hooks[at]) hooks[at] = { value: typeof value === "function" ? value() : value }; return [hooks[at].value, (next) => { hooks[at].value = typeof next === "function" ? next(hooks[at].value) : next; }]; },
    useCallback(callback, deps) {
      const at = cursor++;
      if (!hooks[at] || deps.some((value, index) => value !== hooks[at].deps[index])) hooks[at] = { deps, value: callback };
      return hooks[at].value;
    },
    useEffect(callback, deps) {
      const at = cursor++;
      if (!hooks[at] || deps.some((value, index) => value !== hooks[at].deps[index])) pending.push(() => {
        hooks[at]?.cleanup?.();
        hooks[at] = { deps, cleanup: callback() };
      });
    },
  };
  react.useLayoutEffect = react.useEffect;
  const modules = new Map();
  const load = (file) => {
    if (modules.has(file)) return modules.get(file);
    const loaded = { exports: {} };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
      module: loaded, exports: loaded.exports, require(name) {
        if (name === "react") return react;
        if (name === "./useMarqueeBelt") return load("src/hooks/useMarqueeBelt.ts");
        if (name === "@/lib/artistShelfLayout") return load("src/lib/artistShelfLayout.ts");
        throw new Error(`Unexpected ${name}`);
      }, window, document,
      getComputedStyle: (button) => ({ width: `${button.offsetWidth}px`, height: `${button.offsetHeight}px` }),
      performance: { now: () => now },
      requestAnimationFrame(callback) { const id = ++serial; frames.set(id, callback); return id; }, cancelAnimationFrame(id) { frames.delete(id); },
      ResizeObserver: class { observe() {} disconnect() {} },
      MutationObserver: class { constructor(callback) { this.callback = callback; this.active = false; observers.push(this); } observe() { this.active = true; } disconnect() { this.active = false; } },
    });
    modules.set(file, loaded.exports);
    return loaded.exports;
  };
  const loaded = kind === "artist" ? load("src/hooks/useArtistShelfLayout.ts") : load("src/hooks/useMarqueeBelt.ts");
  const defaultIds = Array.from({ length: 12 }, (_, index) => `edition-${index}`);
  return {
    root, viewport, window, document, pointerCapture, artistRoot,
    render(options = {}) {
      cursor = 0;
      if (kind === "artist") {
        const ids = options.ids ?? defaultIds;
        slots = ids.map((id) => slots.find((slot) => slot.button.dataset.bateaAlbumId === id) ?? createSlot(id));
        output = loaded.useArtistShelfLayout({ ids, active: true, paused: false, chapterIndex: chapter, ...options });
      } else output = loaded.useMarqueeBelt({ speed: 60, length: 1000, pages: 4, ...options });
      output.containerRef.current = viewport;
      output.trackRef.current = track;
      while (pending.length) pending.shift()();
      return output;
    },
    frame(time) { now = time; const ready = [...frames.values()]; frames.clear(); ready.forEach((callback) => callback(time)); },
    notify() { observers.filter((observer) => observer.active).forEach((observer) => observer.callback()); },
    position() { return track.style.transform; },
    frameCount() { return frames.size; },
    artistOffset() { return Number(artistRoot.dataset.artistCycleOffset); },
    slotPosition(index) { return Number(/^translate3d\((.*?)px/.exec(slots[index].style.transform)[1]); },
    button(index) { return slots[index].button; },
    focusedId() { return focusedId; },
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
  run.viewport.dispatch("pointerdown", pointer(7, 100));
  run.window.dispatch("pointermove", pointer(7, 120));
  assert.equal(grabs, 1);
  assert.equal(run.pointerCapture.has(7), true);
  run.render({ ...callbacks, enabled: false });
  assert.equal(releases, 1);
  assert.equal(run.pointerCapture.size, 0);
  assert.equal(run.frameCount(), 0);
  run.render(callbacks);
  run.window.dispatch("pointermove", pointer(7, 180));
  assert.equal(grabs, 1);
  run.viewport.dispatch("pointerdown", pointer(8, 200));
  run.window.dispatch("pointermove", pointer(8, 220));
  run.window.dispatch("pointerup", pointer(8, 220, { buttons: 0 }));
  assert.equal(grabs, 2);
  assert.equal(releases, 2);
});

test("activación posterior a una lista vacía instala el arrastre y cancela un gesto aún sin captura", () => {
  const run = harness(3);
  let grabs = 0;
  const callbacks = { chapterIndex: 3, onGrabStart: () => grabs++ };
  run.render({ ...callbacks, enabled: false, length: 0 });
  run.render(callbacks);
  run.viewport.dispatch("pointerdown", pointer(1, 100));
  run.render({ ...callbacks, enabled: false });
  run.render(callbacks);
  run.window.dispatch("pointermove", pointer(1, 200));
  assert.equal(grabs, 0);
  run.viewport.dispatch("pointerdown", pointer(2, 200));
  run.window.dispatch("pointermove", pointer(2, 225));
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

test("el arrastre sigue cada delta también al cruzar la unión, y soltar conserva la posición", () => {
  const run = harness(2);
  let grabs = 0, releases = 0;
  const options = { paused: true, onGrabStart: () => {
    grabs++;
    run.root.dataset.railMoving = "true";
    run.notify();
  }, onGrabEnd: () => releases++ };
  run.render(options);
  run.frame(1020);
  const resting = translated(run);
  run.viewport.dispatch("pointerdown", pointer(1, 100));
  run.window.dispatch("pointermove", pointer(1, 104));
  assert.equal(translated(run), resting);
  assert.equal(grabs, 0);
  run.window.dispatch("pointermove", pointer(1, 116));
  assert.equal(grabs, 1);
  assert.equal(ringDelta(resting, translated(run)), 16);
  const next = translated(run);
  run.window.dispatch("pointermove", pointer(1, 86));
  assert.equal(ringDelta(next, translated(run)), -30);
  const held = translated(run);
  for (let time = 1040; time <= 1400; time += 20) run.frame(time);
  assert.equal(translated(run), held);
  run.window.dispatch("pointerup", pointer(1, 86, { buttons: 0 }));
  for (let time = 1420; time <= 2000; time += 20) run.frame(time);
  assert.equal(translated(run), held);
  assert.equal(releases, 1);
  assert.equal(run.pointerCapture.size, 0);
  run.root.dataset.railMoving = "false";
  run.notify();
  run.render({ ...options, paused: false });
  run.frame(2020);
  assert.ok(Math.abs(ringDelta(held, translated(run)) + 1.2) < 1e-9);
});

test("el clic y el teclado conservan la selección, un segundo puntero no termina el gesto vigente", () => {
  const run = harness(2);
  let starts = 0, ends = 0;
  run.render({ paused: true, onGrabStart: () => starts++, onGrabEnd: () => ends++ });
  run.frame(1020);
  const click = (detail) => {
    let blocked = false;
    run.viewport.dispatch("click", { detail, preventDefault: () => { blocked = true; }, stopPropagation() {}, stopImmediatePropagation() {} });
    return blocked;
  };
  run.viewport.dispatch("pointerdown", pointer(1, 100, { button: 2 }));
  run.window.dispatch("pointermove", pointer(1, 130));
  assert.equal(starts, 0);
  run.viewport.dispatch("pointerdown", pointer(2, 100));
  run.window.dispatch("pointerup", pointer(2, 100, { buttons: 0 }));
  assert.equal(click(1), false);
  run.viewport.dispatch("pointerdown", pointer(3, 100));
  run.window.dispatch("pointermove", pointer(3, 120));
  const captured = translated(run);
  run.viewport.dispatch("pointerdown", pointer(4, 150, { isPrimary: false }));
  run.window.dispatch("pointermove", pointer(4, 300));
  run.window.dispatch("pointerup", pointer(4, 300, { buttons: 0 }));
  run.viewport.dispatch("lostpointercapture", pointer(3, 120, { target: {} }));
  assert.equal(translated(run), captured);
  assert.equal(ends, 0);
  assert.equal(run.pointerCapture.has(3), true);
  run.window.dispatch("pointerup", pointer(3, 120, { buttons: 0 }));
  assert.equal(ends, 1);
  assert.equal(click(0), false);
  assert.equal(click(1), true);
  run.viewport.dispatch("pointerdown", pointer(5, 100));
  run.window.dispatch("pointerup", pointer(5, 100, { buttons: 0 }));
  assert.equal(click(1), false);
});

test("cancelar, perder captura, foco de ventana o capítulo libera exactamente un bloqueo", () => {
  const interruptions = [
    (run) => run.window.dispatch("pointercancel", pointer(1, 130, { buttons: 0 })),
    (run) => run.viewport.dispatch("lostpointercapture", pointer(1, 130, { buttons: 0, target: run.viewport })),
    (run) => run.window.dispatch("blur"),
    (run) => { run.document.hidden = true; run.document.dispatch("visibilitychange"); },
    (run) => { run.root.dataset.chapter = "3"; run.notify(); },
    (run) => { run.root.dataset.albumDetailOpen = "true"; run.notify(); },
    (run) => run.window.dispatch("pointermove", pointer(1, 140, { buttons: 0 })),
  ];
  for (const interrupt of interruptions) {
    const run = harness(2);
    let starts = 0, ends = 0;
    const options = { paused: true, onGrabStart: () => starts++, onGrabEnd: () => ends++ };
    run.render(options);
    run.frame(1020);
    run.viewport.dispatch("pointerdown", pointer(1, 100));
    run.window.dispatch("pointermove", pointer(1, 130));
    const before = translated(run);
    interrupt(run);
    run.window.dispatch("pointerup", pointer(1, 130, { buttons: 0 }));
    assert.equal(starts, 1);
    assert.equal(ends, 1);
    assert.equal(run.pointerCapture.size, 0);
    let blocked = false;
    run.viewport.dispatch("click", { detail: 1, preventDefault: () => { blocked = true; }, stopPropagation() {}, stopImmediatePropagation() {} });
    assert.equal(blocked, true);
    run.document.hidden = false;
    run.document.dispatch("visibilitychange");
    run.root.dataset.chapter = "2";
    delete run.root.dataset.albumDetailOpen;
    run.notify();
    run.frame(1040);
    assert.equal(translated(run), before);
    run.render({ ...options, paused: false });
    run.frame(1060);
    assert.ok(Math.abs(ringDelta(before, translated(run)) + 1.2) < 1e-9);
  }
});

test("las páginas explícitas conservan su destino al navegar con la cinta pausada", () => {
  const run = harness(2);
  const options = { paused: true };
  const first = run.render(options);
  run.frame(1020);
  first.goTo(1);
  for (let time = 1040; time <= 2400; time += 20) run.frame(time);
  assert.equal(translated(run), -250);
  const second = run.render(options);
  assert.equal(second.page, 1);
  second.stepPage(1);
  for (let time = 2420; time <= 3800; time += 20) run.frame(time);
  assert.equal(translated(run), -500);
  assert.equal(run.render(options).page, 2);
});

test("Artista y Next listen usan la captura común sin perder su entrada, orden ni navegación por teclado", () => {
  for (const [chapter, startAt, reducedMotion] of [[3, "center", false], [0, "leading", true]]) {
    const run = harness(chapter, "artist", reducedMotion);
    let grabs = 0, releases = 0;
    const options = { paused: true, startAt, onGrabStart: () => {
      grabs++;
      run.root.dataset.railMoving = "true";
      run.notify();
    }, onGrabEnd: () => { releases++; } };
    run.render(options);
    const motion = run.render(options);
    assert.equal(motion.layout.fit, false);
    assert.equal(run.artistRoot.dataset.artistSequence, "entry");
    assert.equal(motion.reducedMotion, reducedMotion);
    const length = motion.layout.length;
    const firstX = run.slotPosition(0), firstOffset = run.artistOffset();
    run.viewport.dispatch("pointerdown", pointer(1, 100));
    run.window.dispatch("pointermove", pointer(1, 140));
    assert.equal(run.artistRoot.dataset.artistSequence, "cycle");
    assert.ok(Math.abs(run.slotPosition(0) - firstX - 40) < 1e-7);
    assert.ok(Math.abs(ringDelta(firstOffset, run.artistOffset(), length) + 40) < 1e-3);
    const rightOffset = run.artistOffset();
    run.window.dispatch("pointermove", pointer(1, -200));
    const heldOffset = run.artistOffset();
    assert.ok(Math.abs(ringDelta(rightOffset, heldOffset, length) - 340) < 1e-3);
    run.frame(1400);
    assert.equal(run.artistOffset(), heldOffset);
    run.window.dispatch("pointerup", pointer(1, -200, { buttons: 0 }));
    assert.equal(grabs, 1);
    assert.equal(releases, 1);
    assert.equal(run.pointerCapture.size, 0);
    run.root.dataset.railMoving = "false";
    run.notify();
    run.frame(1600);
    assert.equal(run.artistOffset(), heldOffset);

    run.viewport.dispatch("pointerdown", pointer(2, 100));
    run.window.dispatch("pointermove", pointer(2, 125));
    run.window.dispatch("blur");
    assert.equal(grabs, 2);
    assert.equal(releases, 2);
    assert.equal(run.pointerCapture.size, 0);
    run.root.dataset.railMoving = "false";
    run.notify();
    run.viewport.dispatch("keydown", { key: "End", target: run.button(0), preventDefault() {}, stopPropagation() {} });
    assert.equal(run.focusedId(), "edition-11");
    assert.equal(run.button(11).tabIndex, 0);
  }
});

test("un estante de pocas ediciones permanece estático y opera con teclado o clic", () => {
  const run = harness(3, "artist");
  let grabs = 0;
  const options = { ids: ["first", "second", "third"], onGrabStart: () => grabs++ };
  run.render(options);
  const motion = run.render(options);
  assert.equal(motion.layout.fit, true);
  assert.equal(motion.pages, 1);
  const before = run.slotPosition(0);
  run.viewport.dispatch("pointerdown", pointer(1, 100));
  run.window.dispatch("pointermove", pointer(1, 180));
  run.window.dispatch("pointerup", pointer(1, 180, { buttons: 0 }));
  assert.equal(grabs, 0);
  assert.equal(run.pointerCapture.size, 0);
  assert.equal(run.slotPosition(0), before);
  run.viewport.dispatch("keydown", { key: "ArrowRight", target: run.button(0), preventDefault() {}, stopPropagation() {} });
  assert.equal(run.focusedId(), "second");
  assert.equal(run.slotPosition(0), before);
  let blocked = false;
  run.viewport.dispatch("click", { detail: 1, preventDefault: () => { blocked = true; }, stopPropagation() {}, stopImmediatePropagation() {} });
  assert.equal(blocked, false);
});
