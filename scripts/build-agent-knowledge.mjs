import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const check = process.argv.includes("--check");
const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const sourceJson = resolve(root, "agents/theme-system.json");
const sourceMarkdown = resolve(root, "agents/theme-system.md");
const output = resolve(root, "dist/agents");
const guide = JSON.parse(await readFile(sourceJson, "utf8"));
const markdown = await readFile(sourceMarkdown, "utf8");

assert.equal(guide.schema, "flowstack.agent-guide.v1");
assert.equal(guide.id, "theme-system");
assert.equal(guide.name, "FLOWSTACK Theme system");
assert.equal(guide.package, packageJson.name);
assert.equal(guide.layer, "theme");
assert.equal(guide.kind, "guide");
assert.ok(Array.isArray(guide.decisionOrder) && guide.decisionOrder.length >= 5);
assert.ok(Array.isArray(guide.rules) && guide.rules.length >= 8);
assert.ok(Array.isArray(guide.validation) && guide.validation.length >= 5);
assert.match(markdown, /^# FLOWSTACK Theme system\n/u);
assert.match(markdown, /## Decision order/u);
assert.match(markdown, /## Validation checklist/u);

const manifest = {
  schema: "flowstack.agent-manifest.v1",
  package: packageJson.name,
  packageVersion: packageJson.version,
  guides: [{
    id: guide.id,
    name: guide.name,
    json: "./theme-system.json",
    markdown: "./theme-system.md",
  }],
};
const files = new Map([
  ["manifest.json", `${JSON.stringify(manifest, null, 2)}\n`],
  ["theme-system.json", `${JSON.stringify(guide, null, 2)}\n`],
  ["theme-system.md", markdown.endsWith("\n") ? markdown : `${markdown}\n`],
]);

if (check) {
  for (const [name, expected] of files) {
    assert.equal(await readFile(resolve(output, name), "utf8"), expected, `${name} is stale; run npm run agents:build`);
  }
  console.log("Verified Theme Agent Knowledge artifacts.");
} else {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await Promise.all([...files].map(([name, contents]) => writeFile(resolve(output, name), contents)));
  console.log("Built Theme Agent Knowledge artifacts.");
}
