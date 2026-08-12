import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const temporaryRoot = await mkdtemp(resolve(tmpdir(), "flowstack-theme-package-"));
const packageDirectory = resolve(temporaryRoot, "package");
const consumerDirectory = resolve(temporaryRoot, "consumer");
const cacheDirectory = resolve(temporaryRoot, "npm-cache");

function run(command, args, cwd, extraEnvironment = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: cacheDirectory, ...extraEnvironment },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

try {
  await mkdir(packageDirectory, { recursive: true });
  const packOutput = run("npm", ["pack", "--json", "--silent", "--pack-destination", packageDirectory], repositoryRoot);
  const packed = JSON.parse(packOutput);
  assert.equal(packed.length, 1);
  const archive = resolve(packageDirectory, packed[0].filename);
  const listing = run("tar", ["-tzf", archive], repositoryRoot).trim().split("\n").sort();

  for (const expected of [
    "package/CHANGELOG.md",
    "package/LICENSE",
    "package/README.md",
    "package/dist/cli.d.ts",
    "package/dist/cli.js",
    "package/dist/compiler.d.ts",
    "package/dist/compiler.js",
    "package/dist/artifacts.d.ts",
    "package/dist/artifacts.js",
    "package/dist/index.d.ts",
    "package/dist/index.js",
    "package/dist/schema.d.ts",
    "package/dist/schema.js",
    "package/package.json",
  ]) {
    assert.ok(listing.includes(expected), `${expected} is missing from ${basename(archive)}`);
  }
  assert.equal(listing.some((path) => /package\/(?:src|test|scripts|\.github)\//u.test(path)), false, "private development sources entered the archive");

  await mkdir(consumerDirectory, { recursive: true });
  await writeFile(resolve(consumerDirectory, "package.json"), JSON.stringify({ name: "theme-clean-consumer", private: true, type: "module" }, null, 2));
  await writeFile(resolve(consumerDirectory, "index.mjs"), `
import {
  THEME_DEFINITION_SCHEMA,
  BRICK_THEME_CONTRACT_SCHEMA,
  assertThemeDefinition,
  compileTheme,
  defineTheme,
  validateThemeDefinition,
} from "@flowstack-ui/theme";
import { THEME_DEFINITION_SCHEMA as SCHEMA_ENTRY } from "@flowstack-ui/theme/schema";

const definition = defineTheme({
  $schema: THEME_DEFINITION_SCHEMA,
  metadata: { id: "archive-consumer", name: "Archive Consumer" },
  compatibility: { brick: "^0.1.0" },
  appearances: { supported: ["light"], default: "light" },
  palettes: { brand: { primary: "#3157d5", secondary: "#13a8b5", warmth: "#e97824" } },
});

const contract = {
  $schema: BRICK_THEME_CONTRACT_SCHEMA,
  contractVersion: 1,
  package: { name: "@flowstack-ui/brick", version: "0.1.6" },
  css: {
    variablePrefix: "--brick-",
    layerOrder: ["brick.tokens", "flowstack.theme", "brick.foundations"],
    themeLayer: "flowstack.theme",
    themeAttribute: "data-flowstack-theme",
    appearanceAttribute: "data-brick-appearance",
    appearanceValues: ["light", "dark"],
  },
  atomicColorFamilies: [{ id: "accent", tokens: ["--brick-color-accent-solid"] }],
  componentThemeInputs: [],
  tokens: [{
    name: "--brick-color-accent-solid",
    classification: "required",
    type: "color",
    appearance: "light-and-dark",
    defaults: { light: "#3157d5", dark: "#6683e8" },
    tokenPaths: { light: "semantic.light.color.accent.solid", dark: "semantic.dark.color.accent.solid" },
  }],
};

if (SCHEMA_ENTRY !== THEME_DEFINITION_SCHEMA) throw new Error("schema subpath mismatch");
assertThemeDefinition(definition);
if (!validateThemeDefinition(definition).valid) throw new Error("archive definition did not validate");
const compilation = compileTheme(definition, contract);
if (!compilation.css.includes("@layer flowstack.theme")) throw new Error("archive compilation failed");
console.log(definition.metadata.id, compilation.report.counts.brickRequired);
`);

  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", archive], consumerDirectory);
  const consumerOutput = run(process.execPath, ["index.mjs"], consumerDirectory).trim();
  assert.equal(consumerOutput, "archive-consumer 1");
  const help = run(process.execPath, [resolve(consumerDirectory, "node_modules/@flowstack-ui/theme/dist/cli.js"), "--help"], consumerDirectory);
  assert.match(help, /flowstack-theme validate/u);

  const installedPackage = JSON.parse(await readFile(resolve(consumerDirectory, "node_modules/@flowstack-ui/theme/package.json"), "utf8"));
  assert.equal(Object.keys(installedPackage.dependencies ?? {}).length, 0);

  console.log(`Verified ${basename(archive)} and its clean consumer.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
