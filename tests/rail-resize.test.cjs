const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./support/rail-harness.cjs');

function settledCollection(run) {
  run.actions.scrollToChapter(3);
  const navigation = run.lenis.calls.at(-1);
  run.lenis.scroll = run.lenis.targetScroll;
  run.lenis.isScrolling = false;
  run.lenis.animate.isRunning = false;
  navigation.options.onComplete();
  run.emitScroll();
  for (let index = 0; run.timers.size && index < 10; index++) run.idle();
  assert.equal(run.root.dataset.chapter, '3');
  assert.equal(run.root.dataset.railMoving, 'false');
  assert.equal(run.lenis.scroll, 3840);
  assert.equal(run.state().source, null);
}

test('settled Collection stays selected when CSS zoom narrows its viewport, including an early Lenis resize event', () => {
  const run = harness();
  settledCollection(run);
  const before = run.lenis.calls.length;
  const navigation = run.state();
  const clock = run.lenis.times.slice();
  run.resizeLayout(1024);
  // Lenis can emit its old pixel position before the provider observer. This
  // must not replace the last settled album/chapter with Mixtape (index 4).
  run.emitScroll();
  run.notifyResize();
  const correction = run.lenis.calls.slice(before);
  assert.equal(correction.length, 1);
  assert.equal(correction[0].target, 3072);
  assert.equal(correction[0].options.immediate, true);
  assert.equal(run.lenis.scroll, 3072);
  assert.equal(run.root.dataset.chapter, '3');
  assert.equal(run.content.children[3].dataset.chapterActive, 'true');
  assert.equal(run.content.children[4].dataset.chapterActive, 'false');
  assert.deepEqual(run.state(), navigation);
  assert.deepEqual(run.lenis.times, clock);
  const correctedCalls = run.lenis.calls.length;
  run.notifyResize();
  assert.equal(run.lenis.calls.length, correctedCalls, 'Repeating an unchanged measurement must not issue another navigation.');
  run.cleanup();
});

for (const owner of ['menu', 'flight']) {
  test(`resizing during ${owner} keeps the active operation and issues no replacement scroll`, () => {
    const run = harness({ animate: true });
    run.actions.scrollToChapter(4, 4.8, owner === 'flight' ? 'flight' : 'rail');
    run.frame(1016);
    const before = run.lenis.calls.length;
    const navigation = run.state();
    const target = run.lenis.targetScroll;
    const clock = run.lenis.times.slice();
    run.resizeLayout(1024);
    run.emitScroll();
    run.notifyResize();
    assert.equal(run.lenis.calls.length, before);
    assert.equal(run.lenis.targetScroll, target);
    assert.equal(run.lenis.isScrolling, 'smooth');
    assert.equal(run.lenis.animate.isRunning, true);
    assert.deepEqual(run.state(), navigation);
    assert.deepEqual(run.lenis.times, clock);
    run.cleanup();
  });
}

for (const input of ['touch', 'native velocity', 'stop token']) {
  test(`resize does not take navigation from ${input}`, () => {
    const run = harness();
    settledCollection(run);
    const token = Symbol('modal owner');
    if (input === 'touch') { run.lenis.isTouching = true; run.lenis.isScrolling = 'native'; }
    else if (input === 'native velocity') { run.lenis.velocity = 12; run.lenis.isScrolling = 'native'; }
    else run.actions.stop(token);
    const before = run.lenis.calls.length;
    const navigation = run.state();
    run.resizeLayout(1024);
    run.notifyResize();
    assert.equal(run.lenis.calls.length, before);
    assert.deepEqual(run.state(), navigation);
    if (input === 'touch') assert.equal(run.lenis.isTouching, true);
    else if (input === 'native velocity') assert.equal(run.lenis.velocity, 12);
    else {
      assert.equal(run.lenis.isStopped, true);
      run.actions.start(Symbol('unrelated owner'));
      assert.equal(run.lenis.isStopped, true, 'Resize must not release another interaction lock.');
      run.actions.start(token);
      assert.equal(run.lenis.isStopped, false);
    }
    run.cleanup();
  });
}

test('a stationary native marker allows the idle chapter to adapt without starting a timed navigation', () => {
  const run = harness();
  settledCollection(run);
  run.lenis.isScrolling = 'native';
  run.lenis.velocity = 0;
  run.lenis.isTouching = false;
  const before = run.lenis.calls.length;
  run.resizeLayout(1024);
  run.notifyResize();
  assert.equal(run.lenis.calls.length, before + 1);
  assert.equal(run.lenis.calls.at(-1).target, 3072);
  assert.equal(run.lenis.calls.at(-1).options.immediate, true);
  assert.equal(run.root.dataset.chapter, '3');
  assert.equal(run.state().source, null);
  assert.equal(run.state().snap, false);
  run.cleanup();
});
