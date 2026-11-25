"use client";

import { useEffect, useRef } from "react";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { initialChapter, SIGNED_IN_TAB_KEY } from "@/lib/entryNavigation";
import { useRailActions, useRailNavigation } from "./RailContext";

// OAuth supplies an explicit, disposable destination. Ordinary session refresh
// and confirmed playback never supply or replay this navigation intent.
export function RailEntryNavigation() {
  const { isReady, scrollToChapter } = useRailActions();
  const { activeChapterIndex } = useRailNavigation();
  const { authenticated } = useSpotifyPlayer();
  const consumed = useRef(false);
  const signedIn = useRef(false);
  const chapter = useRef(activeChapterIndex);
  chapter.current = activeChapterIndex;

  useEffect(() => {
    if (!isReady || consumed.current) return;
    consumed.current = true;
    const url = new URL(window.location.href);
    const target = initialChapter(url.searchParams);
    if (target === null) return;
    // Use the existing rail action, including its immediate/reduced-motion
    // behavior. No clock, duration or playback ownership is replaced here.
    scrollToChapter(target, 0);
    url.searchParams.delete("entry");
    url.searchParams.delete("chapter");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [isReady, scrollToChapter]);

  useEffect(() => {
    if (authenticated !== true) return;
    signedIn.current = true;
    try { window.sessionStorage.setItem(SIGNED_IN_TAB_KEY, "1"); } catch { /* storage may be unavailable */ }
  }, [authenticated]);

  useEffect(() => {
    const preserveDestination = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || event.defaultPrevented) return;
      let target: URL;
      try { target = new URL(link.href, window.location.href); } catch { return; }
      if (target.origin !== window.location.origin || target.pathname !== "/api/auth/login") return;
      if (target.searchParams.has("returnTo") && link.dataset.authReturnManaged !== "true") return;
      let previousSession = signedIn.current;
      try { previousSession ||= window.sessionStorage.getItem(SIGNED_IN_TAB_KEY) === "1"; } catch { /* use the current session */ }
      if (!previousSession) return;
      target.searchParams.set("returnTo", `/?chapter=${chapter.current}`);
      link.href = target.href;
      link.dataset.authReturnManaged = "true";
    };
    // Prepare the URL before the browser's new-tab/context-menu action too.
    // The default action and modifier keys retain their native behavior.
    const gestures = ["pointerdown", "click", "auxclick", "contextmenu"] as const;
    gestures.forEach((gesture) => document.addEventListener(gesture, preserveDestination, true));
    return () => gestures.forEach((gesture) => document.removeEventListener(gesture, preserveDestination, true));
  }, []);

  return null;
}
