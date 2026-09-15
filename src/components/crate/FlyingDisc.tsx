"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
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

    const tl = gsap.timeline({ onComplete: onDone });

    gsap.set(el, {
      position: "fixed",
      left: originRect.left + originRect.width / 2,
      top: originRect.top + originRect.height / 2,
      xPercent: -50,
      yPercent: -50,
      scale: 0.6,
      opacity: 0,
    });

    tl.to(el, { opacity: 1, duration: 0.15 });
    tl.to(el, {
      top: -180,
      scale: 1.5,
      rotate: 640,
      duration: 0.9,
      ease: "power3.in",
    });
    tl.to(el, { opacity: 0, duration: 0.2 }, "-=0.15");

    return () => {
      tl.kill();
    };
  }, [originRect, onDone]);

  return (
    <div ref={discRef} className={styles.disc} aria-hidden="true">
      <div
        className={styles.discInner}
        style={{ backgroundImage: `url(${coverUrl})` }}
      />
      <div className={styles.hub} />
    </div>
  );
}
