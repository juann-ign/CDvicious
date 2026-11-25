const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function clientRuntime(fetch) {
  const time = { now: Date.UTC(2026, 10, 21, 12) };
  class TestDate extends Date {
    static now() { return time.now; }
  }
  const module = { exports: {} };
  const source = fs.readFileSync("src/lib/albumTracksClient.ts", "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports: module.exports, module, fetch, AbortController, Date: TestDate, Intl });
  module.exports.syncAlbumTracksAuth(true);
  return { client: module.exports, time };
}

const rows = (name) => [{ id: name, uri: `spotify:track:${name}`, name, position: 7, duration_ms: 180000, disc_number: 2, track_number: 1, playable: true }];
const published = (name) => Response.json({ tracks: rows(name) });

test("ficha y Track listing comparten un pedido y reusan el tracklist acreditado por ID", async () => {
  const calls = [];
  let complete;
  const { client, time } = clientRuntime((url) => {
    calls.push(url);
    return new Promise((resolve) => { complete = resolve; });
  });
  const detail = client.loadAlbumTracks("edition-1");
  const listing = client.loadAlbumTracks("edition-1");
  assert.equal(detail, listing);
  assert.equal(calls.length, 1);
  complete(published("track-title"));
  const first = await detail;
  assert.deepEqual(first.tracks, rows("track-title"));
  assert.equal((await client.loadAlbumTracks("edition-1")).tracks, first.tracks);
  assert.equal(calls.length, 1);
  time.now += 6 * 60 * 1000;
  const refreshed = client.loadAlbumTracks("edition-1");
  complete(published("newer"));
  assert.equal((await refreshed).tracks[0].name, "newer");
  assert.deepEqual(calls, ["/api/album/edition-1/tracks", "/api/album/edition-1/tracks"]);
});

test("429 conserva la hora de Retry-After, protege otras ediciones y mantiene los datos completos disponibles", async () => {
  let calls = 0;
  const { client, time } = clientRuntime(async () => {
    calls++;
    if (calls !== 2) return published("cached-or-recovered");
    return Response.json({ reason: "QUOTA_EXCEEDED", sensitive: "private-body" }, { status: 429, headers: { "Retry-After": "7218" } });
  });
  await client.loadAlbumTracks("cached");
  const limited = await client.loadAlbumTracks("mosca");
  assert.equal(limited.tracks, null);
  assert.equal(limited.error.status, 429);
  assert.equal(limited.error.retryAt, time.now + 7_218_000);
  assert.equal(client.canRetryAlbumTracks(limited.error), false);
  assert.match(client.albumTracksErrorMessage(limited.error), /^Spotify agotó la cuota de pistas\./);
  assert.doesNotMatch(client.albumTracksErrorMessage(limited.error), /private-body/);
  assert.equal((await client.loadAlbumTracks("bang")).error, limited.error);
  assert.equal((await client.loadAlbumTracks("cached")).tracks[0].id, "cached-or-recovered");
  assert.equal(calls, 2);
  time.now += 7_218_000;
  assert.equal(client.canRetryAlbumTracks(limited.error), true);
  assert.equal((await client.loadAlbumTracks("bang")).tracks[0].id, "cached-or-recovered");
  assert.equal(calls, 3);
});

test("logout aborta el pedido anterior y 401 requiere reconexión en vez de reintentar", async () => {
  let previous;
  const calls = [];
  const { client } = clientRuntime((url, options) => {
    calls.push({ url, signal: options.signal });
    if (calls.length === 1) return new Promise((resolve) => { previous = resolve; });
    if (calls.length === 2) return Promise.resolve(published("new-session"));
    return Promise.resolve(Response.json({ error: "AUTH_REQUIRED" }, { status: 401 }));
  });
  const pending = client.loadAlbumTracks("same-album");
  client.syncAlbumTracksAuth(false);
  assert.equal(calls[0].signal.aborted, true);
  client.syncAlbumTracksAuth(true);
  assert.equal((await client.loadAlbumTracks("same-album")).tracks[0].name, "new-session");
  previous(published("old-session"));
  await pending;
  assert.equal((await client.loadAlbumTracks("same-album")).tracks[0].name, "new-session");
  const expired = await client.loadAlbumTracks("another-album");
  assert.equal(expired.error.status, 401);
  assert.equal(client.canRetryAlbumTracks(expired.error), false);
  assert.match(client.albumTracksErrorMessage(expired.error), /sesión de Spotify venció/);
  assert.equal((await client.loadAlbumTracks("same-album")).tracks, null);
  assert.equal(calls.length, 3);
});
