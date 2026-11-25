const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync('src/components/PhysicalVolumeKnob.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: name => dependencies[name] ?? {}, ...globals });
  return module.exports;
}
const rect = { left: 0, top: 0, width: 100, height: 60 };
const point = angle => ({ x: 50 + 50 * Math.sin(angle * Math.PI / 180), y: 30 - 30 * Math.cos(angle * Math.PI / 180) });

test('clockwise quarter-turn increases monotonically over the projected ellipse instead of cancelling dx-dy', () => {
  const { beginVolumeKnobGesture, moveVolumeKnobGesture } = load();
  const start = point(0), model = beginVolumeKnobGesture(rect, start.x, start.y, .3);
  let previous = .3;
  for (const angle of [15, 30, 45, 60, 75, 90]) {
    const next = point(angle), value = moveVolumeKnobGesture(model, next.x, next.y);
    assert.ok(value > previous, `${angle} degrees must increase volume`);
    previous = value;
  }
  assert.equal(previous, .63);
});

test('relative rotation does not jump on grab and unwraps the angular seam in either direction', () => {
  const { beginVolumeKnobGesture, moveVolumeKnobGesture } = load();
  const start = point(170), next = point(-175), model = beginVolumeKnobGesture(rect, start.x, start.y, .4);
  assert.equal(model.value, .4);
  assert.equal(moveVolumeKnobGesture(model, next.x, next.y), .46);
  const reverseStart = point(-170), reverseEnd = point(175), reverse = beginVolumeKnobGesture(rect, reverseStart.x, reverseStart.y, .4);
  assert.equal(moveVolumeKnobGesture(reverse, reverseEnd.x, reverseEnd.y), .34);
});

test('saturation keeps immediate reverse response without accumulated windup', () => {
  const { beginVolumeKnobGesture, moveVolumeKnobGesture } = load();
  const start = point(0), model = beginVolumeKnobGesture(rect, start.x, start.y, .98);
  for (const angle of [30, 60, 90]) { const next = point(angle); assert.equal(moveVolumeKnobGesture(model, next.x, next.y), 1); }
  const reverse = point(85); assert.equal(moveVolumeKnobGesture(model, reverse.x, reverse.y), .98);
});

test('a center grab supports a continuous dominant-axis drag and cannot cancel diagonal movement', () => {
  const { beginVolumeKnobGesture, moveVolumeKnobGesture } = load();
  const model = beginVolumeKnobGesture(rect, 50, 30, .3);
  assert.equal(model.mode, 'linear');
  assert.equal(moveVolumeKnobGesture(model, 50, 0), .5);
  assert.equal(moveVolumeKnobGesture(model, 55, -15), .6);
  const diagonal = beginVolumeKnobGesture(rect, 50, 30, .5);
  assert.equal(moveVolumeKnobGesture(diagonal, 80, 60), .3);
});

test('crossing the undefined center does not jump when rotation resumes on the other rim', () => {
  const { beginVolumeKnobGesture, moveVolumeKnobGesture } = load();
  const start = point(90), model = beginVolumeKnobGesture(rect, start.x, start.y, .5);
  assert.equal(moveVolumeKnobGesture(model, 50, 30), .5);
  const other = point(-90); assert.equal(moveVolumeKnobGesture(model, other.x, other.y), .5);
  const next = point(-75); assert.equal(moveVolumeKnobGesture(model, next.x, next.y), .56);
});

