"use client";

import { useEffect, useState } from "react";

export function ClickDebugOverlay() {
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const describe = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return String(el);
      const cls = el.className
        ? `.${String(el.className).split(" ").join(".")}`
        : "";
      return `${el.tagName.toLowerCase()}${cls}`;
    };

    const onDown = (e: PointerEvent) => {
      setLog((l) => [`pointerdown → ${describe(e.target)}`, ...l].slice(0, 8));
    };
    const onClick = (e: MouseEvent) => {
      setLog((l) => [`click → ${describe(e.target)}`, ...l].slice(0, 8));
    };

    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("click", onClick, true);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 999999,
        background: "rgba(0,0,0,0.9)",
        color: "#0f0",
        fontFamily: "monospace",
        fontSize: 11,
        padding: 8,
        pointerEvents: "none",
        maxWidth: "90vw",
        whiteSpace: "pre-wrap",
      }}
    >
      {log.length === 0 ? "esperando eventos..." : log.join("\n")}
    </div>
  );
}
