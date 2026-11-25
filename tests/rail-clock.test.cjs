const { test } = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./support/rail-harness.cjs');
const ease = t => .5 - Math.cos(Math.PI * Math.min(1,t)) / 2;
const close = (actual, expected) => assert.ok(Math.abs(actual-expected)<1e-6, `${actual} != ${expected}`);

// These exercise the provider's clocks with the installed Lenis raf/Animate,
// including its first timestamp and duration/easing consumption. DOM/native
// input remains covered separately by the browser interruption regressions.
for (const source of ['rail','flight']) {
  for (const hz of [24,30,60,120]) {
    test(`${source}: duration/easing and continuous progress at ${hz} Hz`, () => {
      const run = harness({animate:true});
      run.actions.scrollToChapter(4, 1, source);
      const positions=[0];
      for(let i=1;i<=hz;i++) {
        run.frame(1000+i*1000/hz);
        positions.push(run.lenis.scroll);
        close(run.lenis.scroll,5120*ease(i/hz));
      }
      for(let i=1;i<positions.length;i++) assert.ok(positions[i]>=positions[i-1]);
      if(hz>=30) assert.ok(Math.max(...positions.slice(1).map((p,i)=>p-positions[i]))<1280*.45);
      // Summing Lenis's seconds can leave 1s a few ulps short at some rates.
      // Position above is checked at the exact deadline; completion must be
      // published by the next presented frame, not after another duration.
      run.frame(2000+1000/hz);
      assert.equal(run.state().snap,false);
      run.cleanup();
    });
  }
  test(`${source}: a multi-second RAF gap catches up on the next frame`, () => {
    const run=harness({animate:true});
    run.actions.scrollToChapter(4,4.8,source);
    run.frame(1100);
    run.frame(3700);
    close(run.lenis.scroll,5120*ease(2.7/4.8));
    assert.equal(run.state().snap,true);
    run.frame(7000);
    close(run.lenis.scroll,5120);
    assert.equal(run.state().source,null);
    assert.equal(run.state().snap,false);
    run.cleanup();
  });
  test(`${source}: a command before the first RAF inherits no earlier time`, () => {
    const run=harness({animate:true,initialTime:0});
    run.setNow(5000);
    run.actions.scrollToChapter(4,1,source);
    run.frame(5500);
    close(run.lenis.scroll,2560);
    run.cleanup();
  });
}

test('inertia stays capped, then menu and flight each start a fresh monotonic epoch', () => {
  const run=harness({animate:true});
  run.actions.scrollToX(1280);
  run.frame(6000);
  assert.equal(run.lenis.times.at(-1)-run.lenis.times.at(-2),32);
  assert.ok(run.lenis.scroll>0 && run.lenis.scroll<1280);
  const from=run.lenis.scroll;
  run.setNow(7000);
  run.actions.scrollToChapter(4,1);
  run.frame(7250);
  close(run.lenis.scroll,from+(5120-from)*ease(.25));
  const menuComplete=run.lenis.calls.at(-1).options.onComplete;
  const atSwitch=run.lenis.scroll;
  run.setNow(7400);
  run.actions.scrollToChapter(0,1,'flight');
  menuComplete(); // Old sequence must not rebase/disable the new clock.
  assert.equal(run.state().source,'flight');
  run.frame(7900);
  close(run.lenis.scroll,atSwitch*.5);
  run.frame(8400);
  close(run.lenis.scroll,0);
  run.actions.scrollToX(1280);
  const before=run.lenis.times.at(-1);
  run.frame(13400);
  assert.equal(run.lenis.times.at(-1)-before,32);
  assert.ok(run.lenis.scroll>0 && run.lenis.scroll<1280);
  run.cleanup();
});

