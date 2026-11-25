const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const loaded = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/artistCaseLayout.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: loaded, exports: loaded.exports, Map, Date });
const { compareArtistEditions } = loaded.exports;

test("fechas de edición válidas se ordenan sin fusionar nombres ni inventar fechas", () => {
  const items = [{ id: "missing" }, { id: "invalid", release_date: "1993-02-30" }, { id: "b", release_date: "2001" }, { id: "a", release_date: "1994-05-11" }, { id: "c", release_date: "2001-01-01" }, { id: "edition-2", release_date: "1994-05-11" }];
  const result = items.sort(compareArtistEditions);
  assert.deepEqual(result.map((item) => item.id), ["a", "edition-2", "b", "c", "invalid", "missing"]);
  assert.equal(result.at(-1).release_date, undefined);
});
