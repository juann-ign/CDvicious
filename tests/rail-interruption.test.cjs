const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./support/rail-harness.cjs');

for (const scrolling of [false, 'native']) {
  test('Lenis interruption (' + scrolling + ') clears the flight before clock selection and reaches idle', () => {
    const run = harness();
    run.frame(1000);
    run.actions.scrollToChapter(4, 4.8, 'flight');
    run.frame(1016);
    assert.equal(run.state().source, 'flight');
    assert.equal(run.state().snap, true);
    const sequence = run.state().sequence;
    run.interrupt(scrolling); // Lenis reset/native interruption does not call onComplete.
    run.frame(6016);
    assert.equal(run.state().source, null);
    assert.equal(run.state().snap, false);
    assert.equal(run.state().target, null);
    assert.ok(run.state().sequence > sequence);
    // The interrupted flight's unconsumed interval belongs to the old command.
    assert.equal(run.lenis.times.at(-1) - run.lenis.times.at(-2), 0);
    run.idle();
    assert.equal(run.root.dataset.railMoving, 'false');
    run.cleanup();
  });
}

test('a completion from the interrupted flight cannot clear a newer menu navigation', () => {
  const run = harness();
  run.frame(1000);
  run.actions.scrollToChapter(4, 4.8, 'flight');
  const oldComplete = run.lenis.calls.at(-1).options.onComplete;
  run.interrupt(false);
  run.frame(1016);
  run.actions.scrollToChapter(2);
  const current = run.state();
  oldComplete();
  assert.deepEqual(run.state(), current);
  assert.equal(run.state().source, 'menu');
  assert.equal(run.state().snap, true);
  run.lenis.calls.at(-1).options.onComplete();
  assert.equal(run.state().source, null);
  assert.equal(run.state().snap, false);
  run.cleanup();
});

test('a long frame keeps a live smooth navigation and gives menu/flight the same elapsed time', () => {
  for (const clock of ['rail', 'flight']) {
    const run = harness();
    run.frame(1000);
    run.actions.scrollToChapter(4, 4.8, clock);
    run.frame(6000);
    assert.equal(run.state().snap, true);
    assert.equal(run.state().source, clock === 'flight' ? 'flight' : 'menu');
    assert.equal(run.lenis.times.at(-1) - run.lenis.times.at(-2), 5000);
    run.idle();
    assert.equal(run.root.dataset.railMoving, 'true');
    run.cleanup();
  }
});

test('idle reconciliation respects active touch and native velocity without stopping native input', () => {
  const run = harness();
  run.actions.scrollToChapter(4, 4.8, 'flight');
  run.interrupt('native');
  run.lenis.isTouching = true;
  run.idle(); // Reconcile even when no RAF has arrived yet.
  assert.equal(run.state().source, null);
  assert.equal(run.state().snap, false);
  assert.equal(run.root.dataset.railMoving, 'true');
  assert.equal(run.lenis.isScrolling, 'native');
  run.lenis.isTouching = false;
  run.lenis.velocity = 12;
  run.idle();
  assert.equal(run.root.dataset.railMoving, 'true');
  run.lenis.velocity = 0;
  run.idle();
  assert.equal(run.root.dataset.railMoving, 'false');
  run.cleanup();
});

test('stop and cleanup invalidate pending completions without releasing another lock', () => {
  const run = harness();
  run.actions.scrollToChapter(4, 4.8, 'flight');
  const oldComplete = run.lenis.calls.at(-1).options.onComplete;
  const token = Symbol('owner');
  run.actions.stop(token);
  assert.equal(run.state().snap, false);
  assert.equal(run.state().source, null);
  run.actions.start(Symbol('other'));
  assert.equal(run.lenis.isStopped, true);
  run.actions.start(token);
  assert.equal(run.lenis.isStopped, false);
  run.actions.scrollToChapter(2);
  const active = run.state();
  oldComplete();
  assert.deepEqual(run.state(), active);
  run.cleanup();
  assert.equal(run.state().snap, false);
  assert.equal(run.state().source, null);
  assert.equal(run.timers.size, 0);
  assert.equal(run.frames.size, 0);
  assert.equal(run.listeners.size, 0);
  assert.equal(run.lenis.destroyed, true);
});
