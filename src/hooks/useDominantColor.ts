"use client";

import { useEffect, useState } from "react";

export function useDominantColor(imageUrl: string | undefined) {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setColor(null);
      return;
    }

    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;

    img.onload = () => {
      if (cancelled) return;
      try {
        const size = 20;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        let r = 0,
          g = 0,
          b = 0,
          count = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
        setColor(
          `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`,
        );
      } catch {
        setColor(null);
      }
    };
    img.onerror = () => setColor(null);

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return color;
}
