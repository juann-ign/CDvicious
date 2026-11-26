import assert from "node:assert/strict";
import test from "node:test";
import {
  beginPlaybackAttempt, confirmPlaybackSnapshot, failPlaybackAttempt,
  finishPlaybackAttempt, getConfirmedPlayback, getPlaybackState, markPlaybackDocked,
} from "../../src/lib/playbackSnapshotCoordinator.ts";

const deviceId = "web-device";
const album = (id) => ({ id, name: id, uri: `spotify:album:${id}`, artists: [], images: [] });
const observation = (id) => ({
  isPlaying: true, deviceId, sampledAt: Date.now(),
  track: { id: `track-${id}`, album: { id } },
});

test("la confirmación anterior sobrevive a una carga, un error y su reintento", () => {
  assert.equal(getPlaybackState().phase, "idle");
  assert.equal(getConfirmedPlayback(), null);

  const first = beginPlaybackAttempt(album("first"), deviceId);
  markPlaybackDocked(first.attemptId);
  assert.equal(confirmPlaybackSnapshot(first, observation("first"), first.startedAt), true);
  finishPlaybackAttempt(first.attemptId);
  const previous = getConfirmedPlayback();

  const failed = beginPlaybackAttempt(album("second"), deviceId);
  assert.equal(getConfirmedPlayback(), previous);
  assert.equal(getPlaybackState().phase, "loading");
  markPlaybackDocked(failed.attemptId);
  assert.equal(confirmPlaybackSnapshot(failed, observation("second"), failed.startedAt - 1), false);
  assert.equal(confirmPlaybackSnapshot(failed, observation("first"), failed.startedAt), false);
  assert.equal(confirmPlaybackSnapshot(failed, { ...observation("second"), isPlaying: false }, failed.startedAt), false);
  assert.equal(getConfirmedPlayback(), previous);
  failPlaybackAttempt(failed.attemptId, "Sin conexión");
  finishPlaybackAttempt(failed.attemptId);
  assert.equal(getPlaybackState().phase, "failed");
  assert.equal(getConfirmedPlayback(), previous);

  const retry = beginPlaybackAttempt(album("second"), deviceId);
  markPlaybackDocked(retry.attemptId);
  assert.notEqual(failed.attemptId, retry.attemptId);
  assert.equal(confirmPlaybackSnapshot(failed, observation("second"), retry.startedAt), false);
  assert.equal(getConfirmedPlayback(), previous);
  const fresh = observation("second");
  assert.equal(confirmPlaybackSnapshot(retry, fresh, retry.startedAt), true);
  assert.deepEqual(getConfirmedPlayback(), { attemptId: retry.attemptId, snapshot: fresh });
  finishPlaybackAttempt(retry.attemptId);
});
