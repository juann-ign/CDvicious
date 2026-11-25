const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: name => dependencies[name], AbortController, Response, URL, ...globals });
  return module.exports;
}
const api = () => load('src/lib/canonicalPlayerControls.ts');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = () => new Promise(resolve => setImmediate(resolve));
function player(volume = .37) {
  return { writes: [], transports: [], value: volume,
    async getVolume() { return this.value; },
    async setVolume(value) { this.writes.push(value); this.value = value; },
    async togglePlay() { this.transports.push('toggle'); },
    async previousTrack() { this.transports.push('previous'); },
    async nextTrack() { this.transports.push('next'); },
  };
}
const target = (port, deviceId = 'sdk-a', sdkDeviceId = deviceId) => ({ player: port, deviceId, sdkDeviceId });
const readable = async (owner) => ({ volumeSupported: true, transportSupported: true, volume: await owner.player.getVolume() });

test('real initial volume remains unknown while loading, then publishes the measured value', async () => {
  const waiting = deferred(), controls = api().createCanonicalPlayerControls(() => waiting.promise);
  controls.configure(target(player()));
  assert.equal(controls.getSnapshot().volume, null);
  assert.equal(controls.getSnapshot().volumeLoading, true);
  waiting.resolve({ volumeSupported: true, transportSupported: true, volume: .37 }); await settle();
  assert.equal(controls.getSnapshot().volume, .37);
  assert.equal(controls.getSnapshot().volumeAvailable, true);
});

test('a late device capability response cannot replace the current destination volume', async () => {
  const old = deferred(), controls = api().createCanonicalPlayerControls(owner => owner.deviceId === 'a' ? old.promise : Promise.resolve({ volumeSupported: true, transportSupported: true, volume: .73 }));
  controls.configure(target(player(), 'a')); controls.configure(target(player(), 'b')); await settle();
  old.resolve({ volumeSupported: true, transportSupported: true, volume: .1 }); await settle();
  assert.equal(controls.getSnapshot().deviceId, 'b'); assert.equal(controls.getSnapshot().volume, .73);
});

test('late reads cannot restore an older value after the user changes volume', async () => {
  let reads = 0; const old = deferred(), port = player();
  const controls = api().createCanonicalPlayerControls(owner => ++reads === 1 ? readable(owner) : old.promise);
  controls.configure(target(port)); await settle();
  const refresh = controls.refreshVolume(); controls.setVolume(.8); await settle();
  assert.equal(controls.getSnapshot().volumeLoading, false, 'A background read must not disable an active drag');
  old.resolve({ volumeSupported: true, transportSupported: true, volume: .1 }); await refresh;
  assert.equal(controls.getSnapshot().volume, .8); assert.equal(port.value, .8);
});

test('rapid changes coalesce before the first call and while a write is pending', async () => {
  const port = player(), write = deferred();
  port.setVolume = async function(value) { this.writes.push(value); if (this.writes.length === 1) await write.promise; this.value = value; };
  const controls = api().createCanonicalPlayerControls(readable); controls.configure(target(port)); await settle();
  controls.setVolume(.2); controls.setVolume(.4); controls.setVolume(.6); await settle();
  assert.deepEqual(port.writes, [.6]);
  controls.setVolume(.3); controls.setVolume(.7); controls.setVolume(.9);
  write.resolve(); await settle();
  assert.deepEqual(port.writes, [.6, .9]); assert.equal(controls.getSnapshot().volume, .9); assert.equal(controls.getSnapshot().volumePending, false);
});

test('old writes and queued values cannot overwrite a new device', async () => {
  const old = player(), next = player(.65), wait = deferred();
  old.setVolume = async function(value) { this.writes.push(value); await wait.promise; this.value = value; };
  const controls = api().createCanonicalPlayerControls(readable); controls.configure(target(old, 'a')); await settle();
  controls.setVolume(.2); await settle(); controls.setVolume(.9);
  controls.configure(target(next, 'b')); await settle(); controls.setVolume(.8);
  wait.resolve(); await settle();
  assert.deepEqual(old.writes, [.2]); assert.deepEqual(next.writes, [.8]); assert.equal(controls.getSnapshot().volume, .8);
});

