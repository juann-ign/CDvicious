const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const clock = class extends Date { static now() { return 100_000; } };
const tick = () => new Promise(setImmediate);
const album = { id: "next", name: "Next", images: [] };
const snapshot = (id) => ({
  sampledAt: clock.now(), deviceId: "player", isPlaying: true,
  track: { id: id + "-track", album: { id } },
});

function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    module, exports: module.exports, Date: clock, require: (name) => dependencies[name],
    AbortController, DOMException, setTimeout, clearTimeout, ...globals,
  }, { filename: file });
  return module.exports;
}

function setup(t) {
  const coordinator = load("src/lib/playbackSnapshotCoordinator.ts");
  const requests = [];
  const store = load("src/lib/nowPlayingStore.ts", { "./playbackSnapshotCoordinator": coordinator }, {
    window: new EventTarget(),
    document: Object.assign(new EventTarget(), { visibilityState: "visible" }),
    fetch: (_url, { signal }) => new Promise((resolve) => requests.push({ signal, resolve })),
  });
  store.acquire();
  t.after(() => store.release());
  return { store, requests, coordinator };
}

for (const status of [200, 429]) {
  test(`an old ${status} poll finishing after handoff cannot replace confirmed playback or disable polling`, async (t) => {
    const { store, requests, coordinator } = setup(t);
    let finishBody;
    requests[0].resolve({
      status, ok: status === 200, json: () => new Promise((resolve) => { finishBody = resolve; }),
    });
    await tick();
    const attempt = coordinator.beginPlaybackAttempt(album, "player");
    assert.equal(requests[0].signal.aborted, true);
    store.refresh("poll");
    assert.equal(requests.length, 1);
    coordinator.markPlaybackDocked(attempt.attemptId);
    const confirmed = snapshot("next");
    assert.equal(coordinator.confirmPlaybackSnapshot(attempt, confirmed, clock.now()), true);
    coordinator.finishPlaybackAttempt(attempt.attemptId);
    assert.equal(store.getSnapshot().data, confirmed);
    finishBody(status === 200 ? snapshot("old") : { reason: "QUOTA_EXCEEDED" });
    await tick();
    assert.equal(store.getSnapshot().data, confirmed);
    assert.equal(store.getSnapshot().error, false);
    store.refresh("poll");
    assert.equal(requests.length, 2);
  });
}

test("failed handoff keeps the previous album while polling resumes", async (t) => {
  const { store, requests, coordinator } = setup(t);
  const previous = snapshot("previous");
  requests[0].resolve({ status: 200, ok: true, json: async () => previous });
  await tick();
  const attempt = coordinator.beginPlaybackAttempt(album, "player");
  coordinator.failPlaybackAttempt(attempt.attemptId, "No device");
  coordinator.finishPlaybackAttempt(attempt.attemptId);
  assert.equal(store.getSnapshot().data, previous);
  store.refresh("poll");
  assert.equal(requests.length, 2);
});
