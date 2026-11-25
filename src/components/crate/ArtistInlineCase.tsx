"use client";

import { useLayoutEffect, useRef, type ComponentProps } from "react";
import gsap from "gsap";
import { ArtistJewelCaseDetail } from "./ArtistJewelCaseDetail";
import styles from "./ArtistDiscography.module.css";

type Props = ComponentProps<typeof ArtistJewelCaseDetail> & { expanded: boolean; onClosed: () => void };

// Killing a timeline preserves its current transforms. A quick close/reopen
// therefore reverses the same hinge instead of replaying an obsolete callback.
export function ArtistInlineCase({ expanded, onClosed, ...detail }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  useLayoutEffect(() => {
    const element = root.current;
    const lid = element?.querySelector("section");
    if (!element || !lid) return;
    if (!initialized.current) {
      gsap.set(lid, { rotateY: 165 });
      gsap.set(element, { opacity: 0 });
      initialized.current = true;
    }
    element.dataset.presentation = expanded ? "opening" : "closing";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(lid, { rotateY: expanded ? 0 : 165 });
      gsap.set(element, { opacity: expanded ? 1 : 0 });
      element.dataset.presentation = expanded ? "open" : "closed";
      if (!expanded) onClosed();
      return;
    }
    const timeline = gsap.timeline({ onComplete: () => {
      element.dataset.presentation = expanded ? "open" : "closed";
      if (!expanded) onClosed();
    } });
    if (expanded) {
      // Finish reserving the two-case footprint before unfolding the lid.
      timeline.to(element, { opacity: 1, duration: .12 }, .34)
        .to(lid, { rotateY: 0, duration: .65, ease: "power2.inOut" }, .34);
    } else {
      timeline.to(lid, { rotateY: 165, duration: .35, ease: "power2.inOut" })
        .to(element, { opacity: 0, duration: .12 });
    }
    return () => { timeline.kill(); };
  }, [expanded, onClosed]);
  return <div ref={root} className={styles.openCase} data-presentation="opening" inert={!expanded}>
    <ArtistJewelCaseDetail {...detail} active={detail.active && expanded} />
  </div>;
}
