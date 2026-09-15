"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { discRegistry } from "@/lib/discRegistry";
import styles from "./FlyingDisc.module.css";

interface FlyingDiscProps {
  coverUrl: string;
  originRect: DOMRect;
  onDone: () => void;
}

export function FlyingDisc({ coverUrl, originRect, onDone }: FlyingDiscProps) {
  const discRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = discRef.current;
    if (!el) return;

    const target = discRegistry.discTarget?.getBoundingClientRect();
    if (!target) {
      onDone();
      return;
    }

    const fromX = originRect.left + originRect.width / 2;
    const fromY = originRect.top + originRect.height / 2;
    const toX = target.left + target.width / 2;
    const toY = target.top + target.height / 2;

    const tl = gsap.timeline({ onComplete: onDone });

    gsap.set(el, {
      position: "fixed",
      left: fromX,
      top: fromY,
      xPercent: -50,
      yPercent: -50,
      scale: 0.48,
      opacity: 0,
      rotate: -12,
    });

    tl.to(el, { opacity: 1, duration: 0.16, ease: "power1.out" });
    tl.to(el, {
      left: fromX + (toX - fromX) * 0.18,
      top: fromY - 90,
      scale: 0.8,
      rotate: 150,
      duration: 0.28,
      ease: "power2.out",
    });
    tl.to(el, {
      left: fromX + (toX - fromX) * 0.62,
      top: fromY - 150,
      scale: 1.02,
      rotate: 430,
      duration: 0.4,
      ease: "power1.inOut",
    });
    tl.to(el, {
      left: toX,
      top: toY,
      scale: 0.18,
      rotate: 720,
      duration: 0.42,
      ease: "power3.in",
    });
    tl.to(el, { opacity: 0, duration: 0.14, ease: "power1.in" }, "-=0.08");

    return () => tl.kill();
  }, [originRect, onDone]);

  return (
    <div ref={discRef} className={styles.disc} aria-hidden="true">
      <div className={styles.discInner} style={{ backgroundImage: `url(${coverUrl})` }} />
      <div className={styles.hub} />
    </div>
  );
}
