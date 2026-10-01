"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import gsap from "gsap";
import { discRegistry } from "@/lib/discRegistry";
import discStyles from "../Disc/Disc.module.css";
import { useRail } from "@/components/scroll/RailContext";
import styles from "./RailFlyingDisc.module.css";

interface RailFlyingDiscProps {
  coverUrl: string;
  originRect: DOMRect;
  onArrive: () => void;
  onDone: () => void;
}

const PARTICLES = Array.from({ length: 12 }, (_, index) => {
  const angle = (index / 12) * Math.PI * 2;
  const distance = 38 + (index % 4) * 10;

  return {
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance,
    delay: (index % 5) * 0.02,
  };
});

export function RailFlyingDisc({
  coverUrl,
  originRect,
  onArrive,
  onDone,
}: RailFlyingDiscProps) {
  const rail = useRail();
  const wrapRef = useRef<HTMLDivElement>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);
  const impactRef = useRef<HTMLDivElement>(null);
  const arrivedRef = useRef(false);
  const doneRef = useRef(false);
  const impactTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const pulseTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!rail.isReady) return;

    const el = wrapRef.current;
    const spinner = spinnerRef.current;

    if (!el || !spinner) return;

    const fromX = originRect.left + originRect.width / 2;
    const fromY = originRect.top + originRect.height / 2;
    const fromSize = originRect.width;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const duration = reduceMotion ? 0 : 1.15;

    const readTarget = () =>
      discRegistry.discTarget?.getBoundingClientRect() ?? null;

    const initialTarget = readTarget();
    const fallbackX = window.innerWidth / 2;
    const fallbackY = window.innerHeight * 0.48;
    const fallbackSize = Math.max(220, fromSize * 0.5);

    const path = { p: 0 };
    let lastX = fromX;
    let lastY = fromY;
    let spin = 0;

    gsap.set(el, {
      left: fromX,
      top: fromY,
      width: fromSize,
      height: fromSize,
      xPercent: -50,
      yPercent: -50,
      opacity: 1,
      rotate: 0,
      rotationX: 0,
      scaleX: 1,
      scaleY: 1,
    });

    gsap.set(spinner, { rotate: 0 });
    rail.start();
    rail.scrollToChapter(0, duration);

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
    };

    if (reduceMotion) {
      const target = readTarget() ?? initialTarget;

      if (target) {
        const dockTarget = discRegistry.discTarget;
        const dockRect = dockTarget?.getBoundingClientRect();

        gsap.set(el, {
          left: target.left + target.width / 2,
          top: target.top + target.height / 2,
          width: target.width * 0.9,
          height: target.height * 0.9,
        });

        if (dockTarget) {
          dockTarget.classList.remove(discStyles.dockPulse);
          void dockTarget.offsetWidth;
          dockTarget.classList.add(discStyles.dockPulse);
          pulseTimeoutRef.current = window.setTimeout(() => {
            dockTarget.classList.remove(discStyles.dockPulse);
            pulseTimeoutRef.current = null;
          }, 450);
        }

        if (impactRef.current && dockRect) {
          gsap.set(impactRef.current, {
            left: dockRect.left + dockRect.width / 2,
            top: dockRect.top + dockRect.height / 2,
          });
        }
      }

      onArrive();
      onDone();
      return;
    }

    const tween = gsap.to(path, {
      p: 1,
      duration,
      ease: "sine.inOut",
      onUpdate: () => {
        const target = readTarget() ?? initialTarget;
        const toX = target ? target.left + target.width / 2 : fallbackX;
        const toY = target ? target.top + target.height / 2 : fallbackY;
        const toSize = target ? target.width * 0.9 : fallbackSize;
        const p = path.p;
        const midX = fromX + (toX - fromX) * 0.5 + (toX >= fromX ? 26 : -26);
        const midY = (fromY + toY) * 0.5 - 74;
        const x =
          (1 - p) * (1 - p) * fromX +
          2 * (1 - p) * p * midX +
          p * p * toX;
        const arc = Math.sin(Math.PI * p) * Math.min(28, window.innerHeight * 0.035);
        const y =
          (1 - p) * (1 - p) * fromY +
          2 * (1 - p) * p * midY +
          p * p * toY -
          arc;
        const size = fromSize + (toSize - fromSize) * p;
        const dx = x - lastX;
        const dy = y - lastY;
        const distance = Math.hypot(dx, dy);
        const travelAngle =
          distance > 0.1 ? (Math.atan2(dy, dx) * 180) / Math.PI : 0;

        spin += distance * 1.5 + 1.8;

        gsap.set(el, {
          left: x,
          top: y,
          width: size,
          height: size,
          rotate: travelAngle,
          rotationX: 30 * Math.max(0, Math.min(1, (p - 0.8) / 0.2)),
          scaleX: 1 + Math.min(0.06, distance / 90),
          scaleY: 1 - Math.min(0.025, distance / 180),
        });

        gsap.set(spinner, { rotate: spin - travelAngle });
        lastX = x;
        lastY = y;

        if (!arrivedRef.current && p >= 0.97) {
          arrivedRef.current = true;
          const dockTarget = discRegistry.discTarget;
          const dockRect = dockTarget?.getBoundingClientRect();

          if (dockTarget) {
            dockTarget.classList.remove(discStyles.dockPulse);
            void dockTarget.offsetWidth;
            dockTarget.classList.add(discStyles.dockPulse);
            pulseTimeoutRef.current = window.setTimeout(() => {
              dockTarget.classList.remove(discStyles.dockPulse);
              pulseTimeoutRef.current = null;
            }, 650);
          }

          if (impactRef.current && dockRect) {
            const ring = impactRef.current.querySelector("[data-impact-ring]");
            const flash = impactRef.current.querySelector("[data-impact-flash]");
            const particles = impactRef.current.querySelectorAll("[data-impact-particle]");

            gsap.set(impactRef.current, {
              left: dockRect.left + dockRect.width / 2,
              top: dockRect.top + dockRect.height / 2,
            });

            impactTimelineRef.current?.kill();
            impactTimelineRef.current = gsap.timeline();
            impactTimelineRef.current
              .fromTo(ring,
                { scale: 0.3, opacity: 0.65 },
                { scale: 1.8, opacity: 0, duration: 0.32, ease: "power2.out" },
                0,
              )
              .fromTo(flash,
                { scale: 0.4, opacity: 0.45 },
                { scale: 1.35, opacity: 0, duration: 0.2, ease: "power2.out" },
                0,
              )
              .fromTo(particles,
                { x: 0, y: 0, opacity: 0.8 },
                { x: (index) => PARTICLES[index]?.dx ?? 0, y: (index) => PARTICLES[index]?.dy ?? 0, opacity: 0, duration: 0.34, stagger: 0.01, ease: "power2.out" },
                0,
              );
          }

          onArrive();
        }
      },
      onComplete: () => {
        gsap.to(el, {
          opacity: 0,
          duration: 0.16,
          ease: "power1.in",
          onComplete: finish,
        });
      },
    });

    return () => {
      tween?.kill();
      impactTimelineRef.current?.kill();
      if (pulseTimeoutRef.current !== null) {
        window.clearTimeout(pulseTimeoutRef.current);
        pulseTimeoutRef.current = null;
      }
      gsap.killTweensOf(el);
      gsap.killTweensOf(spinner);
    };
  }, [onArrive, onDone, originRect, rail]);

  return (
    <>
      <div ref={wrapRef} className={styles.disc} aria-hidden="true">
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

      <div ref={impactRef} className={styles.impact} aria-hidden="true">
        <span className={styles.impactRing} data-impact-ring />
        <span className={styles.impactFlash} data-impact-flash />
        {PARTICLES.map((particle, index) => (
          <span
            key={index}
            className={styles.impactParticle}
            data-impact-particle
            style={{
              "--dx": particle.dx + "px",
              "--dy": particle.dy + "px",
              animationDelay: particle.delay + "s",
            } as CSSProperties}
          />
        ))}
      </div>
    </>
  );
}