function componentHarness() {
  const cells = [], effects = [], pending = [], calls = [], values = [];
  let cursor = 0, rail, root, props = { value: .3, disabled: false, pending: false, error: null, onChange: value => values.push(value) };
  const listeners = new Map();
  const listen = (prefix, name, fn) => listeners.set(prefix + name, fn);
  const unlisten = (prefix, name, fn) => { if (listeners.get(prefix + name) === fn) listeners.delete(prefix + name); };
  const react = {
    useContext: () => rail,
    useRef: value => { const index = cursor++; return cells[index] ??= { current: value }; },
    useState: value => { const index = cursor++; const cell = cells[index] ??= { value }; cell.set ??= value => { cell.value = value; }; return [cell.value, cell.set]; },
    useCallback: (fn, deps) => { const index = cursor++; if (!cells[index] || deps.some((value, i) => !Object.is(value, cells[index].deps[i]))) cells[index] = { fn, deps }; return cells[index].fn; },
    useEffect: (fn, deps) => { const index = cursor++; if (!effects[index] || deps.some((value, i) => !Object.is(value, effects[index].deps[i]))) pending.push({ index, fn, deps }); },
  };
  const document = { visibilityState: 'visible', addEventListener: (name, fn) => listen('document:', name, fn), removeEventListener: (name, fn) => unlisten('document:', name, fn) };
  const window = { addEventListener: (name, fn) => listen('window:', name, fn), removeEventListener: (name, fn) => unlisten('window:', name, fn) };
  const module = load({ react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }, './scroll/RailContext': { RailContext: {} }, './PhysicalDeck.module.css': { __esModule: true, default: { rotary: 'rotary', volumeScale: 'scale', volumeValue: 'value' } } }, { window, document });
  const makeRail = name => ({ stop: token => calls.push(['stop', name, token]), start: token => calls.push(['start', name, token]) });
  rail = makeRail('A');
  let captured = null;
  const element = {
    focus() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 80 }),
    setPointerCapture: pointer => { captured = pointer; }, hasPointerCapture: pointer => captured === pointer,
    releasePointerCapture: pointer => { captured = null; root.props.onLostPointerCapture(event({ pointerId: pointer })); },
  };
  function event(extra = {}) { return { pointerId: 7, button: 0, clientX: 50, clientY: 40, currentTarget: element, preventDefault() {}, stopPropagation() {}, ...extra }; }
  function render(changes = {}, nextRail = rail) {
    props = { ...props, ...changes }; rail = nextRail; cursor = 0; root = module.PhysicalVolumeKnob(props);
    for (const effect of pending.splice(0)) { effects[effect.index]?.cleanup?.(); effects[effect.index] = { deps: effect.deps, cleanup: effect.fn() }; }
    return root;
  }
  render();
  return { render, event, calls, values, makeRail, get root() { return root; }, get captured() { return captured; },
    fire: (prefix, name) => listeners.get(prefix + name)?.(), hide: () => { document.visibilityState = 'hidden'; listeners.get('document:visibilitychange')?.(); },
    unmount: () => effects.filter(Boolean).forEach(effect => effect.cleanup?.()), element };
}

test('value/context rerenders retain capture; release resumes only the rail that owns the gesture once', () => {
  const run = componentHarness(); run.root.props.onPointerDown(run.event());
  run.render({ value: .4, pending: true }, run.makeRail('B'));
  assert.equal(run.captured, 7); assert.equal(run.root.props['data-volume-dragging'], true);
  run.root.props.onPointerMove(run.event({ clientY: 10 })); assert.equal(run.values.at(-1), .5);
  run.root.props.onPointerUp(run.event()); assert.equal(run.captured, null);
  assert.deepEqual(run.calls.map(call => call.slice(0, 2)), [['stop', 'A'], ['start', 'A']]);
  run.unmount(); assert.equal(run.calls.length, 2);
});

test('foreign pointers cannot end the drag; cancel, disable, blur, resize, hide and unmount release their own capture', () => {
  for (const finish of ['cancel', 'disable', 'blur', 'resize', 'hide', 'unmount']) {
    const run = componentHarness(); run.root.props.onPointerDown(run.event());
    run.root.props.onPointerUp(run.event({ pointerId: 44 })); assert.equal(run.captured, 7);
    if (finish === 'cancel') run.root.props.onPointerCancel(run.event());
    if (finish === 'disable') run.render({ disabled: true });
    if (finish === 'blur') run.fire('window:', 'blur');
    if (finish === 'resize') run.fire('window:', 'resize');
    if (finish === 'hide') run.hide();
    if (finish === 'unmount') run.unmount();
    assert.equal(run.captured, null, finish);
    assert.deepEqual(run.calls.map(call => call.slice(0, 2)), [['stop', 'A'], ['start', 'A']], finish);
    run.unmount();
  }
});

test('keyboard retains slider limits/steps and Escape releases without issuing a volume command', () => {
  const run = componentHarness();
  assert.equal(run.root.props['aria-valuemin'], 0); assert.equal(run.root.props['aria-valuemax'], 100);
  for (const [key, expected] of [['ArrowUp', .31], ['ArrowLeft', .29], ['PageUp', .4], ['Home', 0], ['End', 1]]) {
    run.root.props.onKeyDown(run.event({ key })); assert.ok(Math.abs(run.values.at(-1) - expected) < .0001);
  }
  const count = run.values.length; run.root.props.onPointerDown(run.event()); run.root.props.onKeyDown(run.event({ key: 'Escape' }));
  assert.equal(run.values.length, count); assert.equal(run.captured, null); run.unmount();
});
