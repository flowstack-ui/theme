import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8"));
const sources = await Promise.all([
  "src/index.ts",
  "src/schema.ts",
  "src/types.ts",
  "src/define-theme.ts",
  "src/validation.ts",
  "src/cli.ts",
].map((path) => readFile(resolve(path), "utf8")));
const joined = sources.join("\n");

assert.equal(packageJson.name, "@flowstack-ui/theme");
assert.equal(packageJson.type, "module");
assert.equal(packageJson.sideEffects, false);
assert.deepEqual(packageJson.dependencies ?? {}, {}, "runtime dependencies are not allowed in the bootstrap");
assert.equal(packageJson.repository.url, "git+https://github.com/flowstack-ui/theme.git");
assert.equal(packageJson.bin["flowstack-theme"], "dist/cli.js");
assert.equal(packageJson.exports["./schema"].default, "./dist/schema.js");
assert.doesNotMatch(joined, /from\s+["'](?:react|@flowstack-ui\/brick|@flowstack-ui\/atom|@brick-ui\/colors)/u);
assert.doesNotMatch(joined, /localStorage|document\.|window\.|createContext|use client/u);
assert.match(joined, /flowstack\.theme\.v1/u);

console.log("Verified public source boundary.");
