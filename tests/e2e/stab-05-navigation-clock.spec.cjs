const { test, expect } = require('./support/qa-evidence.cjs');

test('menu reaches its timed destination on the first frame after a multi-second RAF gap', async ({page}, info) => {
  test.skip(process.env.RAIL_FLAG !== '1', 'Requires the desktop rail.');
  await page.addInitScript(() => {
    const nativeRAF=window.requestAnimationFrame.bind(window);
    const nativeCancel=window.cancelAnimationFrame.bind(window);
    const held=new Map();
    window.__clockGap={arm:false,hold:false,started:null,released:null,firstFrame:null};
    window.requestAnimationFrame=callback=>{
      const id=nativeRAF(time=>{
        if(window.__clockGap.hold) held.set(id,callback);
        else callback(time);
      });
      return id;
    };
    window.cancelAnimationFrame=id=>{held.delete(id);nativeCancel(id);};
    document.addEventListener('click',event=>{
      const label=event.target.closest?.('button')?.getAttribute('aria-label');
      if(window.__clockGap.arm && label?.endsWith('Mixtape Lab')) {
        window.__clockGap.hold=true;window.__clockGap.started=performance.now();
      }
    },true);
    window.__releaseClockGap=()=>new Promise(resolve=>{
      window.__clockGap.hold=false;
      window.__clockGap.released=performance.now();
      // Resume callbacks using a real RAF timestamp, never a timer-driven frame.
      nativeRAF(time=>{
        const callbacks=[...held.values()];held.clear();
        for(const callback of callbacks) callback(time);
        const wrapper=document.querySelector('[data-rail-wrapper]');
        window.__clockGap.firstFrame={at:performance.now(),scroll:wrapper.scrollLeft,target:wrapper.firstElementChild.children[4].offsetLeft,chapter:document.documentElement.dataset.chapter};
        resolve(window.__clockGap);
      });
    });
  });
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('[data-rail-ready="true"]')).toBeVisible({timeout:90000});
  await page.evaluate(()=>{window.__clockGap.arm=true;});
  await page.getByRole('button',{name:/Mixtape Lab$/}).click();
  // Menu duration for four chapters is 3.12s (max 3.25s). JS/timers continue
  // while the queued native RAF callbacks are withheld, without fake frames.
  await page.waitForTimeout(3600);
  const measurement=await page.evaluate(()=>window.__releaseClockGap());
  await info.attach('delayed-first-frame',{body:JSON.stringify(measurement,null,2),contentType:'application/json'});
  expect(measurement.firstFrame.at-measurement.started).toBeGreaterThan(3500);
  expect(Math.abs(measurement.firstFrame.scroll-measurement.firstFrame.target)).toBeLessThan(2);
  expect(measurement.firstFrame.chapter).toBe('4');
  await expect(page.getByRole('button',{name:/Mixtape Lab$/})).toHaveAttribute('aria-current','location');
});
