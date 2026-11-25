"use client";
import { useLayoutEffect, type RefObject } from "react";
import { fitDeck, fitListeningDeck, fitSplitDeck, type DeckBounds } from "@/lib/physicalDeckLayout";

/** Measure only on actual resize/content mounting, never on rail progress. */
export function usePhysicalDeckLayout(viewport: RefObject<HTMLDivElement | null>, placement: RefObject<HTMLDivElement | null>, scene: RefObject<HTMLDivElement | null>, identity: string) {
  useLayoutEffect(() => {
    const frame = viewport.current, body = placement.current, design = scene.current;
    if (!frame || !body || !design) return;
    const overlay = frame.closest<HTMLElement>("[data-rail-overlay]");
    const update = () => {
      const frameRect = frame.getBoundingClientRect(), designRect = design.getBoundingClientRect();
      if (!frameRect.width || !designRect.width) return;
      const measure = (air: boolean): DeckBounds => {
        const projected = design.getBoundingClientRect();
        const ratioX = projected.width / 1280, ratioY = projected.height / 660;
        const nodes = [...body.querySelectorAll<HTMLElement>("[data-deck-surface]")];
        if (air) { const disc = body.querySelector<HTMLElement>("[data-deck-air-disc]"); if (disc) nodes.push(disc); }
        const bounds = nodes.map(node => node.getBoundingClientRect());
        return { left: (Math.min(...bounds.map(r => r.left)) - projected.left) / ratioX,
          right: (Math.max(...bounds.map(r => r.right)) - projected.left) / ratioX,
          top: (Math.min(...bounds.map(r => r.top)) - projected.top) / ratioY,
          bottom: (Math.max(...bounds.map(r => r.bottom)) - projected.top) / ratioY };
      };
      // Probe the unrotated model and restore the active pose before paint.
      // Axis-aligned frame bounds can then be normalized back to design pixels.
      const offset = body.style.getPropertyValue("--deck-lid-offset");
      const rotation = body.style.getPropertyValue("--split-rotation");
      let closed: DeckBounds, open: DeckBounds;
      try {
        body.dataset.deckMeasuring = "true";
        body.style.setProperty("--split-rotation", "0deg");
        body.style.setProperty("--deck-lid-offset", "0"); closed = measure(false);
        body.style.setProperty("--deck-lid-offset", "135"); open = measure(true);
      } finally {
        body.style.setProperty("--deck-lid-offset", offset || "0");
        if (rotation) body.style.setProperty("--split-rotation", rotation);
        else body.style.removeProperty("--split-rotation");
        delete body.dataset.deckMeasuring;
      }
      const w = frameRect.width, h = frameRect.height;
      // Measure the final Split pose, including leaves that extend beyond the
      // spread and the full keyboard-focus region. Restore before painting;
      // the rail remains the only owner of its animation progress.
      const booklet = document.querySelector<HTMLElement>("[data-rail-booklet]");
      let bookletLeft: number | null = null;
      if (booklet) {
        const value = booklet.style.getPropertyValue("--pSplit");
        const priority = booklet.style.getPropertyPriority("--pSplit");
        try {
          booklet.style.setProperty("--pSplit", "1");
          const parts = [...booklet.querySelectorAll<HTMLElement>('[data-testid="lyrics-booklet"], [data-testid="lyrics-paper"], [data-booklet-page-half], [aria-label="Booklet de letras"]')]
            .map(node => node.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
          if (parts.length) bookletLeft = Math.min(...parts.map(rect => rect.left)) - frameRect.left;
        } finally {
          if (value) booklet.style.setProperty("--pSplit", value, priority);
          else booklet.style.removeProperty("--pSplit");
        }
      }
      // The approved Deck camera stays unchanged; Split gets its own measured
      // slot and a shared, higher centre with the unchanged-size booklet.
      const deckWidth = w * .80;
      const deckClosed = fitDeck(closed, deckWidth, h - 128, w / 2, h - 64);
      const deckCenter = h * .55;
      const deckBottom = deckCenter + (closed.bottom - closed.top) * deckClosed.scale / 2;
      const split = fitSplitDeck(closed, open, { width: w, height: h, bookletLeft });
      const fits = { "deck-closed": fitDeck(closed, deckWidth, h - 128, w / 2, deckBottom),
        "deck-open": fitDeck(open, w - 64, h - 96, w / 2, h - 64),
        "split-closed": split.closed,
        "split-open": split.open };
      for (const [name, fit] of Object.entries(fits)) {
        body.style.setProperty(`--${name}-x`, `${fit.x}px`); body.style.setProperty(`--${name}-y`, `${fit.y}px`); body.style.setProperty(`--${name}-s`, String(fit.scale));
      }
      body.style.setProperty("--split-closed-sy", String(split.closed.scaleY));
      body.style.setProperty("--split-open-sy", String(split.open.scaleY));
      body.style.setProperty("--split-rotation", `${split.rotation}deg`);
      if (overlay) {
        const listening = fitListeningDeck(closed, w, h);
        body.style.setProperty("--listen-x", `${listening.x}px`);
        body.style.setProperty("--listen-y", `${listening.y}px`);
        body.style.setProperty("--listen-scale", String(listening.scale));
        overlay.style.setProperty("--listen-width", `${listening.shelfWidth}px`);
        overlay.style.setProperty("--listen-top", `${listening.shelfTop}px`);
        overlay.style.setProperty("--listen-case-size", `${listening.caseSize}px`);
      }
      frame.dataset.closedBounds = JSON.stringify(closed); frame.dataset.openBounds = JSON.stringify(open);
      frame.dataset.splitSlot = JSON.stringify(split.slot);
      frame.dataset.layoutMeasurements = String(Number(frame.dataset.layoutMeasurements ?? 0) + 1);
    };
    update();
    const observer = new ResizeObserver(update); observer.observe(frame);
    const paper = document.querySelector<HTMLElement>('[data-testid="lyrics-paper"]');
    let mounting: MutationObserver | null = null;
    if (paper) observer.observe(paper);
    else {
      mounting = new MutationObserver(() => {
        const mounted = document.querySelector<HTMLElement>('[data-testid="lyrics-paper"]');
        if (!mounted) return;
        mounting?.disconnect(); observer.observe(mounted); update();
      });
      mounting.observe(overlay ?? frame, { childList: true, subtree: true });
    }
    return () => { mounting?.disconnect(); observer.disconnect(); };
  }, [viewport, placement, scene, identity]);
}