test('wheel interruption discards the timed epoch; an old callback cannot reset a newer menu', () => {
  const run=harness({animate:true});
  run.actions.scrollToChapter(4,4.8,'flight');
  run.frame(1100);
  const old=run.lenis.calls.at(-1).options.onComplete;
  run.setNow(5000);
  run.lenis.options.virtualScroll({event:{type:'wheel'},deltaX:0,deltaY:700});
  assert.equal(run.state().source,null);
  run.lenis.scrollTo(1280,{lerp:.09}); // Lenis accepts the intercepted native wheel delta.
  const before=run.lenis.times.at(-1);
  run.frame(6000);
  assert.equal(run.lenis.times.at(-1)-before,32);
  const from=run.lenis.scroll;
  run.setNow(6500);
  run.actions.scrollToChapter(4,1);
  old();
  run.frame(7000);
  close(run.lenis.scroll,from+(5120-from)*.5);
  assert.equal(run.state().source,'menu');
  run.cleanup();
});

test('same-source replacement also excludes time before the new command', () => {
  const run=harness({animate:true});
  run.actions.scrollToChapter(4,1);
  run.frame(1250);
  const from=run.lenis.scroll;
  run.setNow(5000);
  run.actions.scrollToChapter(2,1);
  run.frame(5250);
  close(run.lenis.scroll,from+(2560-from)*ease(.25));
  run.cleanup();
});

test('visibility suspends RAF delivery; menu/flight catch up, inertia excludes hidden elapsed', () => {
  for(const source of ['rail','flight']) {
    const run=harness({animate:true});
    run.actions.scrollToChapter(4,1,source);
    run.frame(1100);
    const atHide=run.lenis.scroll;
    run.visibility('hidden',1200);
    assert.equal(run.frames.size,0);
    assert.equal(run.lenis.scroll,atHide);
    run.visibility('visible',10000);
    run.visibility('visible',10001);
    assert.equal(run.frames.size,1);
    run.frame(10016);
    close(run.lenis.scroll,5120);
    run.cleanup();
    assert.equal(run.listeners.size,0);
  }
  const run=harness({animate:true});
  run.actions.scrollToX(1280);
  run.frame(1016);
  run.visibility('hidden',1100);
  run.visibility('visible',10000);
  const before=run.lenis.times.at(-1);
  run.frame(10016);
  assert.equal(run.lenis.times.at(-1)-before,16);
  run.cleanup();
});

test('interrupt/reset and stale completion cannot charge an old gap to a new command', () => {
  const run=harness({animate:true});
  run.actions.scrollToChapter(4,1,'flight');
  run.frame(1100);
  const old=run.lenis.calls.at(-1).options.onComplete;
  run.interrupt('native');
  run.frame(5000);
  const from=run.lenis.scroll;
  run.setNow(6000);
  run.actions.scrollToChapter(2,1);
  old();
  run.frame(6250);
  close(run.lenis.scroll,from+(2560-from)*ease(.25));
  const token=Symbol('modal');
  run.actions.stop(token);
  run.actions.scrollToChapter(4,1);
  assert.equal(run.state().source,null);
  run.actions.start(token);
  run.cleanup();
  old();
  assert.equal(run.frames.size,0);
  assert.equal(run.listeners.size,0);
});

test('a command started while hidden excludes all time before that command', () => {
  for(const source of ['rail','flight']) {
    const run=harness({animate:true});
    run.visibility('hidden',1100);
    run.setNow(10000);
    run.actions.scrollToChapter(4,1,source);
    run.visibility('visible',10200);
    run.frame(10500);
    close(run.lenis.scroll,2560);
    run.cleanup();
  }
});

test('reduced motion and explicit zero duration remain immediate', () => {
  for(const reducedMotion of [true,false]) {
    const run=harness({animate:true,reducedMotion});
    run.actions.scrollToChapter(4,reducedMotion?1:0,'flight');
    close(run.lenis.scroll,5120);
    assert.equal(run.state().source,null);
    assert.equal(run.state().snap,false);
    run.cleanup();
  }
});
