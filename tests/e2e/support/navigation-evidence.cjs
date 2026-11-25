const fs = require("node:fs");

async function installNavigationEvidence(page, record, testInfo) {
  const browserSession = await page.context().browser().newBrowserCDPSession();
  const version = await browserSession.send("Browser.getVersion");
  record("browser-version", { product: version.product, revision: version.revision, channel: process.env.PLAYWRIGHT_CHANNEL || "default" });
  await browserSession.detach();
  if (process.env.QA_CANVAS_DIMENSIONS === "1") await page.addInitScript(() => {
    const ids = new WeakMap(); let nextId = 0;
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      const bounds = rect.call(this);
      if (this.firstElementChild?.tagName === "CANVAS" && this.closest('[data-disc-frameloop]')) {
        void window.__qaEvidence({kind:"canvas-measure",browserWall:Date.now(),browserPerf:performance.now(),
          width:bounds.width,height:bounds.height,left:bounds.left,top:bounds.top,layoutWidth:this.offsetWidth,layoutHeight:this.offsetHeight,
          viewportWidth:innerWidth,viewportHeight:innerHeight});
      }
      return bounds;
    };
    for (const property of ["width", "height"]) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, property);
      Object.defineProperty(HTMLCanvasElement.prototype, property, { ...descriptor, set(value) {
        const connected = this.isConnected;
        const previous = descriptor.get.call(this);
        const at = performance.now();
        descriptor.set.call(this, value);
        if (!connected) return;
        if (!ids.has(this)) ids.set(this, nextId++);
        void window.__qaEvidence({kind:"canvas-dimension",browserWall:Date.now(),browserPerf:performance.now(),
          canvas:ids.get(this),property,requested:value,previous,actual:descriptor.get.call(this),duration:performance.now()-at,
          stack:new Error().stack,mode:this.closest('[data-disc-frameloop]')?.dataset.qaComposition});
      }});
    }
  });
  await page.addInitScript(() => {
    const send = (kind, data = {}) => {
      void window.__qaEvidence({ kind, browserWall: Date.now(), browserPerf: performance.now(), ...data });
    };
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const owners = new WeakMap();
    const counters = [];
    const pending = new Map();
    window.requestAnimationFrame = (callback) => {
      let owner = owners.get(callback);
      if (!owner) {
        owner = { id: counters.length, stack: new Error().stack, requested: 0, delivered: 0, cancelled: 0, maxWork: 0, lastAt: null, maxGap: 0 };
        counters.push(owner); owners.set(callback, owner);
      }
      owner.requested++;
      const requestedAt = performance.now();
      let handle;
      handle = nativeRequest((at) => {
        pending.delete(handle); owner.delivered++;
        if (owner.lastAt !== null) owner.maxGap = Math.max(owner.maxGap, at - owner.lastAt);
        owner.lastAt = at;
        const start = performance.now();
        try { callback(at); }
        finally { owner.maxWork = Math.max(owner.maxWork, performance.now() - start); }
      });
      pending.set(handle, { owner: owner.id, at: requestedAt });
      return handle;
    };
    window.cancelAnimationFrame = (handle) => {
      const request = pending.get(handle);
      if (request) { counters[request.owner].cancelled++; pending.delete(handle); }
      nativeCancel(handle);
    };
    let latestRail = null;
    window.__cdvRailTrace = (phase, data) => {
      if (phase === "frame") latestRail = data;
      else send(`rail-${phase}`, data);
    };
    for (const name of ["focus", "blur", "pageshow", "pagehide", "freeze", "resume"]) {
      window.addEventListener(name, () => send(`lifecycle-${name}`, { visible: document.visibilityState, focused: document.hasFocus() }), true);
    }
    document.addEventListener("visibilitychange", () => send("lifecycle-visibility", { visible: document.visibilityState, focused: document.hasFocus() }));
    let previousTimer = performance.now(), timerMax = 0, timerTicks = 0;
    setInterval(() => { const at = performance.now(); timerMax = Math.max(timerMax, at - previousTimer); previousTimer = at; timerTicks++; }, 50);
    setInterval(() => {
      const at = performance.now();
      send("raf-ownership", {
        visible: document.visibilityState, focused: document.hasFocus(), rail: latestRail, timerTicks, timerMax,
        owners: counters.map((owner) => ({ ...owner })),
        pending: [...pending].map(([handle, value]) => ({ handle, owner: value.owner, age: at - value.at })),
        canvas: document.querySelector('[data-disc-frameloop]')?.dataset.discFrameloop,
        root: { ...document.querySelector('[data-rail-ready]')?.dataset },
      });
      timerTicks = 0; timerMax = 0;
      for (const owner of counters) { owner.maxWork = 0; owner.maxGap = 0; }
    }, 1000);
  });
  let session;
  let traceStarted;
  if (process.env.QA_NAV_TIMELINE === "1" && (testInfo.title.startsWith("arrastre y cancelación") || (process.env.QA_NAV_CASE === "resize" && testInfo.title.includes("resizing and reloading")))) {
    session = await page.context().newCDPSession(page);
    const startTrace = () => session.send("Tracing.start", {
      categories: "devtools.timeline,blink,cc,viz,renderer.scheduler,toplevel,disabled-by-default-devtools.timeline.frame,disabled-by-default-devtools.timeline.stack" + (process.env.QA_NAV_DEEP_GPU === "1" ? ",gpu,gpu.service,disabled-by-default-gpu.service,disabled-by-default-viz.debug" : ""),
      transferMode: "ReturnAsStream",
    });
    if (["deck", "motion"].includes(process.env.QA_NAV_WINDOW)) {
      const label = process.env.QA_NAV_WINDOW === "motion" && !testInfo.title.startsWith("arrastre y cancelación") ? "Ir al capítulo Colección" : "Ir al capítulo Deck";
      await page.exposeBinding("__qaStartNavTrace", () => traceStarted ??= startTrace());
      await page.addInitScript(({label}) => document.addEventListener("click", (event) => {
        if (event.target.closest?.("button")?.getAttribute("aria-label") === label) void window.__qaStartNavTrace();
      }, true), {label});
    } else {
      traceStarted = startTrace();
      await traceStarted;
    }
  }
  return async () => {
    if (!session || !traceStarted) return;
    await traceStarted;
    const completed = new Promise((resolve) => session.once("Tracing.tracingComplete", resolve));
    await session.send("Tracing.end");
    const { stream } = await completed;
    const file = testInfo.outputPath("navigation-timeline.json");
    const fd = fs.openSync(file, "w");
    try {
      while (true) {
        const chunk = await session.send("IO.read", { handle: stream });
        fs.writeSync(fd, Buffer.from(chunk.data, chunk.base64Encoded ? "base64" : "utf8"));
        if (chunk.eof) break;
      }
    } finally { fs.closeSync(fd); await session.send("IO.close", { handle: stream }); }
    await testInfo.attach("navigation-timeline", { path: file, contentType: "application/json" });
  };
}
module.exports = { installNavigationEvidence };
