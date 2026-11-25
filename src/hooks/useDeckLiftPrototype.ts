"use client";
import { useCallback, useContext, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { RailContext } from "@/components/scroll/RailContext";
import { interpolateDiscQuad, quadToCssMatrix, readDiscQuad, translateDiscQuad, type DiscQuad } from "@/lib/discFlightGeometry";
import { airAboveDock, createDeckLiftTimeline, draggedDiscOrientation, foregroundDiscQuad, retreatedDeckTransform, returnedDiscOrientation, sampleLiftedDisc, splitDeckLiftLayout, type DeckLiftPhase, type DeckLiftSample, type DeckLiftSlot, type DiscOrientation } from "@/lib/deckLiftPrototype";

type ElementRef = RefObject<HTMLDivElement | null>;
interface LiftRefs { viewport: ElementRef; placement: ElementRef; scene: ElementRef; target: ElementRef; home: ElementRef; anchor: ElementRef; host: ElementRef; button: RefObject<HTMLButtonElement | null> }
interface LiftOptions { enabled: boolean; active: boolean; busy: boolean; hasDisc: boolean; identity: string; onPhase?: (phase: DeckLiftPhase) => void; externalGesture?: boolean; presentationReady?: boolean; onPresentation?: (sample: DeckLiftSample) => void; onRestore?: () => void }
const ZERO: DiscOrientation = { x: 0, y: 0 };
const corners = ["tl", "tr", "bl", "br"] as const;
type Retreat = ReturnType<typeof retreatedDeckTransform>;
interface LiftGeometry { frame: DOMRect; splitSlot: DeckLiftSlot; deck: Retreat; split: Retreat }

export function useDeckLiftPrototype(refs: LiftRefs, options: LiftOptions) {
  const { viewport, placement, scene, target, home, anchor, host, button } = refs;
  const rail = useContext(RailContext);
  const railRef = useRef(rail); railRef.current = rail;
  const optionsRef = useRef(options); optionsRef.current = options;
  const timeline = useRef(createDeckLiftTimeline());
  const runtime = useRef<{ lift(): void; recouple(): void; cancel(focus?: boolean, reason?: string): void; beginVisualGesture(): boolean; endVisualGesture(): void; visualReturning(value: boolean): void } | null>(null);
  const [phase, setPhase] = useState<DeckLiftPhase>("docked");
  const [dragging, setDragging] = useState(false);
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousIdentity = useRef(options.identity);

  useLayoutEffect(() => {
    const frame = viewport.current, body = placement.current, design = scene.current, disc = target.current;
    const dockHome = home.current, dockAnchor = anchor.current, overlay = host.current;
    if (!frame || !body || !design || !disc || !dockHome || !dockAnchor || !overlay) return;
    const clock = timeline.current;
    let raf: number | null = null, returnRaf: number | null = null, focusRaf: number | null = null, geometryRaf: number | null = null;
    let mounted = true, portal = false;
    const railRoot = frame.closest("[data-rail-overlay]")?.parentElement?.querySelector<HTMLElement>("[data-rail-ready]")
      ?? document.querySelector<HTMLElement>("[data-rail-ready]");
    const railWrapper = railRoot?.querySelector<HTMLElement>("[data-rail-wrapper]");
    const deckChapter = railWrapper?.firstElementChild?.children[0] as HTMLElement | undefined;
    const splitChapter = railWrapper?.firstElementChild?.children[1] as HTMLElement | undefined;
    let sourceQuad: DiscQuad | null = null;
    let orientation: DiscOrientation = ZERO;
    let currentQuad: DiscQuad | null = null;
    let savedStyle = "", savedLid = "0";
    let savedAttributes: Array<[string, string | null]> = [];
    let geometry: LiftGeometry | null = null;
    let lastFreeProgress = NaN, portalWidth = 0, portalHeight = 0;
    let drag: { pointer: number | null; x: number; y: number; initial: DiscOrientation; resume(): void } | null = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const allowed = () => optionsRef.current.enabled && optionsRef.current.active && !optionsRef.current.busy && optionsRef.current.hasDisc && optionsRef.current.presentationReady !== false;
    const splitProgress = () => {
      const progress = Number.parseFloat(railRoot?.style.getPropertyValue("--pSplit") ?? "");
      if (Number.isFinite(progress)) return Math.max(0, Math.min(1, progress));
      if (!railWrapper || !deckChapter || !splitChapter) return 0;
      const distance = Math.max(1, splitChapter.offsetLeft - deckChapter.offsetLeft);
      return Math.max(0, Math.min(1, (railWrapper.scrollLeft - deckChapter.offsetLeft) / distance));
    };
    const phaseNow = (next: DeckLiftPhase) => {
      frame.dataset.discState = next;
      if (mounted) setPhase(next);
      optionsRef.current.onPhase?.(next);
      disc.tabIndex = next === "free" ? 0 : -1;
    };
    const setDrag = (active: boolean) => { disc.dataset.discDragging = String(active); if (mounted) setDragging(active); };
    const setReturn = (active: boolean) => { disc.dataset.discReturning = String(active); if (mounted) setReturning(active); };
    const cancelReturn = () => { if (returnRaf !== null) cancelAnimationFrame(returnRaf); returnRaf = null; setReturn(false); };
    const paint = (quad: DiscQuad) => {
      currentQuad = quad;
      const bounds = geometry?.frame ?? frame.getBoundingClientRect();
      const local = translateDiscQuad(quad, -bounds.left, -bounds.top);
      const width = portalWidth || disc.clientWidth, height = portalHeight || disc.clientHeight;
      const matrix = quadToCssMatrix(local, width, height);
      if (!matrix) return;
      const x = width / 2, y = height / 2;
      disc.style.transform = `${matrix} translate(${x}px,${y}px) perspective(1400px) rotateX(${orientation.x}deg) rotateY(${orientation.y}deg) translate(${-x}px,${-y}px)`;
      disc.dataset.discOrientation = `${orientation.x.toFixed(2)},${orientation.y.toFixed(2)}`;
    };
    const dockQuad = (): DiscQuad | null => {
      const quad = {} as DiscQuad;
      for (const corner of corners) {
        const marker = dockAnchor.querySelector<HTMLElement>(`[data-prototype-dock-corner="${corner}"]`);
        if (!marker) return null;
        const rect = marker.getBoundingClientRect(); quad[corner] = { x: rect.left, y: rect.top };
      }
      return quad;
    };
    const setRetreat = (amount: number, progress: number) => {
      const deck = geometry?.deck ?? { x: 0, y: 0, scale: 1 };
      const split = geometry?.split ?? deck;
      const mix = (from: number, to: number) => from + (to - from) * progress;
      design.style.setProperty("--prototype-scene-x", `${mix(deck.x, split.x) * amount}px`);
      design.style.setProperty("--prototype-scene-y", `${mix(deck.y, split.y) * amount}px`);
      design.style.setProperty("--prototype-scene-scale", String(1 + (mix(deck.scale, split.scale) - 1) * amount));
    };

    const measureSplitSlot = (bounds: DOMRect): DeckLiftSlot => {
      const layer = frame.closest<HTMLElement>("[data-rail-overlay]");
      const booklet = layer?.querySelector<HTMLElement>("[data-rail-booklet]");
      let bookletLeft = bounds.left + bounds.width * .54;
      if (booklet) {
        const previous = booklet.style.getPropertyValue("--pSplit"), priority = booklet.style.getPropertyPriority("--pSplit");
        try {
          booklet.style.setProperty("--pSplit", "1");
          const parts = [...booklet.querySelectorAll<HTMLElement>('[data-testid="lyrics-booklet"], [data-testid="lyrics-paper"], [data-booklet-page-half], [aria-label="Booklet de letras"]')]
            .map(node => node.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
          if (parts.length) bookletLeft = Math.min(...parts.map(rect => rect.left));
        } finally {
          if (previous) booklet.style.setProperty("--pSplit", previous, priority);
          else booklet.style.removeProperty("--pSplit");
        }
      }
      const trigger = layer?.parentElement?.querySelector<HTMLElement>("[data-track-listing-placement] button");
      const listingHeight = trigger?.getBoundingClientRect().height ?? 36;
      const left = bounds.left + Math.min(40, Math.max(24, bounds.width * .022));
      const top = bounds.top + Math.min(26, Math.max(14, window.innerHeight * .024)) + listingHeight + 12;
      return { left, right: Math.max(left + 1, bookletLeft - 24), top, bottom: Math.max(top + 1, bounds.bottom - 14) };
    };

    // Measure the two settled cameras only when geometry changes. Rail progress
    // subsequently interpolates the cached transforms without probing the DOM.
    const measureGeometry = () => {
      const bounds = frame.getBoundingClientRect();
      if (!(bounds.width > 0 && bounds.height > 0)) return false;
      const splitLayout = splitDeckLiftLayout(bounds, measureSplitSlot(bounds));
      const splitSlot = splitLayout.slot;
      const overrides = [
        [body.style, "--pSplit"], [body.style, "--deck-lid-offset"],
        [design.style, "--prototype-scene-x"], [design.style, "--prototype-scene-y"], [design.style, "--prototype-scene-scale"],
      ] as const;
      const prior = overrides.map(([style, name]) => [style.getPropertyValue(name), style.getPropertyPriority(name)] as const);
      try {
        body.style.setProperty("--deck-lid-offset", "135");
        design.style.setProperty("--prototype-scene-x", "0px"); design.style.setProperty("--prototype-scene-y", "0px"); design.style.setProperty("--prototype-scene-scale", "1");
        const density = Number(frame.dataset.deckRenderDensity) || 2;
        const measure = (progress: 0 | 1): Retreat | null => {
          body.style.setProperty("--pSplit", String(progress));
          const designBounds = design.getBoundingClientRect();
          const surfaces = [...design.querySelectorAll<HTMLElement>("[data-deck-surface]")].map(node => node.getBoundingClientRect());
          if (!surfaces.length || !designBounds.width) return null;
          const left = Math.min(...surfaces.map(rect => rect.left)), right = Math.max(...surfaces.map(rect => rect.right));
          const top = Math.min(...surfaces.map(rect => rect.top)), bottom = Math.max(...surfaces.map(rect => rect.bottom));
          if (progress === 0) return retreatedDeckTransform(bounds, designBounds, { left, right, top, bottom }, density);
          const transform = getComputedStyle(body).transform;
          const matrix = transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform);
          const basis = { origin: { x: bounds.left + matrix.m41, y: bounds.top + matrix.m42 }, xx: matrix.m11, xy: matrix.m12, yx: matrix.m21, yy: matrix.m22 };
          return retreatedDeckTransform(bounds, designBounds, { left, right, top, bottom }, density, { progress, slot: splitSlot, basis });
        };
        const deck = measure(0), split = measure(1);
        if (!deck || !split) return false;
        const previous = geometry?.frame;
        if (sourceQuad && previous && (previous.left !== bounds.left || previous.top !== bounds.top || previous.width !== bounds.width || previous.height !== bounds.height)) {
          const source = sourceQuad;
          sourceQuad = Object.fromEntries(corners.map(corner => [corner, {
            x: bounds.left + (source[corner].x - previous.left) * bounds.width / previous.width,
            y: bounds.top + (source[corner].y - previous.top) * bounds.height / previous.height,
          }])) as unknown as DiscQuad;
        }
        geometry = { frame: bounds, splitSlot, deck, split };
        frame.dataset.splitLiftSlot = JSON.stringify(splitSlot);
        frame.style.setProperty("--split-lift-right", `${splitLayout.dockInsetRight}px`);
        frame.style.setProperty("--split-lift-bottom", `${splitLayout.dockInsetBottom}px`);
        lastFreeProgress = NaN;
        return true;
      } finally {
        overrides.forEach(([style, name], index) => {
          const [value, priority] = prior[index];
          if (value) style.setProperty(name, value, priority); else style.removeProperty(name);
        });
      }
    };
    const foreground = (progress: number) => foregroundDiscQuad(geometry?.frame ?? frame.getBoundingClientRect(), geometry ? { progress, slot: geometry.splitSlot } : undefined);
    const updateFree = () => {
      const progress = splitProgress();
      if (!portal || clock.phase !== "free" || progress === lastFreeProgress) return;
      lastFreeProgress = progress;
      setRetreat(1, progress);
      paint(foreground(progress));
    };
    const detach = (quad: DiscQuad) => {
      if (portal) return;
      savedStyle = disc.style.cssText;
      savedAttributes = ["role", "aria-hidden", "aria-label", "tabindex", "title", "data-prototype-disc"].map(name => [name, disc.getAttribute(name)]);
      const width = disc.clientWidth, height = disc.clientHeight;
      portalWidth = width; portalHeight = height;
      overlay.append(disc); portal = true;
      Object.assign(disc.style, { position: "absolute", left: "0px", top: "0px", width: `${width}px`, height: `${height}px`, margin: "0px", transformOrigin: "0 0", pointerEvents: "none" });
      disc.setAttribute("role", "group"); disc.setAttribute("aria-hidden", "false"); disc.setAttribute("aria-label", "CD elevado");
      disc.setAttribute("title", "Arrastrá para orientar el CD. Al soltar vuelve suavemente. Flechas para orientar; Escape para acoplar.");
      disc.dataset.prototypeDisc = "true"; setDrag(false); setReturn(false); paint(quad);
    };
    const releaseDrag = () => {
      const current = drag; if (!current) return;
      drag = null; setDrag(false);
      try { if (current.pointer !== null && disc.hasPointerCapture(current.pointer)) disc.releasePointerCapture(current.pointer); }
      finally { current.resume(); }
    };
    const restoreHome = () => {
      optionsRef.current.onRestore?.();
      releaseDrag(); cancelReturn(); orientation = ZERO;
      if (portal) {
        dockHome.append(disc); portal = false; disc.style.cssText = savedStyle;
        for (const [name, value] of savedAttributes) {
          if (value === null) disc.removeAttribute(name);
          else disc.setAttribute(name, value);
        }
      }
      for (const name of ["data-disc-dragging", "data-disc-returning", "data-disc-orientation"]) disc.removeAttribute(name);
      body.style.setProperty("--deck-lid-offset", savedLid);
      for (const name of ["--prototype-scene-x", "--prototype-scene-y", "--prototype-scene-scale"]) design.style.removeProperty(name);
      frame.style.removeProperty("--split-lift-right"); frame.style.removeProperty("--split-lift-bottom");
      delete frame.dataset.splitLiftSlot;
      currentQuad = null; sourceQuad = null; geometry = null;
      lastFreeProgress = NaN; portalWidth = 0; portalHeight = 0;
    };
    const restoreFocus = () => {
      if (focusRaf !== null) cancelAnimationFrame(focusRaf);
      focusRaf = requestAnimationFrame(() => { focusRaf = null; if (mounted && allowed() && clock.phase === "docked") button.current?.focus({ preventScroll: true }); });
    };
    const cancel = (focus = false, reason = "cancelled") => {
      if (clock.phase === "docked" && !portal && raf === null && !drag && returnRaf === null) return;
      frame.dataset.discCancelReason = reason;
      if (raf !== null) cancelAnimationFrame(raf); raf = null;
      if (geometryRaf !== null) cancelAnimationFrame(geometryRaf); geometryRaf = null;
      clock.cancel(); restoreHome(); phaseNow("docked");
      if (focus) restoreFocus();
    };
    const runFrame = (now: number, token: number, direction: "out" | "in") => {
      raf = null;
      if (!mounted || !allowed()) { cancel(false, "unavailable"); return; }
      const sample = clock.sample(now, token); if (!sample) return;
      body.style.setProperty("--deck-lid-offset", String(sample.lid));
      if (direction === "out" && sample.phase !== "opening" && !portal) {
        const source = readDiscQuad(disc);
        if (!source) { setError("No se pudo medir el CD del equipo."); cancel(true); return; }
        sourceQuad = source; detach(source);
      }
      const progress = splitProgress();
      setRetreat(sample.retreat, progress);
      const bounds = geometry?.frame ?? frame.getBoundingClientRect();
      if (direction === "out" && portal && sourceQuad) paint(sampleLiftedDisc(sourceQuad, foreground(progress), sample.progress, bounds.height));
      if (direction === "in" && portal && sourceQuad) {
        const dock = dockQuad();
        if (!dock) { cancel(true); return; }
        const air = airAboveDock(dock, bounds.height);
        if (sample.phase === "aligning") paint(interpolateDiscQuad(sourceQuad, air, sample.progress));
        else if (sample.phase === "lowering") paint(interpolateDiscQuad(air, dock, sample.progress));
        else paint(dock);
      }
      optionsRef.current.onPresentation?.(sample);
      if (frame.dataset.discState !== sample.phase) phaseNow(sample.phase);
      if (sample.phase === "free") { lastFreeProgress = progress; disc.style.pointerEvents = "auto"; disc.tabIndex = 0; disc.focus({ preventScroll: true }); return; }
      if (sample.phase === "docked") { restoreHome(); phaseNow("docked"); restoreFocus(); return; }
      raf = requestAnimationFrame(time => runFrame(time, token, direction));
    };
    const start = (direction: "out" | "in") => {
      const token = clock.start(direction, performance.now(), reduced.matches, allowed()); if (token === null) return;
      setError(null);
      if (direction === "out") {
        savedLid = body.style.getPropertyValue("--deck-lid-offset") || "0";
        if (!measureGeometry()) { setError("No se pudo medir el equipo."); cancel(true); return; }
      }
      else {
        releaseDrag(); cancelReturn(); sourceQuad = readDiscQuad(disc); orientation = ZERO;
        if (!sourceQuad) { cancel(true); return; }
        disc.style.pointerEvents = "none";
      }
      phaseNow(direction === "out" ? "opening" : "aligning");
      runFrame(performance.now(), token, direction);
    };
    const easeOrientation = () => {
      releaseDrag(); cancelReturn();
      const from = orientation;
      if (reduced.matches || Math.abs(from.x) + Math.abs(from.y) < .01) { orientation = ZERO; if (currentQuad) paint(currentQuad); return; }
      const startedAt = performance.now(), token = clock.generation; setReturn(true);
      const tick = (now: number) => {
        returnRaf = null;
        if (!mounted || clock.generation !== token || clock.phase !== "free") return;
        const progress = Math.min(1, (now - startedAt) / 650);
        orientation = returnedDiscOrientation(from, progress);
        if (currentQuad) paint(currentQuad);
        if (progress < 1) returnRaf = requestAnimationFrame(tick); else setReturn(false);
      };
      returnRaf = requestAnimationFrame(tick);
    };
    const beginDrag = (pointer: number | null, x: number, y: number) => {
      if (!allowed() || clock.phase !== "free" || drag) return false;
      cancelReturn();
      checkNavigation();
      if (clock.phase !== "free") return false;
      const owner = railRef.current, lock = Symbol("prototype-cd-orientation");
      owner?.stop(lock);
      drag = { pointer, x, y, initial: orientation, resume: () => owner?.start(lock) }; setDrag(true); return true;
    };
    const pointerdown = (event: PointerEvent) => {
      if (optionsRef.current.externalGesture) return;
      if (event.button !== 0 || !beginDrag(event.pointerId, event.clientX, event.clientY)) return;
      event.preventDefault(); event.stopPropagation(); disc.focus();
      try { disc.setPointerCapture(event.pointerId); } catch { easeOrientation(); }
    };
    const pointermove = (event: PointerEvent) => {
      if (optionsRef.current.externalGesture) return;
      if (!drag || drag.pointer !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      const delta = draggedDiscOrientation(event.clientX - drag.x, event.clientY - drag.y);
      orientation = { x: Math.max(-50, Math.min(50, drag.initial.x + delta.x)), y: Math.max(-65, Math.min(65, drag.initial.y + delta.y)) };
      if (currentQuad) paint(currentQuad);
    };
    const pointerend = (event: PointerEvent) => { if (!optionsRef.current.externalGesture && drag?.pointer === event.pointerId) { event.stopPropagation(); easeOrientation(); } };
    const keydown = (event: KeyboardEvent) => {
      if (optionsRef.current.externalGesture) return;
      if (!allowed() || clock.phase !== "free" || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === "Home") { easeOrientation(); return; }
      if (!drag && !beginDrag(null, 0, 0)) return;
      orientation = { x: Math.max(-50, Math.min(50, orientation.x + (event.key === "ArrowUp" ? 15 : event.key === "ArrowDown" ? -15 : 0))),
        y: Math.max(-65, Math.min(65, orientation.y + (event.key === "ArrowRight" ? 15 : event.key === "ArrowLeft" ? -15 : 0))) };
      if (currentQuad) paint(currentQuad);
    };
    const keyup = (event: KeyboardEvent) => { if (!optionsRef.current.externalGesture && drag?.pointer === null && event.key.startsWith("Arrow")) { event.preventDefault(); event.stopPropagation(); easeOrientation(); } };
    const wheel = (event: WheelEvent) => { if (clock.phase === "free") { event.preventDefault(); event.stopPropagation(); } };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || clock.phase === "docked") return;
      if (event.target instanceof Element && event.target.closest('[data-track-listing-open="true"]')) return;
      event.preventDefault(); event.stopImmediatePropagation(); cancel(true, "escape");
    };
    const started = () => { if (clock.phase !== "docked") cancel(false, "handoff"); };
    const blur = () => { if (drag) { if (optionsRef.current.externalGesture) releaseDrag(); else easeOrientation(); } };
    const hidden = () => { if (document.visibilityState === "hidden" && clock.phase !== "docked") cancel(false, "hidden"); };
    const motion = () => { if (reduced.matches && clock.phase !== "docked") cancel(true); };
    const scheduleGeometry = () => {
      if (clock.phase === "docked" || geometryRaf !== null) return;
      geometryRaf = requestAnimationFrame(() => {
        geometryRaf = null;
        if (!mounted || clock.phase === "docked") return;
        if (measureGeometry()) updateFree();
      });
    };
    const resize = () => {
      if (clock.phase === "docked") return;
      if (drag && !optionsRef.current.externalGesture) easeOrientation();
      scheduleGeometry();
    };
    disc.addEventListener("pointerdown", pointerdown); disc.addEventListener("pointermove", pointermove);
    disc.addEventListener("pointerup", pointerend); disc.addEventListener("pointercancel", pointerend); disc.addEventListener("lostpointercapture", pointerend);
    disc.addEventListener("keydown", keydown); disc.addEventListener("keyup", keyup); disc.addEventListener("wheel", wheel, { passive: false }); disc.addEventListener("blur", blur);
    window.addEventListener("keydown", escape, true); window.addEventListener("cdvicious:disc-flight-started", started); window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hidden); reduced.addEventListener("change", motion);
    const observer = new ResizeObserver(resize); observer.observe(frame);
    const layoutObserver = new MutationObserver(scheduleGeometry);
    layoutObserver.observe(frame, { attributes: true, attributeFilter: ["data-layout-measurements"] });
    const checkNavigation = () => {
      if (clock.phase === "docked") return;
      const chapter = railRoot?.dataset.chapter;
      if (chapter !== undefined && chapter !== "0" && chapter !== "1") {
        if (railWrapper && deckChapter) frame.dataset.discNavigationOffset = String(railWrapper.scrollLeft - deckChapter.offsetLeft);
        cancel(false, "rail-position");
        return;
      }
      updateFree();
    };
    // The Deck and Split share the free disc. Follow the rail's fractional
    // progress even when Lenis marks its own lock/reset as movement.
    const navigating = new MutationObserver(checkNavigation);
    if (railRoot) navigating.observe(railRoot, { attributes: true, attributeFilter: ["style", "data-rail-moving", "data-chapter"] });
    railWrapper?.addEventListener("scroll", checkNavigation, { passive: true });
    runtime.current = { lift: () => start("out"), recouple: () => start("in"), cancel,
      beginVisualGesture: () => beginDrag(null, 0, 0), endVisualGesture: releaseDrag,
      visualReturning: value => { if (clock.phase === "free") setReturn(value); } };
    frame.dataset.discState = "docked";
    return () => {
      mounted = false; cancel(false, "unmount");
      if (focusRaf !== null) cancelAnimationFrame(focusRaf);
      if (geometryRaf !== null) cancelAnimationFrame(geometryRaf);
      observer.disconnect(); layoutObserver.disconnect(); navigating.disconnect(); runtime.current = null;
      railWrapper?.removeEventListener("scroll", checkNavigation);
      disc.removeEventListener("pointerdown", pointerdown); disc.removeEventListener("pointermove", pointermove);
      disc.removeEventListener("pointerup", pointerend); disc.removeEventListener("pointercancel", pointerend); disc.removeEventListener("lostpointercapture", pointerend);
      disc.removeEventListener("keydown", keydown); disc.removeEventListener("keyup", keyup); disc.removeEventListener("wheel", wheel); disc.removeEventListener("blur", blur);
      window.removeEventListener("keydown", escape, true); window.removeEventListener("cdvicious:disc-flight-started", started); window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", hidden); reduced.removeEventListener("change", motion);
    };
  }, [viewport, placement, scene, target, home, anchor, host, button]);

  useLayoutEffect(() => {
    if (!options.enabled || !options.active || options.busy || !options.hasDisc || previousIdentity.current !== options.identity) runtime.current?.cancel(false, !options.enabled ? "disabled" : !options.active ? "chapter" : options.busy ? "busy" : !options.hasDisc ? "no-disc" : "album");
    previousIdentity.current = options.identity;
  }, [options.enabled, options.active, options.busy, options.hasDisc, options.identity]);
  const lift = useCallback(() => runtime.current?.lift(), []);
  const recouple = useCallback(() => runtime.current?.recouple(), []);
  const beginVisualGesture = useCallback(() => runtime.current?.beginVisualGesture() ?? false, []);
  const endVisualGesture = useCallback(() => runtime.current?.endVisualGesture(), []);
  const visualReturning = useCallback((value: boolean) => runtime.current?.visualReturning(value), []);
  return { phase, dragging, returning, error, lift, recouple, beginVisualGesture, endVisualGesture, visualReturning };
}
