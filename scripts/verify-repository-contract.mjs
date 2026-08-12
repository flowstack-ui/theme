import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import configuration from "../verification.config.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8"));
const errors = [];

async function requirePath(path) {
  try {
    await access(resolve(repositoryRoot, path));
  } catch {
    errors.push(`missing ${path}`);
  }
}

for (const path of [
  "AGENTS.md",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  ".nvmrc",
  "package-lock.json",
  "docs/architecture.md",
  "docs/agent-knowledge.md",
  "docs/appearances-and-portals.md",
  "docs/authoring.md",
  "docs/fonts.md",
  "docs/installation.md",
  "docs/migration.md",
  "docs/testing.md",
  "docs/troubleshooting.md",
  "agents/theme-system.json",
  "agents/theme-system.md",
  "scripts/build-agent-knowledge.mjs",
  "src/index.ts",
  "src/schema.ts",
  "src/validation.ts",
  "src/compiler.ts",
  "src/artifacts.ts",
]) {
  await requirePath(path);
}

if (configuration.schemaVersion !== 1) errors.push("unsupported verification schema");
if (configuration.id !== "theme") errors.push(`verification id is ${configuration.id}`);
if (configuration.kind !== "public-package") errors.push(`unexpected repository kind ${configuration.kind}`);
if (configuration.servers.length !== 0) errors.push("static compiler must not register servers");
if (configuration.browserConfigs.length !== 0) errors.push("static compiler must not register browser configs");

for (const [role, script] of Object.entries(configuration.commands)) {
  if (!packageJson.scripts?.[script]) errors.push(`${role} requires npm script ${script}`);
}
for (const workflow of Object.values(configuration.workflows)) {
  await requirePath(workflow);
  try {
    const source = await readFile(resolve(repositoryRoot, workflow), "utf8");
    if (/uses:\s+[^\n#]+@(v\d+|main|master)\b/u.test(source)) errors.push(`${workflow} contains a mutable action reference`);
    if (!source.includes("timeout-minutes:")) errors.push(`${workflow} has no job timeout`);
  } catch {
    // Missing workflow is already reported.
  }
}

if (Object.keys(packageJson.dependencies ?? {}).length !== 0) errors.push("runtime dependencies are not allowed");
if (packageJson.engines?.node !== ">=22") errors.push("Node 22 support declaration is required");

if (errors.length > 0) {
  console.error(`Repository contract failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log("Verified theme repository contract.");
