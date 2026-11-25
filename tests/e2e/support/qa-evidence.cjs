const base = require("@playwright/test");
const fs = require("node:fs");

// Opt-in instrumentation. Assertions, browser flags and deadlines stay intact.
const test = base.test.extend({
  qaEvidence: [async ({ page }, use, testInfo) => {
    if (process.env.QA_EVIDENCE !== "1") return use();
    const rows = [];
    let profiler;
    if (process.env.QA_CPU_PROFILE === "1") {
      profiler = await page.context().newCDPSession(page);
      await profiler.send("Profiler.enable");
      await profiler.send("Profiler.setSamplingInterval", { interval: 1000 });
      await profiler.send("Profiler.start");
    }
    const record = (type, data) => rows.push({ type, nodeWall: Date.now(), nodeMono: Number(process.hrtime.bigint() / 1000000n), ...data });
    const navigationMethods = new Map();
    if (profiler && process.env.QA_CPU_SEGMENTS === "1") {
      let segment = 0;
      for (const method of ["goto", "reload"]) {
        const original = page[method];
        navigationMethods.set(method, original);
        page[method] = async function (...args) {
          const { profile } = await profiler.send("Profiler.stop");
          const file = `browser-${++segment}-before-${method}.cpuprofile`;
          fs.writeFileSync(testInfo.outputPath(file), JSON.stringify(profile));
          record("cpu-segment", { file, startTime: profile.startTime, endTime: profile.endTime });
          await profiler.send("Profiler.start");
          return original.apply(this, args);
        };
      }
    }
    page.on("console", (message) => record("console", { level: message.type(), text: message.text() }));
    page.on("pageerror", (error) => record("pageerror", { message: error.message }));
    page.on("request", (request) => {
      if (request.url().endsWith("/api/play")) record("play-request", { body: request.postDataJSON() });
    });
    page.on("response", (response) => {
      if (response.url().endsWith("/api/play")) record("play-response", { status: response.status() });
    });
    await page.exposeBinding("__qaEvidence", (_, row) => record("browser", row));
    const finishNavigationEvidence = process.env.QA_NAV_EVIDENCE === "1"
      ? await require("./navigation-evidence.cjs").installNavigationEvidence(page, record, testInfo)
      : async () => {};
    await page.addInitScript(() => {
      let frames = 0, lastFrame = 0, maxGap = 0;
      const emit = (kind, data = {}) => {
        void window.__qaEvidence({ kind, browserWall: Date.now(), browserPerf: performance.now(), frames, ...data });
      };
      const activeListeners = new Map();
      const add = window.addEventListener;
      const remove = window.removeEventListener;
      window.addEventListener = function (name, listener, options) {
        if (name.startsWith("cdvicious:disc-flight-")) {
          if (!activeListeners.has(name)) activeListeners.set(name, new Set());
          activeListeners.get(name).add(listener);
        }
        return add.call(this, name, listener, options);
      };
      window.removeEventListener = function (name, listener, options) {
        activeListeners.get(name)?.delete(listener);
        return remove.call(this, name, listener, options);
      };
      emit("init", { origin: performance.timeOrigin });
      for (const method of ["drawImage", "getImageData"]) {
        const original = CanvasRenderingContext2D.prototype[method];
        CanvasRenderingContext2D.prototype[method] = function (...args) {
          if (this.canvas.width !== 20 || this.canvas.height !== 20) return original.apply(this, args);
          const at = performance.now();
          emit("color-readback-start", { method });
          try { return original.apply(this, args); }
          finally { emit("color-readback-end", { method, duration: performance.now() - at }); }
        };
      }
      const frame = (at) => {
        if (lastFrame) maxGap = Math.max(maxGap, at - lastFrame);
        lastFrame = at; frames++;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      for (const name of ["started", "arrived", "done", "playback-ready", "playback-started", "cancelled"]) {
        window.addEventListener(`cdvicious:disc-flight-${name}`, (event) => emit(name, { detail: event.detail }));
      }
      for (const name of ["pageshow", "pagehide", "visibilitychange", "resize"]) {
        window.addEventListener(name, () => emit(name, { visibility: document.visibilityState, width: innerWidth, height: innerHeight }));
      }
      document.addEventListener("click", (event) => {
        const button = event.target.closest?.("button");
        if (button) emit("click", { label: button.getAttribute("aria-label") || button.textContent });
      }, true);
      let fingerprint = "";
      const inspect = (kind) => {
        const artists = [...document.querySelectorAll('[data-testid="deck-now-playing-artist"]')].map((node) => node.textContent);
        const overlay = document.querySelector("[data-rail-overlay]");
        const wrapper = document.querySelector("[data-rail-wrapper]");
        const state = {
          artists, stage: overlay?.dataset.flightStage, attempt: overlay?.dataset.playbackAttempt,
          confirmed: overlay?.dataset.confirmedAttempt, chapter: document.documentElement.dataset.chapter,
          moving: wrapper?.parentElement.dataset.railMoving,
          playing: document.querySelector('[data-testid="deck-now-playing"]')?.dataset.isPlaying,
          canvases: document.querySelectorAll("canvas").length,
          flights: document.querySelectorAll('[data-testid="rail-flying-disc"]').length,
        };
        const next = JSON.stringify(state);
        if (next !== fingerprint) { fingerprint = next; emit(kind, state); }
      };
      const observer = new MutationObserver(() => inspect("dom-commit"));
      observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ["data-flight-stage", "data-playback-attempt", "data-confirmed-attempt", "data-chapter", "data-is-playing", "data-rail-moving"] });
      setInterval(() => {
        inspect("heartbeat-state");
        emit("heartbeat", {
          maxGap,
          lefts: [...document.querySelectorAll('[data-rail-wrapper] > div > section')].map((node) => Math.round(node.getBoundingClientRect().left)),
          listeners: Object.fromEntries([...activeListeners].map(([name, listeners]) => [name, listeners.size])),
        }); maxGap = 0;
      }, 1000);
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) emit("longtask", { start: entry.startTime, duration: entry.duration });
      }).observe({ type: "longtask", buffered: true });
    });
    try { await use(); }
    finally {
      for (const [method, original] of navigationMethods) page[method] = original;
      record("test-finish", { status: testInfo.status, title: testInfo.title });
      await finishNavigationEvidence();
      fs.writeFileSync(testInfo.outputPath("wall-raf-dom-console.json"), JSON.stringify(rows, null, 2));
      await testInfo.attach("wall-raf-dom-console", { body: JSON.stringify(rows, null, 2), contentType: "application/json" });
      if (profiler) {
        const { profile } = await profiler.send("Profiler.stop");
        const profilePath = testInfo.outputPath("browser.cpuprofile");
        fs.writeFileSync(profilePath, JSON.stringify(profile));
        await testInfo.attach("cpu-profile", { path: profilePath, contentType: "application/json" });
      }
    }
  }, { auto: true }],
});
module.exports = { test, expect: base.expect };
