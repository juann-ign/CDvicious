export type PlaybackAttemptStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "degraded"
  | "superseded";

export type PlaybackSnapshot = {
  isPlaying: boolean;
  progressMs: number | null;
  durationMs: number | null;
  track: {
    id?: string;
    uri?: string;
    name?: string;
    artists?: { name: string }[];
    album?: {
      id?: string;
      uri?: string;
      name?: string;
      images?: { url: string; width?: number; height?: number }[];
    };
    [key: string]: unknown;
  } | null;
};

export type PlaybackAttempt = {
  id: string;
  targetAlbumUri: string;
  startedAt: number;
  status: PlaybackAttemptStatus;
  commandAcceptedAt: number | null;
  confirmedAt: number | null;
  reason: string | null;
};

export type PlaybackCoordinatorState = {
  confirmedSnapshot: PlaybackSnapshot | null;
  attempt: PlaybackAttempt | null;
  lastProcessedRequestSeq: number;
};

type Observation = {
  requestSeq: number;
  requestStartedAt: number;
  receivedAt: number;
  snapshot: PlaybackSnapshot | null;
};

type CoordinatorOptions = {
  initialSnapshot?: PlaybackSnapshot | null;
  confirmationTimeoutMs?: number;
  now?: () => number;
};

function albumUriFromSnapshot(snapshot: PlaybackSnapshot | null) {
  const album = snapshot?.track?.album;
  if (!album) return null;
  if (typeof album.uri === "string" && album.uri.length > 0) return album.uri;
  if (typeof album.id === "string" && album.id.length > 0) {
    return `spotify:album:${album.id}`;
  }
  return null;
}

function isValidSnapshot(snapshot: PlaybackSnapshot | null): snapshot is PlaybackSnapshot {
  return Boolean(snapshot && typeof snapshot.isPlaying === "boolean");
}

export function createPlaybackSnapshotCoordinator({
  initialSnapshot = null,
  confirmationTimeoutMs = 15_000,
  now = () => Date.now(),
}: CoordinatorOptions = {}) {
  let confirmedSnapshot = isValidSnapshot(initialSnapshot) ? initialSnapshot : null;
  let attempt: PlaybackAttempt | null = null;
  let lastProcessedRequestSeq = -1;
  let ignoreObservationsStartedBeforeAt = Number.NEGATIVE_INFINITY;

  const getState = (): PlaybackCoordinatorState => ({
    confirmedSnapshot,
    attempt: attempt ? { ...attempt } : null,
    lastProcessedRequestSeq,
  });

  const isCurrentPendingAttempt = (attemptId: string) =>
    attempt?.id === attemptId && attempt.status === "pending";

  const markRequestAsProcessed = (requestSeq: number) => {
    if (!Number.isSafeInteger(requestSeq) || requestSeq <= lastProcessedRequestSeq) {
      return false;
    }
    lastProcessedRequestSeq = requestSeq;
    return true;
  };

  const canConfirm = (observation: Observation, current: PlaybackAttempt) => {
    if (!isValidSnapshot(observation.snapshot)) return false;
    if (observation.requestStartedAt < current.startedAt) return false;
    if (observation.receivedAt < observation.requestStartedAt) return false;
    if (observation.receivedAt > current.startedAt + confirmationTimeoutMs) {
      return false;
    }
    if (observation.snapshot.isPlaying !== true) return false;
    return albumUriFromSnapshot(observation.snapshot) === current.targetAlbumUri;
  };

  const beginAttempt = ({
    attemptId,
    targetAlbumUri,
    startedAt = now(),
  }: {
    attemptId: string;
    targetAlbumUri: string;
    startedAt?: number;
  }) => {
    if (!attemptId || !targetAlbumUri) {
      throw new Error("attemptId y targetAlbumUri son obligatorios");
    }

    if (attempt && attempt.status === "pending") {
      attempt = { ...attempt, status: "superseded", reason: "SUPERSEDED_BY_NEW_ATTEMPT" };
    }

    ignoreObservationsStartedBeforeAt = startedAt;
    attempt = {
      id: attemptId,
      targetAlbumUri,
      startedAt,
      status: "pending",
      commandAcceptedAt: null,
      confirmedAt: null,
      reason: null,
    };

    return getState();
  };

  const markCommandAccepted = (attemptId: string, at = now()) => {
    if (!isCurrentPendingAttempt(attemptId)) return getState();
    attempt = { ...attempt, commandAcceptedAt: at };
    return getState();
  };

  const acceptSnapshot = (input: Observation & { attemptId: string }) => {
    const current = attempt;
    if (!current || input.attemptId !== current.id || current.status !== "pending") {
      return getState();
    }

    if (input.requestStartedAt < current.startedAt) return getState();
    if (!markRequestAsProcessed(input.requestSeq)) return getState();

    if (canConfirm(input, current)) {
      confirmedSnapshot = input.snapshot;
      attempt = {
        ...current,
        status: "confirmed",
        confirmedAt: input.receivedAt,
        reason: null,
      };
    }

    // While an attempt is pending, a paused target or a different album is
    // only provisional evidence and must not replace the last confirmed state.
    return getState();
  };

  const observeSnapshot = (input: Observation) => {
    if (!isValidSnapshot(input.snapshot)) return getState();
    if (input.receivedAt < input.requestStartedAt) return getState();
    if (input.requestStartedAt < ignoreObservationsStartedBeforeAt) return getState();

    if (attempt?.status === "pending") {
      // During a play attempt, only that attempt's own fresh target snapshot
      // may replace the confirmed snapshot. acceptSnapshot owns request ordering.
      return acceptSnapshot({ ...input, attemptId: attempt.id });
    }

    if (!markRequestAsProcessed(input.requestSeq)) return getState();
    confirmedSnapshot = input.snapshot;
    return getState();
  };

  const rejectAttempt = (attemptId: string, reason: string, at = now()) => {
    if (!isCurrentPendingAttempt(attemptId)) return getState();
    ignoreObservationsStartedBeforeAt = Math.max(ignoreObservationsStartedBeforeAt, at);
    attempt = { ...attempt, status: "failed", reason };
    return getState();
  };

  const expireAttempt = (attemptId: string, at = now()) => {
    if (!isCurrentPendingAttempt(attemptId)) return getState();
    if (at < attempt.startedAt + confirmationTimeoutMs) return getState();
    ignoreObservationsStartedBeforeAt = Math.max(ignoreObservationsStartedBeforeAt, at);
    attempt = { ...attempt, status: "degraded", reason: "CONFIRMATION_TIMEOUT" };
    return getState();
  };

  return {
    getState,
    beginAttempt,
    markCommandAccepted,
    acceptSnapshot,
    observeSnapshot,
    rejectAttempt,
    expireAttempt,
  };
}