test('flight lock drops queued UI changes, rejects controls, and refreshes restored real volume', async () => {
  const port = player(), controls = api().createCanonicalPlayerControls(readable); controls.configure(target(port)); await settle();
  controls.setVolume(.9); controls.setBlocked(true); await settle();
  assert.deepEqual(port.writes, []);
  controls.setVolume(.7); await controls.next(); assert.deepEqual(port.transports, []);
  port.value = .37; controls.setBlocked(false); await settle();
  assert.equal(controls.getSnapshot().volume, .37); assert.equal(controls.getSnapshot().volumePending, false);
});

test('unsupported and external destinations expose their real read but never issue SDK writes', async () => {
  const port = player(), controls = api().createCanonicalPlayerControls(async () => ({ volumeSupported: false, transportSupported: true, volume: .4 }));
  controls.configure(target(port)); await settle(); controls.setVolume(.8);
  assert.equal(controls.getSnapshot().volumeAvailable, false); assert.equal(controls.getSnapshot().canControl, true); assert.deepEqual(port.writes, []);
  controls.configure(target(port, 'external', 'sdk')); await settle(); await controls.next();
  assert.equal(controls.getSnapshot().canControl, false); assert.equal(controls.getSnapshot().volume, .4); assert.deepEqual(port.transports, []);
});

test('a rejected write reports an error and cannot poison a later successful change', async () => {
  const port = player(); let fail = true;
  port.setVolume = async function(value) { if (fail) throw new Error('fixture rejected'); this.value = value; };
  const controls = api().createCanonicalPlayerControls(readable); controls.configure(target(port)); await settle();
  controls.setVolume(.8); await settle(); assert.match(controls.getSnapshot().volumeError, /No se pudo/); assert.equal(controls.getSnapshot().volume, .37);
  fail = false; controls.setVolume(.6); await settle(); assert.equal(controls.getSnapshot().volume, .6); assert.equal(controls.getSnapshot().volumeError, null);
});

test('a failed volume capability read keeps the ready local SDK transport usable without inventing volume', async () => {
  const port = player(), controls = api().createCanonicalPlayerControls(async () => { throw new Error('fixture capability rejected'); });
  controls.configure(target(port)); await settle();
  assert.equal(controls.getSnapshot().volume, null); assert.equal(controls.getSnapshot().volumeAvailable, false);
  assert.equal(controls.getSnapshot().canControl, true); await controls.next(); assert.deepEqual(port.transports, ['next']);
});

test('mute restores the last measured nonzero volume and transport admits one pending command', async () => {
  const port = player(), pending = deferred(); port.togglePlay = async function() { this.transports.push('toggle'); await pending.promise; };
  const controls = api().createCanonicalPlayerControls(readable); controls.configure(target(port)); await settle();
  controls.toggleMute(); await settle(); controls.toggleMute(); await settle(); assert.deepEqual(port.writes, [0, .37]);
  const first = controls.toggle(); await controls.toggle(); assert.deepEqual(port.transports, ['toggle']); pending.resolve(); await first;
  await controls.previous(); await controls.next(); assert.deepEqual(port.transports, ['toggle', 'previous', 'next']);
});

test('direct selection shares the transport lane and clears pending after confirmation', async () => {
  const port = player(), pending = deferred(), requests = [];
  const controls = api().createCanonicalPlayerControls(readable, (owner, selection) => {
    requests.push({ owner, selection }); return pending.promise;
  });
  controls.configure(target(port)); await settle();
  const selection = { albumId: 'album-a', trackId: 'track-b', position: 1 };
  const first = controls.selectTrack(selection);
  assert.equal(controls.getSnapshot().pendingTrackId, 'track-b');
  assert.equal(controls.getSnapshot().transportPending, true);
  assert.equal(await controls.selectTrack({ ...selection, trackId: 'track-c', position: 2 }), false);
  await controls.next();
  assert.equal(requests.length, 1);
  assert.deepEqual(port.transports, []);
  assert.deepEqual(port.writes, []);
  pending.resolve(); assert.equal(await first, true);
  assert.equal(controls.getSnapshot().pendingTrackId, null);
  assert.equal(controls.getSnapshot().transportPending, false);
});

