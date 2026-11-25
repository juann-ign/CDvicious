const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise the real component's hinge lifecycle, with controlled React layout
// effects. Browser tests cover CSS geometry, data fetching and trusted gestures.
function hinge({ reduced = false } = {}) {
  const slots = [], frames = new Map(), timers = new Map();
  let cursor = 0, nextId = 0, pending = [], props, tree, currentAnimation, motionReduced = reduced;
  const jsx = (type, props) => ({ type, props });
  const frame = (callback) => { const id = ++nextId; frames.set(id, callback); return id; };
  const newAnimation = () => {
    let resolve, reject;
    const animation = {
      transitionProperty: "transform", currentTime: 0, startTime: null, playState: "running",
      finished: new Promise((done, cancel) => { resolve = done; reject = cancel; }),
      finish() { animation.currentTime = 1000; animation.startTime = 0; animation.playState = "finished"; resolve(); },
      cancel() { animation.playState = "idle"; reject(new Error("CSS transition cancelled by reduced motion")); },
    };
    return animation;
  };
  const element = {
    classList: { contains: (name) => String(find(tree, "jewel-case-hinge")?.props.className).split(/\s+/).includes(name) },
    getAnimations: () => currentAnimation?.playState === "running" ? [currentAnimation] : [],
  };
  const React = {
    useState(initial) {
      const at = cursor++;
      if (!slots[at]) slots[at] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[at].value, (value) => { slots[at].value = typeof value === "function" ? value(slots[at].value) : value; }];
    },
    useRef(current) { const at = cursor++; return slots[at] ??= { current }; },
    useCallback: (callback) => callback,
    useContext: () => null,
    useEffect() {},
    useLayoutEffect(effect, deps) {
      const at = cursor++;
      if (!slots[at] || deps.some((value, index) => value !== slots[at].deps[index])) {
        pending.push(() => { slots[at]?.cleanup?.(); slots[at] = { deps, cleanup: effect() }; });
      }
    },
  };
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync("src/components/crate/JewelCasePresentation.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require(name) {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/image") return { default: "img" };
      if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => key }) };
      if (name === "@/hooks/useAlbumTracks") return { useAlbumTracks: () => ({ tracks: [], loading: false, error: false, retry() {} }) };
      if (name.includes("useDiscSurfaceDrag")) return { useDiscSurfaceDrag: () => ({ rotation: 0, isDragging: false, cancel() {}, pointerHandlers: {} }) };
      if (name.includes("RailContext")) return { RailContext: Symbol("rail") };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    requestAnimationFrame: frame,
    cancelAnimationFrame: (id) => frames.delete(id),
    window: {
      matchMedia: () => ({ matches: motionReduced }),
      setTimeout: (callback, milliseconds) => { const id = ++nextId; timers.set(id, { callback, milliseconds }); return id; },
      clearTimeout: (id) => timers.delete(id),
    },
    getComputedStyle: () => ({ transform: currentAnimation?.playState === "finished" ? "final" : "initial" }),
    process: { env: { NEXT_PUBLIC_SPOTIFY_MOCK: "1" } },
  });
  const album = { id: "edition-stable", name: "A release", artists: [{ id: "artist-stable", name: "An artist" }], images: [], uri: "spotify:album:edition-stable" };
  const find = (node, id) => {
    if (!node || typeof node !== "object") return null;
    if (node.props?.["data-testid"] === id) return node;
    return [node.props?.children].flat(Infinity).map((child) => find(child, id)).find(Boolean) ?? null;
  };
  const render = (update = {}) => {
    if (!props || (update.open !== undefined && update.open !== props.open)) currentAnimation = newAnimation();
    props = { album, open: false, onOpen() {}, onClose() {}, discRef: { current: null }, ...props, ...update };
    cursor = 0; pending = [];
    tree = module.exports.JewelCasePresentation(props);
    const reference = find(tree, "jewel-case-hinge")?.props.ref;
    if (reference) reference.current = element;
    pending.splice(0).forEach((effect) => effect());
    return tree;
  };
  return {
    render, frames, timers,
    flushFrame() {
      for (let step = 0; frames.size && step < 10; step++) {
        const batch = [...frames.values()]; frames.clear(); batch.forEach((callback) => callback()); render();
      }
      assert.equal(frames.size, 0, "A committed class must not spin on an unchanged frame.");
    },
    async finishTransition() {
      currentAnimation.finish();
      find(render(), "jewel-case-hinge").props.onTransitionEnd?.({ target: "hinge", currentTarget: "hinge", propertyName: "transform" });
      await new Promise(setImmediate);
    },
    async reduceMotion() { motionReduced = true; currentAnimation.cancel(); await new Promise(setImmediate); },
    animation: () => currentAnimation,
    queuedCompletion: () => timers.size ? [...timers.values()].at(-1).callback : currentAnimation.finish,
    expireWallTimers() { const batch = [...timers.values()]; timers.clear(); batch.forEach(({ callback }) => callback()); },
    key(key) {
      const event = { key, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
      find(render(), "jewel-case-cd").props.onKeyDown(event);
      return event;
    },
    inspecting: () => find(render(), "jewel-case-cd").props["data-inspecting"],
    state: () => render().props["data-presentation"],
    opened: () => render().props["data-case-open"],
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}

test("a queued close completion cannot release the reserved case after reopening", async () => {
  const run = hinge();
  let opened = 0, closed = 0;
  run.render({ open: true, onOpened: () => opened++, onClosed: () => closed++ });
  run.flushFrame(); await run.finishTransition();
  assert.equal(run.state(), "open");
  assert.equal(opened, 1);
  run.render({ open: false }); run.flushFrame();
  const queuedClose = run.queuedCompletion();
  run.render({ open: true }); run.flushFrame();
  queuedClose();
  await new Promise(setImmediate);
  assert.equal(closed, 0, "The old completion must not remove a reopened case.");
  assert.equal(run.state(), "opening");
  await run.finishTransition();
  assert.equal(run.state(), "open");
  assert.equal(opened, 2);
  assert.equal(closed, 0);
  run.unmount();
});

test("reduced motion opens and folds immediately without a frame or timeout", () => {
  const run = hinge({ reduced: true });
  let opened = 0, closed = 0;
  run.render({ open: true, onOpened: () => opened++, onClosed: () => closed++ });
  assert.equal(run.opened(), true);
  assert.equal(run.state(), "open");
  assert.equal(opened, 1);
  assert.equal(run.frames.size, 0);
  assert.equal(run.timers.size, 0);
  run.render({ open: false });
  assert.equal(run.opened(), false);
  assert.equal(run.state(), "closed");
  assert.equal(closed, 1);
  run.unmount();
});

test("unmounting cancels both a scheduled frame and a dequeued completion", async () => {
  let completed = 0;
  const beforeFrame = hinge();
  beforeFrame.render({ open: true, onOpened: () => completed++ });
  beforeFrame.unmount();
  assert.equal(beforeFrame.frames.size, 0);
  const afterFrame = hinge();
  afterFrame.render({ open: true, onOpened: () => completed++ }); afterFrame.flushFrame();
  const queued = afterFrame.queuedCompletion();
  afterFrame.unmount(); queued();
  await new Promise(setImmediate);
  assert.equal(completed, 0);
  assert.equal(afterFrame.timers.size, 0);
});

test("Enter and Space retain the old CD button's activation without taking Escape", () => {
  const run = hinge();
  run.render({ open: true }); run.flushFrame();
  const enter = run.key("Enter");
  assert.equal(run.inspecting(), true);
  assert.equal(enter.prevented, true);
  assert.equal(enter.stopped, true);
  const space = run.key(" ");
  assert.equal(run.inspecting(), false);
  assert.equal(space.prevented, true);
  assert.equal(space.stopped, true);
  const escape = run.key("Escape");
  assert.equal(escape.prevented, false, "The owning modal/view must keep its Escape behavior.");
  assert.equal(escape.stopped, false);
  run.render({ disabled: true }); run.key("Enter");
  assert.equal(run.inspecting(), false);
  run.render({ disabled: false, active: false }); run.key(" ");
  assert.equal(run.inspecting(), false);
  run.unmount();
});

test("a pending CSS transition cannot publish open just because wall time elapsed", async () => {
  const run = hinge();
  let opened = 0;
  run.render({ open: true, onOpened: () => opened++ }); run.flushFrame();
  assert.equal(run.animation().startTime, null);
  assert.equal(run.animation().currentTime, 0);
  run.expireWallTimers();
  assert.equal(run.state(), "opening", "The hinge still has its closed matrix; elapsed wall time must not publish open.");
  assert.equal(opened, 0);
  await run.finishTransition();
  assert.equal(run.state(), "open");
  assert.equal(opened, 1);
  run.unmount();
});

test("enabling reduced motion during the turn settles its target after CSS cancellation", async () => {
  const run = hinge();
  let opened = 0, closed = 0;
  run.render({ open: true, onOpened: () => opened++, onClosed: () => closed++ }); run.flushFrame();
  assert.equal(run.state(), "opening");
  await run.reduceMotion();
  assert.equal(run.state(), "open");
  assert.equal(opened, 1);
  assert.equal(run.frames.size, 0);
  run.render({ open: false });
  assert.equal(run.state(), "closed");
  assert.equal(closed, 1);
  run.unmount();
});
