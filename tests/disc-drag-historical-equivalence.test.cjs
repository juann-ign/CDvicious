const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ts = require("typescript");

const provenance = require("./fixtures/useDiscDrag-4fd1f292.json");
// Normalize only checkout line endings; the Git object identity below fixes
// every original token, schedule, interpolation and interaction rule.
const historicalSource = fs.readFileSync("tests/fixtures/useDiscDrag-4fd1f292.ts", "utf8").replace(/\r\n/g, "\n");
const currentSource = () => fs.readFileSync("src/hooks/useDiscDrag.ts", "utf8");

function eventTarget() {
  const listeners = new Map(), attributes = new Map();
  let captured = null;
  return {
    dataset: {}, style: {},
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    dispatch(name, details = {}) {
      const event = { type: name, button: 0, pointerId: 1, clientX: 0, clientY: 0, target: this, currentTarget: this,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, stopImmediatePropagation() { this.immediateStopped = true; }, ...details };
      for (const listener of [...(listeners.get(name) ?? [])]) { listener(event); if (event.immediateStopped) break; }
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    removeAttribute(name) { attributes.delete(name); },
    setPointerCapture(pointer) { captured = pointer; }, hasPointerCapture(pointer) { return captured === pointer; },
    releasePointerCapture(pointer) { if (captured === pointer) captured = null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 480, height: 480 }; },
    closest() { return null; }, focus() {},
    listenerCount() { return [...listeners.values()].reduce((count, set) => count + set.size, 0); },
  };
}

/** Run the hook itself, with React cells/effects and real R3F frame ordering. */
function hookHarness(source) {
  const canvas = eventTarget(), window = eventTarget(), document = eventTarget();
  document.visibilityState = "visible";
  canvas.ownerDocument = document;
  const cells = [], effects = [], pending = [];
  let cursor = 0, dirty = false, frameCallback, clock = 0;
  const gl = { domElement: canvas };
  const groupRef = { current: { rotation: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } } } };
  const options = { enabled: true };
  let props = { active: true, isPlaying: true };
  const changed = (previous, deps) => !previous || !deps || deps.length !== previous.length || deps.some((value, index) => !Object.is(value, previous[index]));
  const effect = (fn, deps) => {
    const index = cursor++;
    if (changed(effects[index]?.deps, deps)) pending.push({ index, fn, deps });
  };
  const react = {
    useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; },
    useState(initial) {
      const index = cursor++;
      const cell = cells[index] ??= { value: typeof initial === "function" ? initial() : initial };
      cell.set ??= (next) => { const value = typeof next === "function" ? next(cell.value) : next; if (!Object.is(value, cell.value)) { cell.value = value; dirty = true; } };
      return [cell.value, cell.set];
    },
    useCallback(fn, deps) { const index = cursor++; if (changed(cells[index]?.deps, deps)) cells[index] = { value: fn, deps }; return cells[index].value; },
    useMemo(fn, deps) { const index = cursor++; if (changed(cells[index]?.deps, deps)) cells[index] = { value: fn(), deps }; return cells[index].value; },
    useEffect: effect, useLayoutEffect: effect,
  };
  const module = { exports: {} };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, window, document, performance: { now: () => clock * 1000 },
    require(name) {
      if (name === "react") return react;
      if (name === "@react-three/fiber") return { useFrame: (fn) => { frameCallback = fn; }, useThree: () => ({ gl }) };
      throw new Error(`Unexpected runtime dependency in useDiscDrag: ${name}`);
    },
  });
  function render(changes = {}) {
    props = { ...props, ...changes };
    for (let pass = 0; pass < 10; pass++) {
      dirty = false; cursor = 0;
      module.exports.useDiscDrag(groupRef, props.active, props.isPlaying, options);
      for (const entry of pending.splice(0)) {
        effects[entry.index]?.cleanup?.();
        effects[entry.index] = { deps: entry.deps, cleanup: entry.fn() };
      }
      if (!dirty) return;
    }
    throw new Error("Hook did not settle after ten React renders");
  }
  const pose = () => ({ x: groupRef.current.rotation.x, y: groupRef.current.rotation.y, z: groupRef.current.rotation.z });
  render();
  return {
    render, pose,
    frame(delta) { clock += delta; frameCallback({ gl, clock: { elapsedTime: clock } }, delta); if (dirty) render(); return pose(); },
    down(clientX = 0, clientY = 0) { canvas.dispatch("pointerdown", { clientX, clientY }); if (dirty) render(); },
    move(clientX, clientY = 0) { window.dispatch("pointermove", { clientX, clientY }); if (dirty) render(); },
    end(name = "pointerup") { window.dispatch(name); if (dirty) render(); },
    unmount() { for (const item of effects.filter(Boolean)) item.cleanup?.(); },
    listenerCount: () => canvas.listenerCount() + window.listenerCount() + document.listenerCount(),
  };
}

function closePose(actual, expected, label) {
  for (const axis of ["x", "y", "z"]) assert.ok(Math.abs(actual[axis] - expected[axis]) < 1e-11, `${label}: ${axis}, actual=${actual[axis]}, historical=${expected[axis]}`);
}