test('device changes and album loads abort track selection and ignore late completion', async () => {
  const firstRequest = deferred(), secondRequest = deferred(), requests = [];
  const controls = api().createCanonicalPlayerControls(readable, (owner, selection, signal) => {
    requests.push({ owner, selection, signal });
    return requests.length === 1 ? firstRequest.promise : secondRequest.promise;
  });
  const selection = { albumId: 'album-a', trackId: 'track-b', position: 1 };
  controls.configure(target(player(), 'old')); await settle();
  const first = controls.selectTrack(selection);
  controls.configure(target(player(), 'next')); await settle();
  assert.equal(requests[0].signal.aborted, true);
  const second = controls.selectTrack({ ...selection, trackId: 'track-c', position: 2 });
  firstRequest.reject(new Error('Late previous provider response'));
  assert.equal(await first, false);
  assert.equal(controls.getSnapshot().pendingTrackId, 'track-c');
  assert.equal(controls.getSnapshot().transportError, null);
  controls.setBlocked(true);
  assert.equal(requests[1].signal.aborted, true);
  secondRequest.resolve(); assert.equal(await second, false);
  assert.equal(controls.getSnapshot().transportPending, false);
  assert.equal(controls.getSnapshot().pendingTrackId, null);
});

test('SDK command serialization lets prior UI writes settle before flight reads/mute/restore', async () => {
  const { serializedPlayerVolume } = load('src/lib/serializedPlayerVolume.ts');
  const raw = player(), wait = deferred();
  raw.setVolume = async function(value) { this.writes.push(value); if (value === .8) await wait.promise; this.value = value; };
  const port = serializedPlayerVolume(raw);
  assert.equal(serializedPlayerVolume(raw), port);
  const pending = port.setVolume(.8); let snapshot;
  const read = port.getVolume().then(value => { snapshot = value; });
  await settle(); assert.equal(snapshot, undefined); wait.resolve(); await pending; await read;
  assert.equal(snapshot, .8); await port.setVolume(0); await port.setVolume(snapshot); assert.equal(raw.value, .8);
});

test('serialized SDK rejection does not block the flight restore that follows', async () => {
  const { serializedPlayerVolume } = load('src/lib/serializedPlayerVolume.ts');
  const raw = player(); raw.setVolume = async function(value) { if (value === .8) throw new Error('fixture'); this.value = value; };
  const port = serializedPlayerVolume(raw); await assert.rejects(port.setVolume(.8)); await port.setVolume(.37); assert.equal(await port.getVolume(), .37);
});

function capabilityRoute(devices, { status = 200, retryAfter, mock = false } = {}) {
  let calls = 0;
  const route = load('src/app/api/player-capabilities/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/session': { getValidAccessToken: async () => 'fictional-token' },
    '@/lib/spotify': { fetchSpotifyWebApi: async () => { calls++; return Response.json({ devices }, { status, headers: retryAfter ? { 'Retry-After': retryAfter } : {} }); } },
  }, { process: { env: { NEXT_PUBLIC_SPOTIFY_MOCK: mock ? '1' : '0' } } });
  return { ...route, calls: () => calls };
}
const request = id => ({ nextUrl: new URL(`http://local/api/player-capabilities?deviceId=${id}`) });
test('capabilities read the requested device, preserve unsupported volume and reject missing devices', async () => {
  const route = capabilityRoute([{ id: 'a', supports_volume: true, volume_percent: 37 }, { id: 'b', supports_volume: false, volume_percent: 81 }]);
  assert.deepEqual(await (await route.GET(request('a'))).json(), { deviceId: 'a', volumeSupported: true, transportSupported: true, volume: .37 });
  assert.equal((await (await route.GET(request('b'))).json()).volumeSupported, false);
  assert.equal((await route.GET(request('missing'))).status, 404);
});
test('capability rate limits carry Retry-After; mock does not query the provider', async () => {
  const blocked = capabilityRoute([], { status: 429, retryAfter: '7' });
  const response = await blocked.GET(request('a')); assert.equal(response.status, 429); assert.equal(response.headers.get('Retry-After'), '7');
  const mock = capabilityRoute([], { mock: true }); await mock.GET(request('a')); assert.equal(mock.calls(), 0);
});
