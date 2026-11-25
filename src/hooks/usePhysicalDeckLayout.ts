"use client";
import { useLayoutEffect, type RefObject } from "react";
import { fitDeck, type DeckBounds } from "@/lib/physicalDeckLayout";

/** Measure only on actual resize/content mounting, never on rail progress. */
export function usePhysicalDeckLayout(viewport: RefObject<HTMLDivElement | null>, placement: RefObject<HTMLDivElement | null>, scene: RefObject<HTMLDivElement | null>, identity: string) {
  useLayoutEffect(() => {
    const frame = viewport.current, body = placement.current, design = scene.current;
    if (!frame || !body || !design) return;
    const update = () => {
      const frameRect = frame.getBoundingClientRect(), designRect = design.getBoundingClientRect();
      if (!frameRect.width || !designRect.width) return;
      const measure = (air: boolean): DeckBounds => {
        const projected = design.getBoundingClientRect();
        const ratio = projected.width / 1280;
        const nodes = [...body.querySelectorAll<HTMLElement>("[data-deck-surface]")];
        if (air) { const disc = body.querySelector<HTMLElement>("[data-deck-air-disc]"); if (disc) nodes.push(disc); }
        const bounds = nodes.map(node => node.getBoundingClientRect());
        return { left: (Math.min(...bounds.map(r => r.left)) - projected.left) / ratio,
          right: (Math.max(...bounds.map(r => r.right)) - projected.left) / ratio,
          top: (Math.min(...bounds.map(r => r.top)) - projected.top) / ratio,
          bottom: (Math.max(...bounds.map(r => r.bottom)) - projected.top) / ratio };
      };
      // Synchronous layout-only probes; restore the current mechanical value
      // before paint. The flight remains the only owner of its animation clock.
      const offset = body.style.getPropertyValue("--deck-lid-offset");
      let closed: DeckBounds, open: DeckBounds;
      try {
        body.style.setProperty("--deck-lid-offset", "0"); closed = measure(false);
        body.style.setProperty("--deck-lid-offset", "135"); open = measure(true);
      } finally { body.style.setProperty("--deck-lid-offset", offset || "0"); }
      const w = frameRect.width, h = frameRect.height;
      const paper = document.querySelector<HTMLElement>('[data-testid="lyrics-paper"]')?.getBoundingClientRect();
      const centerY = paper && paper.height > 0 ? (paper.top + paper.bottom) / 2 - frameRect.top : h * .62;
      // Deck is a centered object, with breathing room around the equipment.
      // Split keeps the approved fit and actual paper alignment unchanged.
      const deckWidth = w * .80;
      const deckClosed = fitDeck(closed, deckWidth, h - 128, w / 2, h - 64);
      const deckCenter = h * .55;
      const deckBottom = deckCenter + (closed.bottom - closed.top) * deckClosed.scale / 2;
      const splitClosed = fitDeck(closed, w * .48 - 24, h - 96, w * .25, h - 64);
      const splitBottom = Math.min(h - 64, centerY + (closed.bottom - closed.top) * splitClosed.scale / 2);
      const fits = { "deck-closed": fitDeck(closed, deckWidth, h - 128, w / 2, deckBottom),
        "deck-open": fitDeck(open, w - 64, h - 96, w / 2, h - 64),
        "split-closed": fitDeck(closed, w * .48 - 24, h - 96, w * .25, splitBottom),
        "split-open": fitDeck(open, w * .48 - 24, h - 96, w * .25, splitBottom) };
      for (const [name, fit] of Object.entries(fits)) {
        body.style.setProperty(`--${name}-x`, `${fit.x}px`); body.style.setProperty(`--${name}-y`, `${fit.y}px`); body.style.setProperty(`--${name}-s`, String(fit.scale));
      }
      frame.dataset.closedBounds = JSON.stringify(closed); frame.dataset.openBounds = JSON.stringify(open);
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
      mounting.observe(frame.closest('[data-rail-overlay]') ?? frame, { childList: true, subtree: true });
    }
    return () => { mounting?.disconnect(); observer.disconnect(); };
  }, [viewport, placement, scene, identity]);
}
