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

    const viewportHeight = () =>
      window.visualViewport?.height ?? window.innerHeight;

    const fallbackToX = window.innerWidth / 2;
    const fallbackToY = viewportHeight() * 0.5;
    const fallbackToSize = Math.max(280, fromSize * 0.5);

    /*
     * AJUSTES PRINCIPALES
     *
     * DURATION:
     * Duración total del vuelo.
     *
     * FINAL_Y_OFFSET:
     * Ajuste vertical final respecto al centro del viewport.
     *
     * HERO_ARC_HEIGHT:
     * Qué tan arriba pasa el CD antes de volver hacia el hero.
     *
     * Y_SLOW_FACTOR:
     * Hace que el desplazamiento vertical sea más pausado.
     *
     * FINAL_SIZE_SCALE:
     * Tamaño del CD al incrustarse en el hero.
     */
    const DURATION = 5.2;
    const SCROLL_DURATION = DURATION;

    const FINAL_TILT_X = 38;
    const FINAL_SIZE_SCALE = 0.92;
    const FINAL_Y_OFFSET = -30;

    const HERO_ARC_HEIGHT = 120;
    const Y_SLOW_FACTOR = 1.35;

    /*
     * Este es el punto vertical de aterrizaje.
     * Se comparte entre el scroll y el vuelo para que ambos
     * terminen exactamente en el mismo lugar.
     */
    const landingY = viewportHeight() * 0.5 + FINAL_Y_OFFSET;

    const path = { p: 0 };
    const scrollProgress = { p: 0 };

    const scrollStartY = window.scrollY;

    let lastX = fromX;
    let lastY = fromY;
    let spinAccum = 0;

    /*
     * El html global tiene scroll-behavior:smooth.
     * Durante esta animación queremos que GSAP controle
     * el scroll directamente, sin que el navegador agregue
     * otra interpolación encima.
     */
    const html = document.documentElement;
    const body = document.body;

    const previousHtmlScrollBehavior = html.style.scrollBehavior;
    const previousBodyScrollBehavior = body.style.scrollBehavior;

    html.style.scrollBehavior = "auto";
    body.style.scrollBehavior = "auto";

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
      rotationX: 0,
      scaleX: 1,
      scaleY: 1,
    });

    gsap.set(spinner, {
      rotate: 0,
    });

    /*
     * SCROLL
     *
     * El scroll usa exactamente la misma duración y easing
     * que el movimiento principal del CD.
     */
    const scrollTween = gsap.to(scrollProgress, {
      p: 1,
      duration: SCROLL_DURATION,
      ease: "sine.inOut",
      onUpdate: () => {
        const target = readTarget();
        if (!target) return;

        const targetDocumentCenter =
          window.scrollY + target.top + target.height / 2;

        const desiredScrollY = Math.max(0, targetDocumentCenter - landingY);

        const scrollY =
          scrollStartY + (desiredScrollY - scrollStartY) * scrollProgress.p;

        gsap.set(window, {
          scrollTo: {
            y: scrollY,
            autoKill: false,
          },
        });
      },
    });

    /*
     * VUELO PRINCIPAL
     */
    const tl = gsap.timeline({
      onComplete: onDone,
    });

    tl.to(
      path,
      {
        p: 1,
        duration: DURATION,
        ease: "sine.inOut",

        onUpdate: () => {
          const targetRect = readTarget();

          const toX = targetRect
            ? targetRect.left + targetRect.width / 2
            : fallbackToX;

          const toY = targetRect ? landingY : fallbackToY;

          const toSize = targetRect
            ? targetRect.width * FINAL_SIZE_SCALE
            : fallbackToSize;

          const p = path.p;

          /*
           * X mantiene una trayectoria suave.
           */
          const midX = fromX + (toX - fromX) * 0.52 + (toX >= fromX ? 28 : -28);

          /*
           * Y avanza más lentamente que X.
           * Esto evita que el CD "caiga" demasiado rápido.
           */
          const yProgress = Math.pow(p, Y_SLOW_FACTOR);

          /*
           * Punto más alto del arco.
           * Lo mantenemos cerca del hero para no utilizar
           * todo el espacio vacío entre hero y batea.
           */
          const midY = landingY - HERO_ARC_HEIGHT;

          const x =
            (1 - p) * (1 - p) * fromX + 2 * (1 - p) * p * midX + p * p * toX;

          const y =
            (1 - yProgress) * (1 - yProgress) * fromY +
            2 * (1 - yProgress) * yProgress * midY +
            yProgress * yProgress * toY;

          const size = fromSize + (toSize - fromSize) * p;

          /*
           * Dirección del movimiento.
           */
          const dx = x - lastX;
          const dy = y - lastY;
          const dist = Math.hypot(dx, dy);

          /*
           * Giro del CD.
           * Un poco más lento para que la portada se pueda apreciar.
           */
          spinAccum += dist * 1.7 + 2.4;

          /*
           * Stretch muy sutil.
           * Evitamos que parezca un proyectil.
           */
          const fade = 1 - p;
          const stretch = Math.min(0.24, (dist / 30) * fade);

          const angle = dist > 0.15 ? (Math.atan2(dy, dx) * 180) / Math.PI : 0;

          /*
           * En el último tercio empieza a adoptar
           * progresivamente la inclinación del hero.
           */
          const dockProgress = Math.max(0, Math.min(1, (p - 0.68) / 0.32));

          const tiltEase = dockProgress * dockProgress * (3 - 2 * dockProgress);

          const rotationX = FINAL_TILT_X * tiltEase;

          gsap.set(el, {
            left: x,
            top: y,
            width: size,
            height: size,
            rotate: angle,
            rotationX,
            scaleX: 1 + stretch,
            scaleY: 1 - stretch * 0.42,
          });

          /*
           * El giro visual de la portada es independiente
           * del ángulo del trayecto.
           */
          gsap.set(spinner, {
            rotate: spinAccum - angle,
          });

          lastX = x;
          lastY = y;

          /*
           * El álbum se carga prácticamente al llegar.
           * Esto evita que el trabajo pesado del hero interfiera
           * demasiado con la parte larga del vuelo.
           */
          if (!arrivedRef.current && p > 0.99) {
            arrivedRef.current = true;

            setBurst({
              x: toX,
              y: toY,
            });

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

    /*
     * PEQUEÑO SETTLE FINAL
     *
     * No hacemos bounce fuerte.
     * Queremos una entrada física y controlada.
     */
    tl.to(
      el,
      {
        rotate: 0,
        rotationX: FINAL_TILT_X,
        scaleX: 1.015,
        scaleY: 1.015,
        duration: 0.22,
        ease: "sine.out",
      },
      "-=0.02",
    );

    tl.to(
      el,
      {
        scaleX: 1,
        scaleY: 1,
        duration: 0.38,
        ease: "power2.out",
      },
      "<",
    );

    /*
     * Desaparición muy corta una vez hecho el dock.
     */
    tl.to(
      el,
      {
        opacity: 0,
        duration: 0.22,
        ease: "power1.in",
      },
      "-=0.08",
    );

    return () => {
      scrollTween.kill();
      tl.kill();

      html.style.scrollBehavior = previousHtmlScrollBehavior;

      body.style.scrollBehavior = previousBodyScrollBehavior;
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
