"use client";

import { useEffect, useRef, useState } from "react";

export function useMouseParallax(maxTilt = 6) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function handleMove(e: MouseEvent) {
      const dx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
      const dy =
        (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
      setOffset({ x: dx * maxTilt, y: dy * maxTilt });
    }
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, [maxTilt]);

  return { ref, offset };
}
