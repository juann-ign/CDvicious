"use client";

import { useEffect, useState } from "react";

export type InteractionPrototype = "deck-lift" | "collection-tray";

/** Review-only variants: the regular integrated app stays the default. */
export function useInteractionPrototype(proposal: InteractionPrototype) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_INTERACTION_PROTOTYPES !== "1") return;
    const update = () => setEnabled(new URL(window.location.href).searchParams.get("prototype") === proposal);
    update();
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, [proposal]);
  return enabled;
}
