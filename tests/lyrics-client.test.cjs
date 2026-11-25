const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function harness() {
  const slots = [];
  let cursor = 0;
  let dirty = false;
  let effects = [];
  let currentTrack = null;
  let value;
  const requests = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (next) => {
        const updated = typeof next === "function" ? next(slots[index].value) : next;
        if (!Object.is(updated, slots[index].value)) { slots[index].value = updated; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || dependencies.some((dependency, at) => !Object.is(dependency, previous.dependencies[at]))) {
        slots[index] = { dependencies, cleanup: previous?.cleanup };
        effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = effect(); });
      }
    },
  };
  const load = (file, dependencies = {}) => {
    const module = { exports: {} };
    const js = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(js, {
      module, exports: module.exports, require: (name) => dependencies[name], AbortController, URLSearchParams, Number, Date,
      window: { setTimeout, clearTimeout },
      fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, signal: options.signal, resolve, reject })),
    });
    return module.exports;
  };
  const lyrics = load("src/lib/lyrics.ts");
  const { useLyrics } = load("src/hooks/useLyrics.ts", { react, "@/lib/lyrics": lyrics });
  const drain = () => {
    let passes = 0;
    do {
      dirty = false; cursor = 0; effects = [];
      value = useLyrics(currentTrack);
      effects.forEach((effect) => effect());
      assert.equal(++passes < 15, true, "hook must settle without an effect loop");
    } while (dirty);
    return value;
  };
  return {
    requests,
    render(track) { currentTrack = track; return drain(); },
    async settle() { await new Promise((resolve) => setImmediate(resolve)); return drain(); },
    get value() { return value; },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}
const track = (id) => ({ id, name: `Song ${id}`, artists: [{ name: "Artist" }], duration_ms: 180000, album: { name: "Album", images: [] } });

test("A lento no pisa letra B aunque transporte complete una solicitud abortada", async () => {
  const run = harness();
  try {
    run.render(track("A"));
    run.render(track("B"));
    assert.equal(run.requests[0].signal.aborted, true);
    run.requests[1].resolve(Response.json({ lyrics: "CURRENT B" }));
    await run.settle();
    assert.equal(run.value.lyrics, "CURRENT B");
    run.requests[0].resolve(Response.json({ lyrics: "STALE A" }));
    await run.settle();
    assert.equal(run.value.lyrics, "CURRENT B");
    assert.equal(run.value.loading, false);
  } finally { run.unmount(); }
});

test("quitar pista cancela lectura pendiente y no publica una letra ajena", async () => {
  const run = harness();
  try {
    run.render(track("A"));
    run.render(null);
    assert.equal(run.requests[0].signal.aborted, true);
    run.requests[0].resolve(Response.json({ lyrics: "STALE" }));
    await run.settle();
    assert.equal(run.value.lyrics, null);
    assert.equal(run.value.loading, false);
  } finally { run.unmount(); }
});

test("pausa, progreso y nuevos objetos de la misma pista conservan lectura sin refetch", async () => {
  const run = harness();
  try {
    run.render(track("A"));
    run.requests[0].resolve(Response.json({ lyrics: "SAME TRACK" }));
    await run.settle();
    for (const playing of [false, true, false]) run.render({ ...track("A"), isPlaying: playing, progressMs: 45000 });
    assert.equal(run.requests.length, 1);
    assert.equal(run.value.lyrics, "SAME TRACK");
    assert.equal(new URL(run.requests[0].url, "http://local").searchParams.get("duration"), "180");
  } finally { run.unmount(); }
});
