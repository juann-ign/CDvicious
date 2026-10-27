import test from "node:test";
import assert from "node:assert/strict";

// Test-first contract: this module is intentionally not implemented in the
// production tree yet. Keep the coordinator pure so its transitions can be
// tested deterministically without a browser, Spotify SDK, network, or timers.
const coordinatorUrl = new URL(
  "../../src/lib/playbackSnapshotCoordinator.ts",
  import.meta.url,
);

let createPlaybackSnapshotCoordinator;
let coordinatorImportError;

try {
  ({ createPlaybackSnapshotCoordinator } = await import(coordinatorUrl.href));
} catch (error) {
  coordinatorImportError = error;
}

const OLD_ALBUM_URI = "spotify:album:old-confirmed";
const TARGET_ALBUM_URI = "spotify:album:target";
const OTHER_ALBUM_URI = "spotify:album:other";

function snapshot({
  albumUri = OLD_ALBUM_URI,
  albumName = "Old confirmed album",
  artist = "Previous Artist",
  trackId = "old-track",
  trackName = "Old track",
  isPlaying = true,
} = {}) {
  return {
    isPlaying,
    progressMs: isPlaying ? 12_000 : 0,
    durationMs: 180_000,
    track: {
      id: trackId,
      uri: `spotify:track:${trackId}`,
      name: trackName,
      artists: [{ name: artist }],
      duration_ms: 180_000,
      album: {
        id: albumUri.replace("spotify:album:", ""),
        uri: albumUri,
        name: albumName,
        images: [],
      },
    },
  };
}

const OLD_SNAPSHOT = snapshot();
const TARGET_SNAPSHOT = snapshot({
  albumUri: TARGET_ALBUM_URI,
  albumName: "Target album",
  artist: "Target Artist",
  trackId: "target-track",
  trackName: "Target track",
});
const OTHER_SNAPSHOT = snapshot({
  albumUri: OTHER_ALBUM_URI,
  albumName: "Other album",
  artist: "Other Artist",
  trackId: "other-track",
  trackName: "Other track",
});

