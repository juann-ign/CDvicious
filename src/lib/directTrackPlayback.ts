import type { NowPlayingResponse } from "@/types/spotify";
import type { ControlTarget, TrackSelection } from "./canonicalPlayerControls";
import type { PlaybackState } from "./playbackSnapshotCoordinator";

interface TrackPlaybackPorts {
  readBaseline?: () => NowPlayingResponse | null;
  read: () => { data: NowPlayingResponse | null; requestStartedAt?: number };
  subscribe: (listener: () => void) => () => void;
  request: (target: ControlTarget, selection: TrackSelection, signal: AbortSignal) => Promise<void>;
  refresh: () => void;
}

/** The face can already show the confirmed CD before the poll catches up. */
export function createTrackSelectionBaseline(
  readObserved: () => NowPlayingResponse | null,
  readHandoff: () => Pick<PlaybackState, "phase" | "attempt" | "snapshot">,
) {
  let releasedAttempt: string | null = null;
  return () => {
    const observed = readObserved();
    const { phase, attempt, snapshot } = readHandoff();
    if (phase !== "confirmed" || !attempt || snapshot?.sampledAt === undefined) return observed;
    if (observed && (observed.sampledAt ?? 0) >= snapshot.sampledAt) releasedAttempt = attempt.attemptId;
    if (releasedAttempt === attempt.attemptId || (observed?.deviceId && observed.deviceId !== snapshot.deviceId)) return observed;
    return snapshot;
  };
}

const matchesSelection = (snapshot: NowPlayingResponse, selection: TrackSelection) =>
  snapshot.track?.id === selection.trackId ||
  !!selection.linkedFromId && snapshot.track?.id === selection.linkedFromId;

export function createDirectTrackPlayback({ readBaseline, read, subscribe, request, refresh }: TrackPlaybackPorts) {
  return async (target: ControlTarget, selection: TrackSelection, ownership: AbortSignal): Promise<void> => {
    const before = readBaseline ? readBaseline() : read().data;
    if (!before || before.deviceId !== target.deviceId || target.deviceId !== target.sdkDeviceId ||
      before.track?.album.id !== selection.albumId) {
      throw new Error("El disco o el dispositivo activo cambió. Volvé a elegir la pista.");
    }
    const startedAt = Date.now();
    const deadline = AbortSignal.timeout(12_000);
    const signal = AbortSignal.any([ownership, deadline]);
    try {
      signal.throwIfAborted();
      await request(target, selection, signal);
      signal.throwIfAborted();
      refresh();
      // The canonical store already observes the SDK. Confirm using that same
      // source so an accepted command cannot select a row or replace its lyrics.
      await new Promise<void>((resolve, reject) => {
        const dispose = () => {
          unsubscribe();
          signal.removeEventListener("abort", onAbort);
        };
        const onAbort = () => { dispose(); reject(signal.reason); };
        const check = () => {
          const { data: current, requestStartedAt } = read();
          // Reject a late HTTP reply from an observation started before this
          // command, using the client's clock rather than the server's stamp.
          if (requestStartedAt === undefined || requestStartedAt < startedAt) return;
          if (!current || current === before || current.deviceId !== target.deviceId || current.track?.album.id !== selection.albumId ||
            !current.isPlaying || !matchesSelection(current, selection)) return;
          if (before.sampledAt !== undefined && (current.sampledAt === undefined || current.sampledAt < before.sampledAt)) return;
          // Selecting the current track restarts it. A fresh poll at the old
          // position would still carry the same track ID.
          if (matchesSelection(before, selection) && (current.progressMs === null || current.progressMs > Date.now() - startedAt + 1_500)) return;
          dispose(); resolve();
        };
        const unsubscribe = subscribe(check);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
        else check();
      });
    } catch (error) {
      if (deadline.aborted && !ownership.aborted) throw new Error("Spotify no confirmó la pista seleccionada. Podés intentarlo de nuevo.");
      throw error;
    }
  };
}
