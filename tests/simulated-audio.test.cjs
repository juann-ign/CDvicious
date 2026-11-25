const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: (name) => dependencies[name], ...globals });
  return module.exports;
}

const audio = load("src/lib/simulatedAudio.ts");

test("the shared playback clock advances only while playing and replaces the track's seed", () => {
  const first = audio.simulatedAudioSnapshot("album:track-1", 12_345, true, 1000);
  assert.equal(audio.simulatedPlaybackSeconds(first, 1500), 12.845);
  assert.equal(audio.simulatedPlaybackSeconds(first, 800), 12.345);
  const paused = audio.simulatedAudioSnapshot(first.trackKey, 12_845, false, 1500);
  assert.equal(audio.simulatedPlaybackSeconds(paused, 3000), 12.845);
  assert.equal(paused.seed, first.seed);
  const next = audio.simulatedAudioSnapshot("album:track-2", 0, true, 3000);
  assert.notEqual(next.seed, first.seed);
  assert.equal(audio.simulatedPlaybackSeconds(next, 3050), .05);
  assert.equal(audio.simulatedAudioSnapshot(undefined, NaN, true, 0).playing, false);
  assert.equal(audio.simulatedAudioSnapshot("track", -10, true, 0).progress, 0);
});

test("shared low, middle and high reproduce the existing VFD levels", () => {
  const seed = audio.trackSeed("mock-track-01");
  for (const seconds of [0, .2, 1.25, 32.71, 120]) {
    const beat = seconds * (90 + seed % 37) / 60;
    const phase = (seed % 100) / 100 * 2 * Math.PI;
    const phrase = (1 + Math.sin(beat * Math.PI / 4 + phase)) / 2;
    const kick = Math.exp(-(beat % 1) * 8);
    const snare = Math.floor(beat) % 2 === 1 ? Math.exp(-(beat % 1) * 6) : 0;
    const hats = Math.exp(-(beat * 2 % 1) * 8);
    const actual = audio.simulatedPulse(seconds, seed);
    assert.equal(actual.low, .26 + .17 * phrase + .51 * kick);
    assert.equal(actual.middle, .22 + .17 * phrase + .16 * kick + .27 * snare);
    assert.equal(actual.high, .10 + .10 * phrase + .27 * hats + .17 * snare);
    assert.equal(actual.phase, beat * Math.PI / 3 + phase);
  }
});

test("the driver has a smooth outward stroke, inward rebound, delayed upper cone and bounded volume", () => {
  const seed = audio.trackSeed("bass-envelope");
  const pulse = audio.simulatedPulse(0, seed);
  const at = (age, volume = 1) => audio.speakerExcursion({ ...pulse, phrase: 1, sinceSpeakerBeat: age }, volume);
  assert.equal(at(0).low, 0);
  assert.equal(at(.048).low, 1);
  assert.equal(at(.024).low, .5);
  assert.equal(at(.012).mid, 0);
  assert.ok(at(.060).mid > at(.048).mid);
  assert.ok(at(.080).low > 0 && at(.080).low < at(.048).low);
  assert.ok(at(.166).low < -.20 && at(.166).low > -.25);
  assert.ok(at(.283).low > 0 && at(.283).low < .20);
  assert.equal(at(.43).low, 0);
  assert.equal(at(.48).mid, 0);
  assert.equal(at(.048, 0).low, 0);
  assert.equal(at(.048, 0).mid, 0);
  assert.ok(at(.048, .25).low < at(.048, null).low);
  // No discontinuities at the crest, zero-crossing or beat reset.
  for (let age = .001; age < .46; age += .001) {
    assert.ok(Math.abs(at(age).low - at(age - .001).low) < .04);
  }
  for (let seconds = 0; seconds < 60; seconds += .013) {
    const signal = audio.simulatedPulse(seconds, seed);
    const first = audio.speakerExcursion(signal, 1);
    const second = audio.speakerExcursion(signal, 1);
    assert.equal(first.low, second.low);
    assert.equal(first.mid, second.mid);
    assert.ok(first.low >= -.25 && first.low <= 1 && first.mid >= -.25 && first.mid <= 1);
  }
});

test("woofer strokes are spaced 50 percent farther apart without changing the VFD beat or envelope", () => {
  for (const seed of [0, 18, 36]) {
    const beat = 60 / (90 + seed % 37);
    const interval = beat * 1.5;
    const peak = audio.simulatedPulse(.048, seed);
    const next = audio.simulatedPulse(interval + .048, seed);
    assert.ok(Math.abs(next.sinceSpeakerBeat - peak.sinceSpeakerBeat) < 1e-9);
    assert.equal(audio.speakerExcursion(audio.simulatedPulse(beat + .048, seed), 1).low, 0);
    assert.ok(audio.speakerExcursion(next, 1).low > .79);
    assert.ok(Math.abs(audio.simulatedPulse(beat + .048, seed).sinceBeat - .048) < 1e-9);
  }
});

