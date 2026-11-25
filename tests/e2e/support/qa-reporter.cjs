const fs = require("node:fs");
const path = require("node:path");
module.exports = class {
  onBegin(config) {
    this.file = path.resolve(config.rootDir, "../../.qa/BASE-01/steps.jsonl");
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, "");
  }
  write(type, test, step) {
    fs.appendFileSync(this.file, JSON.stringify({ type, test: test.title, step: step.title, category: step.category,
      wall: Date.now(), mono: Number(process.hrtime.bigint() / 1000000n), duration: step.duration, error: step.error?.message }) + "\n");
  }
  onStepBegin(test, result, step) { this.write("begin", test, step); }
  onStepEnd(test, result, step) { this.write("end", test, step); }
};