function coordinator(initialSnapshot = OLD_SNAPSHOT) {
  assert.equal(
    typeof createPlaybackSnapshotCoordinator,
    "function",
    [
      "Missing test subject: implement src/lib/playbackSnapshotCoordinator.ts",
      "with export createPlaybackSnapshotCoordinator({ initialSnapshot, confirmationTimeoutMs, now }).",
      "The test-first branch intentionally defines the contract before production implementation.",
      coordinatorImportError ? `Import error: ${coordinatorImportError.message}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return createPlaybackSnapshotCoordinator({
    initialSnapshot,
    confirmationTimeoutMs: 15_000,
    now: () => 100,
  });
}

function begin(coordinatorInstance, {
  attemptId = "attempt-1",
  targetAlbumUri = TARGET_ALBUM_URI,
  startedAt = 100,
  requestSeqAtStart,
} = {}) {
  coordinatorInstance.beginAttempt({ attemptId, targetAlbumUri, startedAt, requestSeqAtStart });
  return attemptId;
}

function acceptTarget(coordinatorInstance, {
  attemptId = "attempt-1",
  requestSeq = 2,
  requestStartedAt = 101,
  receivedAt = 120,
  data = TARGET_SNAPSHOT,
} = {}) {
  coordinatorInstance.acceptSnapshot({
    attemptId,
    requestSeq,
    requestStartedAt,
    receivedAt,
    snapshot: data,
  });
}

function state(coordinatorInstance) {
  return coordinatorInstance.getState();
}

test("carga inicial: expone el snapshot válido sin crear un intento ficticio", () => {
  const subject = coordinator();
  assert.deepEqual(state(subject).confirmedSnapshot, OLD_SNAPSHOT);
  assert.equal(state(subject).attempt, null);
});

test("un HTTP 200 de /api/play deja el intento pendiente y conserva el snapshot anterior", () => {
  const subject = coordinator();
  const attemptId = begin(subject);

  subject.markCommandAccepted(attemptId, 110);

  assert.equal(state(subject).attempt.id, attemptId);
  assert.equal(state(subject).attempt.status, "pending");
  assert.deepEqual(state(subject).confirmedSnapshot, OLD_SNAPSHOT);
});

test("solo un snapshot fresco del álbum objetivo con isPlaying=true confirma", () => {
  const subject = coordinator();
  const attemptId = begin(subject);

  subject.markCommandAccepted(attemptId, 110);
  acceptTarget(subject, { attemptId });

  assert.equal(state(subject).attempt.status, "confirmed");
  assert.equal(state(subject).confirmedSnapshot.track.album.uri, TARGET_ALBUM_URI);
  assert.equal(state(subject).confirmedSnapshot.isPlaying, true);
});

test("el snapshot del álbum objetivo pausado no confirma el intento", () => {
  const subject = coordinator();
  const attemptId = begin(subject);
  const pausedTarget = snapshot({
    ...{
      albumUri: TARGET_ALBUM_URI,
      albumName: "Target album",
      artist: "Target Artist",
      trackId: "target-track",
      trackName: "Target track",
    },
    isPlaying: false,
  });

  subject.markCommandAccepted(attemptId, 110);
  acceptTarget(subject, { attemptId, data: pausedTarget });

  assert.equal(state(subject).attempt.status, "pending");
  assert.deepEqual(state(subject).confirmedSnapshot, OLD_SNAPSHOT);
});

test("una pausa observada después de la carga cambia el estado sin cambiar la pista", () => {
  const subject = coordinator();
  const paused = { ...OLD_SNAPSHOT, isPlaying: false, progressMs: 12_000 };

  subject.observeSnapshot({
    requestSeq: 2,
    requestStartedAt: 110,
    receivedAt: 120,
    snapshot: paused,
  });

  assert.equal(state(subject).confirmedSnapshot.track.id, OLD_SNAPSHOT.track.id);
  assert.equal(state(subject).confirmedSnapshot.isPlaying, false);
});

test("un cambio de pista observado actualiza track y mantiene el estado real de reproducción", () => {
  const subject = coordinator();
  const nextTrack = snapshot({
    albumUri: OLD_ALBUM_URI,
    albumName: "Old confirmed album",
    artist: "Previous Artist",
    trackId: "next-track",
    trackName: "Next track",
    isPlaying: true,
  });

  subject.observeSnapshot({
    requestSeq: 2,
    requestStartedAt: 110,
    receivedAt: 120,
    snapshot: nextTrack,
  });

  assert.equal(state(subject).confirmedSnapshot.track.id, "next-track");
  assert.equal(state(subject).confirmedSnapshot.track.name, "Next track");
  assert.equal(state(subject).confirmedSnapshot.isPlaying, true);
});

test("una consulta iniciada antes de Play no confirma aunque llegue después y coincida", () => {
  const subject = coordinator();
  const attemptId = begin(subject, { startedAt: 100 });

  subject.acceptSnapshot({
    attemptId,
    requestSeq: 1,
    requestStartedAt: 90,
    receivedAt: 130,
    snapshot: TARGET_SNAPSHOT,
  });

  assert.equal(state(subject).attempt.status, "pending");
  assert.deepEqual(state(subject).confirmedSnapshot, OLD_SNAPSHOT);
});

test("una consulta ya emitida antes de Play no confirma aunque tenga el mismo timestamp", () => {
  const subject = coordinator();
  const attemptId = begin(subject, { requestSeqAtStart: 4 });

  subject.acceptSnapshot({
    attemptId,
    requestSeq: 4,
    requestStartedAt: 100,
    receivedAt: 120,
    snapshot: TARGET_SNAPSHOT,
  });

  assert.equal(state(subject).attempt.status, "pending");
  assert.deepEqual(state(subject).confirmedSnapshot, OLD_SNAPSHOT);
});

test("una respuesta vieja que llega fuera de orden no pisa un snapshot más reciente", () => {
  const subject = coordinator();

  subject.observeSnapshot({
    requestSeq: 8,
    requestStartedAt: 180,
    receivedAt: 200,
    snapshot: TARGET_SNAPSHOT,
  });
  subject.observeSnapshot({
    requestSeq: 7,
    requestStartedAt: 160,
    receivedAt: 220,
    snapshot: OLD_SNAPSHOT,
  });

  assert.equal(state(subject).confirmedSnapshot.track.album.uri, TARGET_ALBUM_URI);
  assert.equal(state(subject).confirmedSnapshot.track.id, TARGET_SNAPSHOT.track.id);
});

test("un snapshot de otra pista no confirma el objetivo solicitado", () => {
  const subject = coordinator();
  const attemptId = begin(subject);

  subject.markCommandAccepted(attemptId, 110);
  acceptTarget(subject, { attemptId, data: OTHER_SNAPSHOT });

  assert.equal(state(subject).attempt.status, "pending");
  assert.deepEqual(state(subject).confirmedSnapshot, OLD_SNAPSHOT);
});

test("un evento del intento A no confirma ni modifica el intento B superpuesto", () => {
  const subject = coordinator();
  begin(subject, {
    attemptId: "attempt-A",
    targetAlbumUri: TARGET_ALBUM_URI,
    startedAt: 100,
  });
  begin(subject, {
    attemptId: "attempt-B",
    targetAlbumUri: OTHER_ALBUM_URI,
    startedAt: 130,
  });

  acceptTarget(subject, {
    attemptId: "attempt-A",
    requestSeq: 2,
    requestStartedAt: 110,
    receivedAt: 150,
    data: TARGET_SNAPSHOT,
  });

  assert.equal(state(subject).attempt.id, "attempt-B");
  assert.equal(state(subject).attempt.status, "pending");
  assert.deepEqual(state(subject).confirmedSnapshot, OLD_SNAPSHOT);

  acceptTarget(subject, {
    attemptId: "attempt-B",
    requestSeq: 3,
    requestStartedAt: 131,
    receivedAt: 160,
    data: OTHER_SNAPSHOT,
  });

  assert.equal(state(subject).attempt.status, "confirmed");
  assert.equal(state(subject).confirmedSnapshot.track.album.uri, OTHER_ALBUM_URI);
});

test("fallo de autenticación termina el intento y preserva el snapshot confirmado", () => {
  const subject = coordinator();
  const attemptId = begin(subject);

  subject.rejectAttempt(attemptId, "AUTH_REQUIRED", 120);

  assert.equal(state(subject).attempt.status, "failed");
  assert.equal(state(subject).attempt.reason, "AUTH_REQUIRED");
  assert.deepEqual(state(subject).confirmedSnapshot, OLD_SNAPSHOT);
});

test("dispositivo no disponible termina el intento y preserva el snapshot confirmado", () => {
  const subject = coordinator();
  const attemptId = begin(subject);

  subject.rejectAttempt(attemptId, "DEVICE_NOT_AVAILABLE", 120);

  assert.equal(state(subject).attempt.status, "failed");
  assert.equal(state(subject).attempt.reason, "DEVICE_NOT_AVAILABLE");
  assert.deepEqual(state(subject).confirmedSnapshot, OLD_SNAPSHOT);
});

test("error de red no fabrica éxito y permite un nuevo intento que sí confirma", () => {
  const subject = coordinator();
  const firstAttemptId = begin(subject, { attemptId: "network-failure" });

  subject.rejectAttempt(firstAttemptId, "NETWORK_ERROR", 120);
  assert.equal(state(subject).attempt.status, "failed");
  assert.deepEqual(state(subject).confirmedSnapshot, OLD_SNAPSHOT);

  const retryAttemptId = begin(subject, {
    attemptId: "network-retry",
    targetAlbumUri: TARGET_ALBUM_URI,
    startedAt: 200,
  });
  subject.markCommandAccepted(retryAttemptId, 210);
  acceptTarget(subject, {
    attemptId: retryAttemptId,
    requestSeq: 2,
    requestStartedAt: 201,
    receivedAt: 230,
    data: TARGET_SNAPSHOT,
  });

  assert.equal(state(subject).attempt.id, retryAttemptId);
  assert.equal(state(subject).attempt.status, "confirmed");
  assert.equal(state(subject).confirmedSnapshot.track.album.uri, TARGET_ALBUM_URI);
  assert.equal(state(subject).confirmedSnapshot.isPlaying, true);
});

test("flight delayed beyond 15s does not time out snapshot confirmation before playback resumes", () => {
  const subject = coordinator();
  const attemptId = "slow-flight";
  subject.beginAttempt({
    attemptId,
    targetAlbumUri: TARGET_ALBUM_URI,
    startedAt: 100,
    deferConfirmation: true,
  });
  subject.markCommandAccepted(attemptId, 120);

  // Software WebGL may take longer than the nominal flight duration.
  // Until the player resumes, no snapshot confirmation timeout has started.
  subject.expireAttempt(attemptId, 20_000);
  assert.equal(state(subject).attempt.status, "pending");
  assert.deepEqual(state(subject).confirmedSnapshot, OLD_SNAPSHOT);

  subject.startConfirmation(attemptId, 20_000);
  subject.expireAttempt(attemptId, 25_000);
  assert.equal(state(subject).attempt.status, "pending");

  acceptTarget(subject, {
    attemptId,
    requestSeq: 3,
    requestStartedAt: 20_005,
    receivedAt: 20_100,
    data: TARGET_SNAPSHOT,
  });
  assert.equal(state(subject).attempt.status, "confirmed");
  assert.deepEqual(state(subject).confirmedSnapshot, TARGET_SNAPSHOT);
});

test("snapshot confirmation still expires 15s after resume, and late confirmation is discarded", () => {
  const subject = coordinator();
  const attemptId = "slow-confirmation";
  subject.beginAttempt({
    attemptId,
    targetAlbumUri: TARGET_ALBUM_URI,
    startedAt: 100,
    deferConfirmation: true,
  });
  subject.startConfirmation(attemptId, 20_000);
  subject.expireAttempt(attemptId, 34_999);
  assert.equal(state(subject).attempt.status, "pending");
  subject.expireAttempt(attemptId, 35_000);
  assert.equal(state(subject).attempt.status, "degraded");

  acceptTarget(subject, {
    attemptId,
    requestSeq: 4,
    requestStartedAt: 20_001,
    receivedAt: 35_100,
    data: TARGET_SNAPSHOT,
  });
  assert.equal(state(subject).attempt.status, "degraded");
  assert.deepEqual(state(subject).confirmedSnapshot, OLD_SNAPSHOT);
});

test("timeout pasa a degraded, conserva el snapshot y un evento tardío no revive el intento", () => {
  const subject = coordinator();
  const attemptId = begin(subject);

  subject.expireAttempt(attemptId, 15_100);
  assert.equal(state(subject).attempt.status, "degraded");
  assert.deepEqual(state(subject).confirmedSnapshot, OLD_SNAPSHOT);

  acceptTarget(subject, {
    attemptId,
    requestSeq: 2,
    requestStartedAt: 101,
    receivedAt: 15_200,
    data: TARGET_SNAPSHOT,
  });

  assert.equal(state(subject).attempt.status, "degraded");
  assert.deepEqual(state(subject).confirmedSnapshot, OLD_SNAPSHOT);
});
