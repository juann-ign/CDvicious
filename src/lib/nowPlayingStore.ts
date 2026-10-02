"use client";

import type { NowPlayingResponse } from "@/types/spotify";

const POLL_INTERVAL_MS = 5_000;
const EVENT_DEBOUNCE_MS = 200;
const REFRESH_THROTTLE_MS = 1_000;

type Snapshot = {
  data: NowPlayingResponse | null;
  error: boolean;
};

type RefreshSource = "poll" | "event" | "visibility" | "modal-close";

const listeners = new Set<() => void>();

let snapshot: Snapshot = {
  data: null,
  error: false,
};

let subscriberCount = 0;
let inFlight = false;
let abortController: AbortController | null = null;
let quotaExceeded = false;

let lastRefreshAt = 0;
let lastPollStartedAt = 0;
let lastEventRefreshAt = 0;

let timer: ReturnType<typeof setTimeout> | null = null;
let eventDebounceTimer: ReturnType<typeof setTimeout> | null = null;

let mutationObserver: MutationObserver | null = null;
let observersInstalled = false;

const notify = () => {
  for (const listener of listeners) {
    listener();
  }
};

const setSnapshot = (next: Snapshot) => {
  if (snapshot.data === next.data && snapshot.error === next.error) {
    return;
  }

  snapshot = next;
  notify();
};

const isModalOpen = () => document.documentElement.dataset.modalOpen === "true";

const canRefresh = () =>
  subscriberCount > 0 &&
  document.visibilityState === "visible" &&
  !isModalOpen() &&
  !quotaExceeded &&
  !inFlight;

const clearTimer = () => {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
};

const clearEventDebounce = () => {
  if (eventDebounceTimer !== null) {
    clearTimeout(eventDebounceTimer);
    eventDebounceTimer = null;
  }
};

const abortInFlight = () => {
  abortController?.abort();
  abortController = null;
  inFlight = false;
};

const scheduleNextPoll = () => {
  clearTimer();

  if (
    subscriberCount === 0 ||
    document.visibilityState !== "visible" ||
    isModalOpen() ||
    quotaExceeded
  ) {
    return;
  }

  timer = setTimeout(() => {
    timer = null;
    refresh("poll");
  }, POLL_INTERVAL_MS);
};

const fetchNowPlaying = async (source: RefreshSource) => {
  if (!canRefresh()) {
    return;
  }

  const controller = new AbortController();
  abortController = controller;
  inFlight = true;

  const startedAt = Date.now();
  lastRefreshAt = startedAt;

  if (source === "poll") {
    lastPollStartedAt = startedAt;
  }

  if (source === "event") {
    lastEventRefreshAt = startedAt;
  }

  try {
    const res = await fetch("/api/now-playing", {
      cache: "no-store",
      signal: controller.signal,
    });

    if (res.status === 429) {
      const body = (await res.json().catch(() => null)) as {
        reason?: string;
      } | null;

      if (body?.reason === "QUOTA_EXCEEDED") {
        quotaExceeded = true;
        clearTimer();
        clearEventDebounce();
        setSnapshot({
          data: snapshot.data,
          error: true,
        });
        return;
      }

      setSnapshot({
        data: snapshot.data,
        error: true,
      });
      return;
    }

    if (!res.ok) {
      setSnapshot({
        data: snapshot.data,
        error: true,
      });
      return;
    }

    const json: NowPlayingResponse = await res.json();

    if (document.visibilityState !== "visible" || isModalOpen()) {
      return;
    }

    setSnapshot({
      data: json,
      error: false,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }

    setSnapshot({
      data: snapshot.data,
      error: true,
    });
  } finally {
    if (abortController === controller) {
      abortController = null;
      inFlight = false;
    }

    if (
      subscriberCount > 0 &&
      !quotaExceeded &&
      document.visibilityState === "visible" &&
      !isModalOpen()
    ) {
      scheduleNextPoll();
    }
  }
};

const refresh = (source: RefreshSource) => {
  if (subscriberCount === 0 || quotaExceeded || inFlight) {
    return;
  }

  if (source === "event") {
    const lastEventGateAt = Math.max(lastRefreshAt, lastEventRefreshAt);

    if (Date.now() - lastEventGateAt < REFRESH_THROTTLE_MS) {
      return;
    }
  }

  if (
    source === "visibility" &&
    Date.now() - lastRefreshAt < REFRESH_THROTTLE_MS
  ) {
    return;
  }

  if (!canRefresh()) {
    if (source === "visibility") {
      scheduleNextPoll();
    }

    return;
  }

  if (source !== "poll") {
    clearTimer();
  }

  void fetchNowPlaying(source);
};

const handlePlayerStateChanged = () => {
  clearEventDebounce();

  if (
    subscriberCount === 0 ||
    document.visibilityState !== "visible" ||
    isModalOpen() ||
    quotaExceeded ||
    inFlight
  ) {
    return;
  }

  eventDebounceTimer = setTimeout(() => {
    eventDebounceTimer = null;
    refresh("event");
  }, EVENT_DEBOUNCE_MS);
};

const handleVisibilityChange = () => {
  clearTimer();
  clearEventDebounce();

  if (document.visibilityState === "hidden") {
    abortInFlight();
    return;
  }

  if (subscriberCount > 0) {
    refresh("visibility");
  }
};

const handleModalMutation: MutationCallback = (mutations) => {
  for (const mutation of mutations) {
    if (
      mutation.type !== "attributes" ||
      mutation.attributeName !== "data-modal-open"
    ) {
      continue;
    }

    if (isModalOpen()) {
      clearTimer();
      clearEventDebounce();
      abortInFlight();
      return;
    }

    if (subscriberCount > 0) {
      refresh("modal-close");
    }

    return;
  }
};

const installObservers = () => {
  if (observersInstalled || typeof window === "undefined") {
    return;
  }

  observersInstalled = true;

  window.addEventListener(
    "cdvicious:player_state_changed",
    handlePlayerStateChanged,
  );
  document.addEventListener("visibilitychange", handleVisibilityChange);

  mutationObserver = new MutationObserver(handleModalMutation);
  mutationObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-modal-open"],
  });
};

const uninstallObservers = () => {
  if (!observersInstalled || typeof window === "undefined") {
    return;
  }

  observersInstalled = false;
  window.removeEventListener(
    "cdvicious:player_state_changed",
    handlePlayerStateChanged,
  );
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  mutationObserver?.disconnect();
  mutationObserver = null;
};

const start = () => {
  installObservers();

  if (
    subscriberCount > 0 &&
    document.visibilityState === "visible" &&
    !isModalOpen() &&
    !quotaExceeded
  ) {
    refresh("poll");
  }
};

const stop = () => {
  clearTimer();
  clearEventDebounce();
  uninstallObservers();
  abortInFlight();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => snapshot;

const acquire = () => {
  subscriberCount += 1;

  if (subscriberCount === 1) {
    start();
  }
};

const release = () => {
  subscriberCount = Math.max(0, subscriberCount - 1);

  if (subscriberCount === 0) {
    stop();
  }
};

export { acquire, getSnapshot, refresh, release, subscribe };
