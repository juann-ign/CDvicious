const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the real provider with controlled hooks/Lenis lifecycle. Browser
// regressions separately deliver trusted middle-button and touch input.
function harness({ animate = false, reducedMotion = false, initialTime = 1000 } = {}) {
  const refs = [], effects = [], timers = new Map(), frames = new Map();
  const listeners = new Map();
  let nextId = 0, instance, now = initialTime;
  // Use the installed Lenis Animate and raf implementations, rather than a
  // second implementation of its duration/lerp math or first-time semantics.
  const lenisSource = fs.readFileSync('node_modules/lenis/dist/lenis.mjs', 'utf8');
  const animateEnd = lenisSource.indexOf('\n};', lenisSource.indexOf('var Animate = class')) + 3;
  const Animate = vm.runInNewContext(lenisSource.slice(0, animateEnd) + '; Animate;');
  const rafStart = lenisSource.indexOf('raf = (time) => {');
  const consumeFrame = vm.runInNewContext('(function(time) {' + lenisSource.slice(lenisSource.indexOf('{', rafStart) + 1, lenisSource.indexOf('\n\t};', rafStart)) + '\n})');
  const loadClock = () => {
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/scroll/railAnimationClock.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {module, exports: module.exports});
    return module.exports;
  };
  const element = () => ({ dataset: {}, style: { overflow: '', setProperty() {}, removeProperty() {} }, toggleAttribute() {}, querySelector: () => null });
  const root = element(), wrapper = element(), content = element();
  wrapper.clientWidth = 1280;
  content.children = Array.from({ length: 5 }, (_, index) => ({ ...element(), offsetLeft: index * 1280, offsetWidth: 1280 }));
  class Lenis {
    constructor(options) { instance = this; this.options = options; this.scroll = 0; this.targetScroll = 0; this.isScrolling = false; this.isStopped = false; this.velocity = 0; this.isTouching = false; this.calls = []; this.times = []; this.animate = animate ? new Animate() : { isRunning: false }; }
    on() {} off() {}
    scrollTo(target, options) {
      this.calls.push({ target, options });
      if (options.immediate || target === this.targetScroll) { this.scroll = this.targetScroll = target; this.isScrolling = false; this.animate.isRunning = false; options.onComplete?.(); return; }
      this.targetScroll = target; this.isScrolling = 'smooth'; this.animate.isRunning = true;
      if (animate) this.animate.fromTo(this.scroll, target, { lerp: this.options.lerp, ...options, onUpdate: (value, complete) => {
        this.scroll = value;
        if (complete) { this.isScrolling = false; options.onComplete?.(); }
      } });
    }
    raf(time) { this.times.push(time); if (animate) consumeFrame.call(this, time); }
    stop() { this.isStopped = true; this.isScrolling = false; this.animate.isRunning = false; }
    start() { this.isStopped = false; }
    destroy() { this.destroyed = true; }
  }
  const React = {
    createContext: () => ({ Provider: Symbol('provider') }),
    useRef: current => { const ref = { current }; refs.push(ref); return ref; },
    useState: value => [value, () => {}],
    useMemo: factory => factory(), useCallback: callback => callback,
    useEffect: effect => effects.push(effect), useContext: () => null,
  };
  const jsx = (type, props) => ({ type, props });
  const module = { exports: {} };
  const filename = process.env.RAIL_TEST_SOURCE || 'src/components/scroll/RailContext.tsx';
  const javascript = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const document = { documentElement: element(), body: element(), visibilityState: 'visible',
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if(listeners.get(name) === callback) listeners.delete(name); },
  };
  const window = {
    innerWidth: 1280, matchMedia: () => ({ matches: reducedMotion }),
    setTimeout: callback => { const id = ++nextId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: callback => { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  vm.runInNewContext(javascript, { module, exports: module.exports, document, window, performance: {now: () => now},
    ResizeObserver: class { observe() {} disconnect() {} },
    require: name => name === 'react' ? React : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : name === 'lenis' ? { default: Lenis } : name === './railAnimationClock' ? loadClock() : { default: {} },
  }, { filename });
  const tree = module.exports.RailProvider({ children: null });
  const actions = tree.props.value;
  [root, wrapper, content].forEach((node, index) => { refs[index].current = node; });
  const cleanup = effects[0]();
  const state = () => ({ snap: refs[9].current, target: refs[10].current, sequence: refs[11].current, source: refs[12].current });
  const frame = time => { now = time; const [id, callback] = frames.entries().next().value; frames.delete(id); callback(time); };
  const idle = () => { const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); };
  const interrupt = scrolling => { instance.animate.isRunning = false; instance.isScrolling = scrolling; instance.velocity = 0; };
  const visibility = (value, time) => { now = time; document.visibilityState = value; listeners.get('visibilitychange')?.(); };
  return { actions, lenis: instance, state, frame, idle, interrupt, root, timers, frames, listeners, visibility, setNow: time => { now = time; }, cleanup };
}

module.exports = { harness };
