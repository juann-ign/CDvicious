const fs = require("node:fs");
const path = require("node:path");
module.exports = class {
  constructor() {
    this.files = new Set();
  }
  write(type, test, step) {
    const file = path.join(test.parent.project().outputDir, "steps.jsonl");
    if (!this.files.has(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "");
      this.files.add(file);
    }
    fs.appendFileSync(file, JSON.stringify({ type, test: test.title, step: step.title, category: step.category,
      wall: Date.now(), mono: Number(process.hrtime.bigint() / 1000000n), duration: step.duration, error: step.error?.message }) + "\n");
  }
  onStepBegin(test, result, step) { this.write("begin", test, step); }
  onStepEnd(test, result, step) { this.write("end", test, step); }
};
