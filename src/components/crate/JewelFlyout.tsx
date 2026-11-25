"use client";

import Image from "next/image";
import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import styles from "./JewelFlyout.module.css";

interface JewelFlyoutProps {
  title: string;
  artist: string;
  coverUrl: string;
  year?: string;
  anchor: HTMLButtonElement;
}

export function JewelFlyout({ title, artist, coverUrl, year, anchor }: JewelFlyoutProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const flyout = ref.current;
    if (!flyout) return;

    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const header = document.querySelector("[data-shell-header]");
      const footer = document.querySelector("[data-global-player]");
      const inset = 14;
      const minTop = (header?.getBoundingClientRect().bottom ?? 0) + inset;
      const maxBottom = (footer?.getBoundingClientRect().top ?? window.innerHeight) - inset;
      const center = rect.left + rect.width / 2;
      const { offsetWidth: width, offsetHeight: height } = flyout;
      const left = Math.max(inset, Math.min(window.innerWidth - width - inset, center - width / 2));
      const above = rect.top - height - 18;
      const below = rect.bottom + 18;
      const flip = above < minTop && below + height <= maxBottom;
      flyout.style.left = `${left}px`;
      flyout.style.top = `${flip ? below : Math.max(minTop, above)}px`;
      flyout.style.setProperty("--flyout-pin", `${Math.max(12, Math.min(width - 12, center - left))}px`);
      flyout.dataset.placement = flip ? "below" : "above";
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(flyout);
    observer.observe(anchor);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  return createPortal(
    <div ref={ref} className={styles.flyout} data-batea-flyout aria-hidden="true">
      <div className={styles.card}>
        {coverUrl && <div className={styles.art}>
          <Image src={coverUrl} alt="" fill sizes="66px" unoptimized className={styles.artImg} />
        </div>}
        <div className={styles.meta}>
          <p className={styles.title}>{title}</p>
          <p className={styles.artist}>{artist}</p>
          {year && <time className={styles.year} dateTime={year}>{year}</time>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