function equivalentProgram(actions) {
  const baseline = hookHarness(historicalSource), current = hookHarness(currentSource());
  const samples = [];
  try {
    for (const [index, action] of actions.entries()) {
      if (action.render) { baseline.render(action.render); current.render(action.render); }
      if (action.down) { baseline.down(...action.down); current.down(...action.down); }
      if (action.move) { baseline.move(...action.move); current.move(...action.move); }
      if (action.end) { baseline.end(action.end); current.end(action.end); }
      if (action.delta !== undefined) {
        const expected = baseline.frame(action.delta), actual = current.frame(action.delta);
        closePose(actual, expected, `action ${index} delta=${action.delta}`);
        samples.push({ action: index, expected, actual });
      }
    }
    return samples;
  } finally { baseline.unmount(); current.unmount(); }
}

const frames = (deltas) => deltas.map((delta) => ({ delta }));

test("historical fixture is the literal 4fd1f292 useDiscDrag Git object, independent of the implementation under test", () => {
  const body = Buffer.from(historicalSource);
  const hash = crypto.createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
  assert.equal(provenance.sourceCommit, "4fd1f29227ad0ef2a98530e9f50502505d815b8d");
  assert.equal(provenance.sourcePath, "src/hooks/useDiscDrag.ts");
  assert.equal(hash, "74dee0f94c0e56648565800b1f4877d3eac8e6ef");
  assert.equal(hash, provenance.gitBlob);
});

test("actual pose rotation matches the historical hook throughout irregular frame deltas and complete 11.43-second cycles", () => {
  const deltas = [0, .11, .37, .23, .8, .13, .47, .61, .09, .55, .72, .2, .4, .015, .81, .3, .12, .71, .62, .25, .41, .9, .19, .56, .48, .52, .31, .77];
  const samples = equivalentProgram(frames([...deltas, ...deltas, ...deltas]));
  assert.ok(deltas.reduce((sum, delta) => sum + delta, 0) * 3 > 22.86);
  const x = samples.map((sample) => sample.actual.x), y = samples.map((sample) => sample.actual.y);
  assert.ok(Math.max(...x) - Math.min(...x) > .4, "X must traverse the historical tilted-pose range");
  assert.ok(Math.max(...y) - Math.min(...y) > 5.5, "Y must traverse a complete historical turn");
});

test("pause freezes and resume continues the exact historical pose phase; reactivation resets the original schedule", () => {
  const samples = equivalentProgram([
    ...frames([0, .17, .49, .31]), { render: { isPlaying: false } }, ...frames([0, .4, .9, 1.7]),
    { render: { isPlaying: true } }, ...frames([.13, .7, .42]),
    { render: { active: false, isPlaying: false } }, ...frames([.2, .8]),
    { render: { active: true, isPlaying: false } }, { delta: 0 },
  ]);
  for (const sample of samples.slice(4, 8)) closePose(sample.actual, samples[3].actual, "paused historical phase");
  closePose(samples.at(-1).actual, { x: 38 * Math.PI / 180, y: -75 * Math.PI / 180, z: 0 }, "reactivated original pose");
});

test("horizontal pointer deltas, direction reversals and release return match the original canvas/window interaction frame by frame", () => {
  equivalentProgram([
    ...frames([0, .31, .6]), { down: [100, 80] }, { move: [175, 30] }, { delta: .17 },
    { move: [80, 250] }, { delta: .4 }, { move: [230, -40] }, { delta: .3 },
    { end: "pointerup" }, ...frames([0, .1, .2, .3, .299, .001, .1, .4]),
  ]);
});

test("a paused drag returns for the full historical 900ms without resuming playback or advancing the scheduled phase", () => {
  const samples = equivalentProgram([
    { render: { isPlaying: false } }, { delta: 0 }, { down: [0, 30] }, { move: [100, 90] }, { delta: .2 },
    { end: "pointercancel" }, ...frames([0, .45, .449, .001, .4]),
  ]);
  const initial = samples[0].actual, held = samples[1].actual;
  assert.ok(Math.abs(held.y - initial.y - .8) < 1e-11, "the historical dx=100 changes Y by .8 radians");
  assert.ok(Math.abs(samples[3].actual.y - initial.y - .4) < 1e-11, "450ms is half of the original linear return");
  assert.ok(Math.abs(samples[4].actual.y - initial.y) > 0, "the return is not completed before 900ms");
  closePose(samples[5].actual, initial, "900ms complete return");
  closePose(samples[6].actual, initial, "pause preserved after return");
});

test("inactive idle rotation and idle-drag base keep the historical behavior before becoming active", () => {
  equivalentProgram([
    { render: { active: false, isPlaying: false } }, ...frames([0, .1, .9, 2]),
    { down: [40, 30] }, { move: [140, 100] }, ...frames([.1, .8]),
    { end: "pointerup" }, ...frames([.2, .4, .3, .1]),
    { render: { active: true, isPlaying: true } }, ...frames([0, .4, .8]),
  ]);
});

test("pause and resume during an active drag and its return preserve the historical phase across provider rerenders", () => {
  equivalentProgram([
    ...frames([0, .2, .3]), { down: [0, 50] }, { move: [90, 40] }, { delta: .2 },
    { render: { isPlaying: false } }, { move: [-25, 90] }, { delta: .1 },
    { end: "pointerup" }, { delta: .3 }, { render: { isPlaying: true } }, { delta: .2 },
    { render: { isPlaying: false } }, { delta: .4 }, { render: { isPlaying: true } }, ...frames([.3, .6]),
  ]);
});
