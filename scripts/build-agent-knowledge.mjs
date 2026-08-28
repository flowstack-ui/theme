import assert from "node:assert/strict";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildAgentCoverage, coverageFailureMessage } from "./agent-catalog.mjs";

const check = process.argv.includes("--check");
const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const catalog = JSON.parse(await readFile(resolve(root, "agents/catalog.json"), "utf8"));
const sourceJson = resolve(root, "agents/theme-system.json");
const sourceMarkdown = resolve(root, "agents/theme-system.md");
const output = resolve(root, "dist/agents");
const guide = JSON.parse(await readFile(sourceJson, "utf8"));

function list(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function destinationLabel(destination) {
  if (destination.kind === "operation") return `${destination.id} (operation)`;
  if (destination.kind === "native-application") return `${destination.id} (native/application)`;
  if (destination.kind === "package") return `${destination.package}/${destination.id} (${destination.versionPolicy})`;
  throw new Error(`Unsupported guidance destination: ${JSON.stringify(destination)}`);
}

function renderMarkdown(data) {
  const decisionOrder = data.decisionOrder.map((item, index) => `${index + 1}. ${item}`).join("\n");
  const selection = data.selection.map(({ intent, use, note }) => `- **${intent}:** use ${use}.${note ? ` ${note}` : ""}`).join("\n");
  const rules = data.rules.map(({ level, statement }) => `- **${level.toUpperCase()}:** ${statement}`).join("\n");
  const ownership = Object.entries(data.ownership).map(([owner, items]) => `### ${owner[0].toUpperCase()}${owner.slice(1)}\n\n${list(items)}`).join("\n\n");
  const fallback = `1. ${data.nativeFallback.check}\n2. ${data.nativeFallback.use}\n3. ${data.nativeFallback.report}`;
  return `# ${data.name}\n\n## Purpose\n\n${data.purpose}\n\n## Decision order\n\n${decisionOrder}\n\n## Selection map\n\n${selection}\n\n## Rules\n\n${rules}\n\n## Ownership\n\n${ownership}\n\n## Native and application fallback\n\n${fallback}\n\n## Validation checklist\n\n${list(data.validation)}\n\n## Related guidance\n\n${list(data.related.map((item) => `\`${destinationLabel(item)}\``))}\n`;
}

assert.equal(guide.schema, "flowstack.agent-guide.v1");
assert.equal(guide.id, "theme-system");
assert.equal(guide.name, "FLOWSTACK Theme system");
assert.equal(guide.package, packageJson.name);
assert.equal(guide.layer, "theme");
assert.equal(guide.kind, "guide");
for (const key of ["decisionOrder", "selection", "rules", "validation", "related"]) {
  assert.ok(Array.isArray(guide[key]) && guide[key].length > 0, `${key} must be a non-empty array`);
}
for (const key of ["check", "use", "report"]) assert.ok(guide.nativeFallback?.[key], `nativeFallback.${key} is required`);
for (const selection of guide.selection) assert.ok(selection.intent && selection.use && selection.destinations?.length, "selection requires intent, use, and destinations");

const markdown = renderMarkdown(guide);
if (check) {
  assert.equal(await readFile(sourceMarkdown, "utf8").catch(() => ""), markdown, "agents/theme-system.md is stale; run npm run agents:build");
} else {
  await writeFile(sourceMarkdown, markdown);
}

const operations = catalog.operationOwners.map(({ id, name }) => ({ id, name, guide: "./theme-system.json" })).sort((a, b) => a.id.localeCompare(b.id));
const manifest = {
  schema: "flowstack.agent-manifest.v1",
  package: packageJson.name,
  packageVersion: packageJson.version,
  guides: [{ id: guide.id, name: guide.name, json: "./theme-system.json", markdown: "./theme-system.md" }],
  operations,
  coverage: "./coverage.json",
};
const coverage = await buildAgentCoverage({ packageRoot: root, manifest, guide });
const coverageFailure = coverageFailureMessage(coverage);
const files = new Map([
  ["manifest.json", `${JSON.stringify(manifest, null, 2)}\n`],
  ["coverage.json", `${JSON.stringify(coverage, null, 2)}\n`],
  ["theme-system.json", `${JSON.stringify(guide, null, 2)}\n`],
  ["theme-system.md", markdown],
]);

if (check) {
  const existingNames = (await readdir(output).catch(() => [])).sort();
  const expectedNames = [...files.keys()].sort();
  assert.deepEqual(existingNames, expectedNames, "dist/agents contains missing or unexpected output; run npm run agents:build");
  for (const [name, expected] of files) {
    assert.equal(await readFile(resolve(output, name), "utf8"), expected, `${name} is stale; run npm run agents:build`);
  }
} else {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await Promise.all([...files].map(([name, contents]) => writeFile(resolve(output, name), contents)));
}

if (coverageFailure) throw new Error(coverageFailure);
console.log(`${check ? "Verified" : "Built"} Theme Agent Knowledge: ${coverage.summary.guidedOperationOwners}/${coverage.summary.operationOwners} operations and ${coverage.summary.classifiedPublicSurfaces}/${coverage.summary.publicSurfaces} public surfaces.`);
