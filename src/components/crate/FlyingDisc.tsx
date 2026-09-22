"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import gsap from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { discRegistry } from "@/lib/discRegistry";
import discStyles from "../Disc/Disc.module.css";
import styles from "./FlyingDisc.module.css";

gsap.registerPlugin(ScrollToPlugin);

interface FlyingDiscProps {
  coverUrl: string;
  originRect: DOMRect;
  onArrive: () => void;
  onDone: () => void;
}

interface BurstPoint {
  x: number;
  y: number;
}

const BURST_PARTICLES = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2 + ((i * 17) % 11) * 0.01;
  const distance = 54 + ((i * 29) % 62);

  return {
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance,
    delay: ((i * 7) % 9) * 0.01,
  };
});

export function FlyingDisc({
  coverUrl,
  originRect,
  onArrive,
  onDone,
}: FlyingDiscProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);
  const arrivedRef = useRef(false);
  const [burst, setBurst] = useState<BurstPoint | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    const spinner = spinnerRef.current;
    if (!el || !spinner) return;

    const fromX = originRect.left + originRect.width / 2;
    const fromY = originRect.top + originRect.height / 2;
    const fromSize = originRect.width;

    const readTarget = () => {
      const target = discRegistry.discTarget;
      return target ? target.getBoundingClientRect() : null;
    };

    const fallbackToX = window.innerWidth / 2;
    const fallbackToY = window.innerHeight * 0.22;
    const fallbackToSize = Math.max(280, fromSize * 0.62);

    const DURATION = 1.85;
    const path = { p: 0 };
    let lastX = fromX;
    let lastY = fromY;
    let spinAccum = 0;

    gsap.set(el, {
      position: "fixed",
      left: fromX,
      top: fromY,
      xPercent: -50,
      yPercent: -50,
      width: fromSize,
      height: fromSize,
      opacity: 1,
      rotate: 0,
      scaleX: 1,
      scaleY: 1,
    });
    gsap.set(spinner, { rotate: 0 });

    const scrollTween = gsap.to(window, {
      duration: DURATION * 0.92,
      scrollTo: { y: 0, autoKill: false },
      ease: "power2.inOut",
    });

    const tl = gsap.timeline({ onComplete: onDone });

    tl.to(
      path,
      {
        p: 1,
        duration: DURATION,
        ease: "power2.inOut",
        onUpdate: () => {
          const targetRect = readTarget();
          const toX = targetRect
            ? targetRect.left + targetRect.width / 2
            : fallbackToX;
          const toY = targetRect
            ? targetRect.top + targetRect.height / 2
            : fallbackToY;
          const toSize = targetRect ? targetRect.width : fallbackToSize;

          const p = path.p;
          const midX =
            fromX +
            (toX - fromX) * 0.52 +
            (toX >= fromX ? 36 : -36);
          const arcHeight = Math.max(240, Math.abs(fromY - toY) * 0.4);
          const midY = Math.min(fromY, toY) - arcHeight;

          const x =
            (1 - p) * (1 - p) * fromX +
            2 * (1 - p) * p * midX +
            p * p * toX;
          const y =
            (1 - p) * (1 - p) * fromY +
            2 * (1 - p) * p * midY +
            p * p * toY;
          const size = fromSize + (toSize - fromSize) * p;

          const dx = x - lastX;
          const dy = y - lastY;
          const dist = Math.hypot(dx, dy);

          spinAccum += dist * 2.25 + 3.8;

          const fade = 1 - p;
          const stretch = Math.min(0.34, (dist / 24) * fade);
          const angle =
            dist > 0.15 ? (Math.atan2(dy, dx) * 180) / Math.PI : 0;

          gsap.set(el, {
            left: x,
            top: y,
            width: size,
            height: size,
            rotate: angle,
            scaleX: 1 + stretch,
            scaleY: 1 - stretch * 0.42,
          });

          gsap.set(spinner, {
            rotate: spinAccum - angle,
          });

          lastX = x;
          lastY = y;

          if (!arrivedRef.current && p > 0.98) {
            arrivedRef.current = true;
            setBurst({ x: toX, y: toY });

            const target = discRegistry.discTarget;
            if (target) {
              target.classList.remove(discStyles.dockPulse);
              void target.offsetWidth;
              target.classList.add(discStyles.dockPulse);
              window.setTimeout(() => {
                target.classList.remove(discStyles.dockPulse);
              }, 900);
            }

            onArrive();
          }
        },
      },
      0,
    );

    tl.to(
      el,
      {
        rotate: 0,
        scaleX: 1.06,
        scaleY: 1.06,
        duration: 0.14,
        ease: "power1.out",
      },
      "-=0.02",
    );
    tl.to(
      el,
      {
        scaleX: 1,
        scaleY: 1,
        duration: 0.55,
        ease: "elastic.out(1, 0.4)",
      },
      "<",
    );
    tl.to(
      el,
      {
        opacity: 0,
        duration: 0.3,
        ease: "power1.in",
      },
      "-=0.15",
    );

    return () => {
      scrollTween.kill();
      tl.kill();
    };
  }, [onArrive, onDone, originRect]);

  return (
    <>
      <div
        ref={wrapRef}
        className={styles.disc}
        aria-hidden="true"
        style={{
          boxShadow:
            "0 20px 60px -10px rgba(0,0,0,0.65), 0 0 32px -4px var(--color-phosphor-glow)",
        }}
      >
        <div ref={spinnerRef} className={styles.spinner}>
          <div
            className={styles.discInner}
            style={{ backgroundImage: "url(" + coverUrl + ")" }}
          />
          <div className={styles.sheen} />
          <div className={styles.grooves} />
          <div className={styles.hub} />
        </div>
      </div>

      {burst && (
        <div
          className={styles.burstLayer}
          style={{ left: burst.x, top: burst.y }}
          aria-hidden="true"
        >
          <span className={styles.burstRing} />
          <span className={styles.burstFlash} />
          {BURST_PARTICLES.map((particle, index) => (
            <span
              key={index}
              className={styles.burstParticle}
              style={
                {
                  "--dx": particle.dx + "px",
                  "--dy": particle.dy + "px",
                  animationDelay: particle.delay + "s",
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </>
  );
}
