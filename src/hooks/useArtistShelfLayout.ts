"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isMarqueeChapterActive } from "./useMarqueeBelt";
import { ARTIST_SHELF_INITIAL_HOLD_MS, ARTIST_SHELF_SPEED, LISTENING_SHELF_SPEED, artistShelfEntryComplete, artistShelfInitialOffset, artistShelfLayout, artistShelfOffsetFor, artistShelfPosition, rebaseArtistShelf, wrapArtistShelf, type ArtistShelfLayout } from "@/lib/artistShelfLayout";

interface Options {
  ids: string[];
  active: boolean;
  paused: boolean;
  chapterIndex?: number;
  startAt?: "center" | "leading";
  onGrabStart?: () => void;
  onGrabEnd?: () => void;
}
interface Slot { id: string; node: HTMLElement; button: HTMLButtonElement }

export function useArtistShelfLayout(options: Options) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const idsKey = JSON.stringify(options.ids);
  const layoutRef = useRef<ArtistShelfLayout | null>(null);
  const priorIds = useRef<string[]>([]);
  const slots = useRef<Slot[]>([]);
  const offset = useRef(0);
  const entry = useRef(true);
  const anchorId = useRef<string | null>(null);
  const keyboardId = useRef<string | null>(null);
  const emphasisId = useRef<string | null>(null);
  const focused = useRef(false);
  const gesture = useRef<{ id: number; startX: number; lastX: number; captured: boolean } | null>(null);
  const reduced = useRef(false);
  const target = useRef<number | null>(null);
  const initialHoldRemaining = useRef(ARTIST_SHELF_INITIAL_HOLD_MS);
  const syncRef = useRef<() => void>(() => undefined);
  const paintRef = useRef<() => void>(() => undefined);
  const [isDragging, setIsDragging] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [layout, setLayout] = useState<ArtistShelfLayout>(() => artistShelfLayout(0, 0, 0, 0));
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const pages = layout.fit ? 1 : Math.max(1, Math.min(6, options.ids.length));
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  const paint = () => {
    const current = layoutRef.current;
    const viewport = containerRef.current;
    if (!current || !viewport) return;
    let nearest = 0, nearestDistance = Infinity;
    const positions: { slot: Slot; left: number }[] = [];
    slots.current.forEach((slot, index) => {
      const left = artistShelfPosition(index, offset.current, current, entry.current);
      positions.push({ slot, left });
      slot.node.style.transform = `translate3d(${left}px,0,0)`;
      slot.node.style.setProperty("--case-shift", "0px");
      slot.node.style.visibility = left + current.slotWidth + current.overscan < 0 || left - current.overscan > current.width ? "hidden" : "visible";
      const distance = Math.abs(left + current.slotWidth / 2 - current.width / 2);
      if (distance < nearestDistance) { nearest = index; nearestDistance = distance; }
    });
    const emphasized = positions.find(({ slot }) => slot.id === emphasisId.current);
    if (emphasized) for (const direction of [-1, 1]) {
      positions.filter(({ left }) => direction < 0 ? left < emphasized.left : left > emphasized.left)
        .sort((a, b) => Math.abs(a.left - emphasized.left) - Math.abs(b.left - emphasized.left)).slice(0, 2)
        .forEach(({ slot }, index) => slot.node.style.setProperty("--case-shift", `${direction * current.visualOverflow / .23 * (index === 0 ? .15 : .07)}px`));
    }
    if (!focused.current) keyboardId.current = current.fit ? slots.current[0]?.id ?? null : slots.current[nearest]?.id ?? null;
    slots.current.forEach((slot) => { slot.button.tabIndex = slot.id === keyboardId.current ? 0 : -1; });
    const displacement = offset.current - artistShelfInitialOffset(current);
    const travelled = entry.current ? Math.max(0, displacement) : wrapArtistShelf(displacement, current.length);
    const nextPage = current.fit ? 0 : Math.min(pagesRef.current - 1, Math.floor(travelled / current.length * pagesRef.current));
    if (nextPage !== pageRef.current) { pageRef.current = nextPage; setPage(nextPage); }
    const root = viewport.closest<HTMLElement>("[data-artist-shelf]");
    if (root) {
      root.dataset.artistCycleOffset = offset.current.toFixed(4);
      root.dataset.artistCycleLength = String(current.length);
      root.dataset.artistSequence = entry.current && !current.fit ? "entry" : "cycle";
    }
  };
  paintRef.current = paint;

  useLayoutEffect(() => {
    const viewport = containerRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const measure = () => {
      const nodes = [...track.querySelectorAll<HTMLElement>("[data-artist-slot]")];
      const first = nodes[0]?.querySelector<HTMLButtonElement>("button[data-batea-album-id]");
      if (!first || viewport.clientWidth <= 0) return;
      const width = parseFloat(getComputedStyle(first).width) || first.offsetWidth;
      const size = parseFloat(getComputedStyle(first).height) || first.offsetHeight;
      if (!(width > 0 && size > 0)) return;
      const ids = optionsRef.current.ids;
      const buttonLeft = first.getBoundingClientRect().left;
      const faces = [...(first.firstElementChild?.children ?? [])];
      const visualLeft = faces.length ? Math.min(...faces.map((face) => face.getBoundingClientRect().left)) - buttonLeft : 0;
      const startAt = optionsRef.current.startAt;
      const speed = startAt === "leading" ? LISTENING_SHELF_SPEED : ARTIST_SHELF_SPEED;
      const next = artistShelfLayout(ids.length, viewport.clientWidth, width, size, speed, visualLeft, startAt);
      if (!layoutRef.current) {
        anchorId.current = ids[0] ?? null;
        // A short catalog never needs an introductory animation. Later page
        // arrivals keep its existing anchor instead of restarting the shelf.
        if (next.fit) { initialHoldRemaining.current = 0; entry.current = false; }
      }
      offset.current = rebaseArtistShelf(priorIds.current, ids, offset.current, layoutRef.current, next, anchorId.current, entry.current);
      priorIds.current = [...ids];
      layoutRef.current = next;
      slots.current = nodes.flatMap((node) => {
        const button = node.querySelector<HTMLButtonElement>("button[data-batea-album-id]");
        return button ? [{ id: button.dataset.bateaAlbumId!, node, button }] : [];
      });
      if (!ids.includes(keyboardId.current ?? "")) keyboardId.current = ids[0] ?? null;
      target.current = null;
      setLayout((before) => JSON.stringify(before) === JSON.stringify(next) ? before : next);
      paintRef.current();
      syncRef.current();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    if (track.firstElementChild) observer.observe(track.firstElementChild);
    return () => observer.disconnect();
  }, [idsKey]);

  useEffect(() => {
    const viewport = containerRef.current;
    if (!viewport || !optionsRef.current.ids.length) return;
    const root = viewport.closest<HTMLElement>("[data-artist-shelf]");
    const railRoot = document.querySelector<HTMLElement>("[data-rail-wrapper]")?.parentElement;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = media.matches;
    setReducedMotion(media.matches);
    let frame: number | null = null;
    let priorTime = performance.now();
    let disposed = false;
    let suppressClick = false;
    let suppressTimer = 0;
    const active = () => optionsRef.current.active && isMarqueeChapterActive(railRoot?.dataset, optionsRef.current.chapterIndex ?? 3) && !document.hidden;
    const autoEligible = () => active() && !layoutRef.current?.fit && !optionsRef.current.paused && !focused.current && !gesture.current && !reduced.current;
    const stopFrame = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; };
    const endGesture = (cancelled = false) => {
      const current = gesture.current;
      if (!current) return;
      gesture.current = null;
      setIsDragging(false);
      if (current.captured) {
        optionsRef.current.onGrabEnd?.();
        suppressClick = true;
        window.clearTimeout(suppressTimer);
        suppressTimer = window.setTimeout(() => { suppressClick = false; }, cancelled ? 500 : 0);
        if (viewport.hasPointerCapture(current.id)) viewport.releasePointerCapture(current.id);
      }
    };
    const tick = (now: number) => {
      frame = null;
      if (disposed || !active()) return;
      const elapsed = Math.max(0, now - priorTime);
      const dt = Math.min(48, elapsed) / 1000;
      priorTime = now;
      const current = layoutRef.current;
      if (!current || current.fit) return;
      if (target.current !== null) {
        let delta = (target.current - offset.current) % current.length;
        if (delta > current.length / 2) delta -= current.length;
        if (delta < -current.length / 2) delta += current.length;
        if (Math.abs(delta) < .4) { offset.current = wrapArtistShelf(target.current, current.length); target.current = null; }
        else offset.current = wrapArtistShelf(offset.current + delta * Math.min(1, dt * 7), current.length);
      } else if (autoEligible()) {
        if (initialHoldRemaining.current > 0) initialHoldRemaining.current = Math.max(0, initialHoldRemaining.current - elapsed);
        else {
          offset.current += current.speed * dt;
          if (entry.current && artistShelfEntryComplete(offset.current, current)) entry.current = false;
          if (!entry.current) offset.current = wrapArtistShelf(offset.current, current.length);
        }
      }
      paintRef.current();
      sync();
    };
    const sync = () => {
      if (disposed) return;
      const canUse = active();
      if (!canUse) endGesture(true);
      const eligible = autoEligible();
      const holding = initialHoldRemaining.current > 0 && !layoutRef.current?.fit;
      const drifting = eligible && !holding;
      if (root) {
        root.dataset.beltAnimationEnabled = canUse ? "true" : "false";
        root.dataset.artistDrifting = drifting ? "true" : "false";
        root.dataset.artistReducedMotion = reduced.current ? "true" : "false";
        root.dataset.artistInitialHold = holding ? "true" : "false";
        root.dataset.artistInitialHoldRemaining = String(Math.ceil(initialHoldRemaining.current));
      }
      if (canUse && !layoutRef.current?.fit && (eligible || target.current !== null) && !reduced.current) {
        if (frame === null) { priorTime = performance.now(); frame = requestAnimationFrame(tick); }
      } else stopFrame();
    };
    syncRef.current = sync;
    const focusEdition = (index: number) => {
      const current = layoutRef.current;
      const slot = slots.current[index];
      if (!current || !slot) return;
      target.current = null;
      entry.current = false;
      keyboardId.current = slot.id;
      anchorId.current = slot.id;
      emphasisId.current = slot.id;
      offset.current = artistShelfOffsetFor(index, current.width / 2 - current.slotWidth / 2, current);
      focused.current = true;
      paintRef.current();
      viewport.scrollLeft = 0;
      if (viewport.parentElement) viewport.parentElement.scrollLeft = 0;
      slot.button.focus({ preventScroll: true });
      sync();
    };
    const keydown = (event: KeyboardEvent) => {
      if (!active() || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const id = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-batea-album-id]")?.dataset.bateaAlbumId;
      const index = Math.max(0, slots.current.findIndex((slot) => slot.id === (id ?? keyboardId.current)));
      focusEdition(event.key === "Home" ? 0 : event.key === "End" ? slots.current.length - 1 : Math.max(0, Math.min(slots.current.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1))));
    };
    const focusin = (event: FocusEvent) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-batea-album-id]");
      if (!button) return;
      focused.current = true;
      keyboardId.current = button.dataset.bateaAlbumId ?? null;
      anchorId.current = keyboardId.current;
      emphasisId.current = keyboardId.current;
      paintRef.current();
      sync();
    };
    const focusout = (event: FocusEvent) => {
      if (viewport.contains(event.relatedTarget as Node | null)) return;
      focused.current = false;
      emphasisId.current = null;
      paintRef.current();
      sync();
    };
    const down = (event: PointerEvent) => {
      if (!active() || layoutRef.current?.fit || event.button !== 0 || gesture.current) return;
      window.clearTimeout(suppressTimer); suppressClick = false;
      gesture.current = { id: event.pointerId, startX: event.clientX, lastX: event.clientX, captured: false };
      target.current = null;
      sync();
    };
    const move = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      if (!current.captured && Math.abs(event.clientX - current.startX) > 6) {
        current.captured = true;
        setIsDragging(true);
        optionsRef.current.onGrabStart?.();
        viewport.setPointerCapture(current.id);
      }
      if (!current.captured) return;
      const model = layoutRef.current;
      if (model) {
        offset.current -= event.clientX - current.lastX;
        if (entry.current && artistShelfEntryComplete(offset.current, model)) entry.current = false;
        if (!entry.current) offset.current = wrapArtistShelf(offset.current, model.length);
      }
      current.lastX = event.clientX;
      paintRef.current();
    };
    const up = (event: PointerEvent) => { if (gesture.current?.id === event.pointerId) { endGesture(); sync(); } };
    const cancel = (event: PointerEvent) => { if (gesture.current?.id === event.pointerId) { endGesture(true); sync(); } };
    const click = (event: MouseEvent) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    };
    const visibility = () => sync();
    const motion = () => { reduced.current = media.matches; setReducedMotion(media.matches); target.current = null; sync(); };
    viewport.addEventListener("keydown", keydown);
    viewport.addEventListener("focusin", focusin);
    viewport.addEventListener("focusout", focusout);
    viewport.addEventListener("pointerdown", down);
    viewport.addEventListener("lostpointercapture", cancel);
    viewport.addEventListener("click", click, true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", motion);
    const observer = railRoot ? new MutationObserver(sync) : null;
    observer?.observe(railRoot!, { attributes: true, attributeFilter: ["data-chapter", "data-rail-moving", "data-album-detail-open"] });
    paintRef.current(); sync();
    return () => {
      disposed = true; stopFrame(); endGesture(true); window.clearTimeout(suppressTimer);
      syncRef.current = () => undefined;
      viewport.removeEventListener("keydown", keydown); viewport.removeEventListener("focusin", focusin); viewport.removeEventListener("focusout", focusout);
      viewport.removeEventListener("pointerdown", down); viewport.removeEventListener("lostpointercapture", cancel); viewport.removeEventListener("click", click, true);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel);
      document.removeEventListener("visibilitychange", visibility); media.removeEventListener("change", motion); observer?.disconnect();
    };
  }, [idsKey]);

  useEffect(() => { syncRef.current(); }, [options.active, options.paused, options.chapterIndex]);

  const goTo = (next: number) => {
    const current = layoutRef.current;
    if (!current || current.fit) return;
    const index = Math.max(0, Math.min(pagesRef.current - 1, next));
    entry.current = false;
    offset.current = wrapArtistShelf(offset.current, current.length);
    target.current = wrapArtistShelf(artistShelfInitialOffset(current) + current.length / pagesRef.current * index, current.length);
    if (reduced.current) { offset.current = target.current; target.current = null; paintRef.current(); }
    syncRef.current();
  };
  return {
    containerRef, trackRef, isDragging, reducedMotion, layout, page, pages, goTo,
    stepPage: (direction: -1 | 1) => goTo(pageRef.current + direction),
    remember: (id: string) => { anchorId.current = id; },
    emphasize: (id: string | null) => { emphasisId.current = id; paintRef.current(); },
  };
}
