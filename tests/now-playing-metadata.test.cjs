const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(source, dependencies, globals = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require: (name) => dependencies[name], Response, Request, URL, URLSearchParams, Headers, Date, Number, console, ...globals });
  return module.exports;
}

test("now-playing conserva la duración de la pista live que identifica la consulta de letras", async () => {
  const constants = load(fs.readFileSync("src/lib/constants.ts", "utf8"), {});
  const spotify = load(fs.readFileSync("src/lib/spotify.ts", "utf8"), {
    "node:crypto": require("node:crypto"), "./constants": constants,
  }, {
    process: { env: {} },
    fetch: async () => Response.json({
      is_playing: true, progress_ms: 12500, device: { id: "device-fixture" },
      item: { id: "track-fixture", name: "Duración exacta", duration_ms: 243750,
        artists: [{ name: "Artista fixture" }], album: { name: "Edición fixture", images: [] } },
    }),
  });
  const data = await spotify.fetchNowPlaying("fixture-access-token");
  assert.equal(data.durationMs, 243750);
  assert.equal(data.track.duration_ms, data.durationMs);
  assert.equal(data.track.id, "track-fixture");
  assert.equal(data.deviceId, "device-fixture");
});