function excursionHarness() {
  let index = 0, serial = 0;
  const hooks = [], effects = [], frames = new Map(), properties = new Map();
  const events = () => {
    const listeners = new Map();
    return {
      addEventListener(name, listener) {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name).add(listener);
      },
      removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
      dispatch(name) { for (const listener of [...(listeners.get(name) ?? [])]) listener(); },
    };
  };
  const document = { ...events(), hidden: false };
  const motion = { ...events(), matches: false };
  const root = { dataset: {}, style: { setProperty: (name, value) => properties.set(name, value) } };
  const rootRef = { current: root };
  const clock = { current: audio.simulatedAudioSnapshot("track-a", 0, true, 0) };
  const react = {
    useRef(value) { const position = index++; return hooks[position] ??= { current: value }; },
    useEffect(callback, deps) {
      const position = index++;
      if (!hooks[position] || deps.some((value, i) => value !== hooks[position].deps[i])) effects.push(() => {
        hooks[position]?.cleanup?.();
        hooks[position] = { deps, cleanup: callback() };
      });
    },
  };
  const { useSpeakerExcursion } = load("src/hooks/useSpeakerExcursion.ts", { react, "@/lib/simulatedAudio": audio }, {
    document, window: { matchMedia: () => motion },
    requestAnimationFrame(callback) { const id = ++serial; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  return {
    document, motion, clock, root,
    render(options = {}) {
      index = 0;
      useSpeakerExcursion(rootRef, { clock, trackKey: "track-a", isPlaying: true, active: true, volume: 1, ...options });
      while (effects.length) effects.shift()();
    },
    frame(now) { const ready = [...frames.values()]; frames.clear(); ready.forEach((callback) => callback(now)); },
    frameCount() { return frames.size; },
    low() { return Number(properties.get("--speaker-cone-low")); },
    mid() { return Number(properties.get("--speaker-cone-mid")); },
    unmount() { for (const hook of hooks) hook.cleanup?.(); },
  };
}

test("the cone loop stops and restores exact neutral values on pause, hidden, reduced, mute, inactive and unmount", () => {
  const run = excursionHarness();
  const neutral = () => {
    assert.equal(run.frameCount(), 0);
    assert.equal(run.low(), 0);
    assert.equal(run.mid(), 0);
  };
  const moving = (time) => {
    assert.equal(run.frameCount(), 1);
    run.frame(time);
    assert.ok(run.low() > 0);
  };
  run.render();
  assert.equal(run.root.dataset.speakerSignal, "simulated");
  moving(36);
  run.clock.current = audio.simulatedAudioSnapshot("track-a", 36, false, 36);
  run.render({ isPlaying: false });
  neutral();
  run.clock.current = audio.simulatedAudioSnapshot("track-a", 36, true, 200);
  run.render();
  moving(210);
  run.document.hidden = true;
  run.document.dispatch("visibilitychange");
  neutral();
  run.document.hidden = false;
  run.document.dispatch("visibilitychange");
  moving(220);
  run.motion.matches = true;
  run.motion.dispatch("change");
  neutral();
  assert.equal(run.root.dataset.speakerMotion, "reduced");
  run.motion.matches = false;
  run.motion.dispatch("change");
  moving(230);
  run.render({ volume: 0 });
  neutral();
  run.render({ volume: null });
  moving(240);
  run.render({ active: false });
  neutral();
  run.render();
  moving(250);
  run.unmount();
  neutral();
  assert.equal(run.root.dataset.speakerMotion, "idle");
});

test("a track change clears the previous excursion and resumes from the new shared clock", () => {
  const run = excursionHarness();
  run.render();
  run.frame(30);
  assert.ok(run.low() > 0);
  run.clock.current = audio.simulatedAudioSnapshot("track-b", 24, true, 100);
  run.render({ trackKey: "track-b" });
  assert.equal(run.low(), 0);
  run.frame(100);
  const expected = audio.speakerExcursion(audio.simulatedPulse(.024, run.clock.current.seed), 1);
  assert.equal(run.low(), Math.round(expected.low * 10000) / 10000);
  run.clock.current = audio.simulatedAudioSnapshot(undefined, 0, false, 120);
  run.render({ trackKey: undefined, isPlaying: false });
  assert.equal(run.low(), 0);
  assert.equal(run.mid(), 0);
  assert.equal(run.frameCount(), 0);
});
