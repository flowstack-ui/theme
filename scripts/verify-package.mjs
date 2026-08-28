import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const repositoryPackage = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8"));
const brickVersion = repositoryPackage.devDependencies?.["@flowstack-ui/brick"];
assert.match(brickVersion ?? "", /^\d+\.\d+\.\d+$/u, "archive qualification requires an exact installed Brick devDependency");
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

const brickArchive = process.env.FLOWSTACK_BRICK_ARCHIVE
  ? resolve(process.env.FLOWSTACK_BRICK_ARCHIVE)
  : null;
const atomArchive = process.env.FLOWSTACK_ATOM_ARCHIVE
  ? resolve(process.env.FLOWSTACK_ATOM_ARCHIVE)
  : null;
let brickInstallTargets = [`@flowstack-ui/brick@${brickVersion}`];
if (brickArchive) {
  assert.ok(atomArchive, "FLOWSTACK_ATOM_ARCHIVE is required with a local unpublished Brick candidate");
  const packedBrick = JSON.parse(run("tar", ["-xOf", brickArchive, "package/package.json"], repositoryRoot));
  const packedAtom = JSON.parse(run("tar", ["-xOf", atomArchive, "package/package.json"], repositoryRoot));
  assert.equal(packedBrick.name, "@flowstack-ui/brick");
  assert.equal(packedBrick.version, brickVersion);
  assert.equal(packedAtom.name, "@flowstack-ui/atom");
  assert.equal(packedAtom.version, packedBrick.dependencies?.["@flowstack-ui/atom"]);
  brickInstallTargets = [atomArchive, brickArchive];
}

try {
  await mkdir(packageDirectory, { recursive: true });
  const packOutput = run("npm", ["pack", "--json", "--silent", "--pack-destination", packageDirectory], repositoryRoot);
  const jsonStart = packOutput.lastIndexOf("\n[");
  const packed = JSON.parse(jsonStart >= 0 ? packOutput.slice(jsonStart + 1) : packOutput);
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
    "package/dist/colors-interchange.d.ts",
    "package/dist/colors-interchange.js",
    "package/dist/artifacts.d.ts",
    "package/dist/artifacts.js",
    "package/dist/index.d.ts",
    "package/dist/index.js",
    "package/dist/schema.d.ts",
    "package/dist/schema.js",
    "package/dist/agents/manifest.json",
    "package/dist/agents/coverage.json",
    "package/dist/agents/theme-system.json",
    "package/dist/agents/theme-system.md",
    "package/docs/agent-knowledge.md",
    "package/docs/appearances-and-portals.md",
    "package/docs/architecture.md",
    "package/docs/authoring.md",
    "package/docs/colors-interchange.md",
    "package/docs/fonts.md",
    "package/docs/installation.md",
    "package/docs/migration.md",
    "package/docs/testing.md",
    "package/docs/troubleshooting.md",
    "package/package.json",
  ]) {
    assert.ok(listing.includes(expected), `${expected} is missing from ${basename(archive)}`);
  }
  assert.deepEqual(
    listing.filter((path) => path.startsWith("package/dist/agents/")).sort(),
    [
      "package/dist/agents/coverage.json",
      "package/dist/agents/manifest.json",
      "package/dist/agents/theme-system.json",
      "package/dist/agents/theme-system.md",
    ],
    "packed Agent Knowledge contains missing or unexpected output",
  );
  assert.equal(listing.some((path) => /package\/(?:src|test|scripts|\.github)\//u.test(path)), false, "private development sources entered the archive");

  await mkdir(consumerDirectory, { recursive: true });
  await writeFile(resolve(consumerDirectory, "package.json"), JSON.stringify({ name: "theme-clean-consumer", private: true, type: "module" }, null, 2));
  await writeFile(resolve(consumerDirectory, "index.mjs"), `
import { readFile, writeFile } from "node:fs/promises";
import {
  THEME_DEFINITION_SCHEMA,
  BRICK_THEME_CONTRACT_SCHEMA,
  COLORS_THEME_SCAFFOLD_SCHEMA,
  assertThemeDefinition,
  compileTheme,
  defineTheme,
  loadBrickThemeContract,
  scaffoldThemeFromColors,
  validateThemeDefinition,
  writeThemeArtifacts,
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
  contractVersion: 2,
  package: { name: "@flowstack-ui/brick", version: "0.1.6" },
  css: {
    variablePrefix: "--brick-",
    layerOrder: ["brick.tokens", "flowstack.theme", "brick.foundations"],
    themeLayer: "flowstack.theme",
    themeAttribute: "data-flowstack-theme",
    appearanceAttribute: "data-brick-appearance",
    appearanceValues: ["light", "dark"],
  },
  atomicColorFamilies: [{ id: "accent", tokens: ["--brick-color-accent-solid", "--brick-color-accent-on-solid"] }],
  contrast: {
    algorithm: "wcag2-relative-luminance",
    colorSpace: "srgb",
    pairs: [{
      id: "accent-on-solid/accent-solid",
      kind: "text",
      foreground: "--brick-color-accent-on-solid",
      background: "--brick-color-accent-solid",
      minimumRatio: 4.5,
    }],
  },
  componentThemeInputs: [],
  tokens: [
    {
      name: "--brick-color-accent-solid",
      classification: "required",
      type: "color",
      appearance: "light-and-dark",
      defaults: { light: "#3157d5", dark: "#6683e8" },
      tokenPaths: { light: "semantic.light.color.accent.solid", dark: "semantic.dark.color.accent.solid" },
    },
    {
      name: "--brick-color-accent-on-solid",
      classification: "required",
      type: "color",
      appearance: "light-and-dark",
      defaults: { light: "#ffffff", dark: "#111111" },
      tokenPaths: { light: "semantic.light.color.accent.on-solid", dark: "semantic.dark.color.accent.on-solid" },
    },
  ],
};

if (SCHEMA_ENTRY !== THEME_DEFINITION_SCHEMA) throw new Error("schema subpath mismatch");
assertThemeDefinition(definition);
if (!validateThemeDefinition(definition).valid) throw new Error("archive definition did not validate");
const compilation = compileTheme(definition, contract);
if (!compilation.css.includes("@layer flowstack.theme")) throw new Error("archive compilation failed");
await writeFile("compiled-theme.css", compilation.css);
const installedContract = await loadBrickThemeContract("./node_modules/@flowstack-ui/brick/dist/theme-contract.json");
if (installedContract.package.version !== ${JSON.stringify(brickVersion)}) throw new Error("installed Brick contract version mismatch");
const installedCompilation = compileTheme(definition, installedContract);
if (!installedCompilation.css.includes("@layer flowstack.theme")) throw new Error("installed-exact Brick compilation failed");
await writeThemeArtifacts(installedCompilation, "theme-output-a");
await writeThemeArtifacts(installedCompilation, "theme-output-b");
for (const name of ["theme.css", "theme.tokens.json", "theme.manifest.json", "theme.report.json"]) {
  const first = await readFile("theme-output-a/" + name, "utf8");
  const second = await readFile("theme-output-b/" + name, "utf8");
  if (first !== second) throw new Error("installed artifact is not byte-stable: " + name);
}
const color = (role, hex) => ({ role, srgb: { hex } });
const scaffold = scaffoldThemeFromColors({
  $schema: "flowstack.colors-candidate.v1",
  status: "accepted",
  review: { status: "accepted" },
  families: [{
    id: "brand-source",
    profile: "interface",
    status: "accepted",
    appearances: { light: { roles: {
      solid: color("solid", "#3157d5"),
      onSolid: color("onSolid", "#ffffff"),
    } } },
  }],
}, {
  $schema: COLORS_THEME_SCAFFOLD_SCHEMA,
  theme: {
    $schema: THEME_DEFINITION_SCHEMA,
    metadata: { id: "archive-scaffold", name: "Archive Scaffold" },
    compatibility: { brick: "^0.1.0" },
    appearances: { supported: ["light"], default: "light" },
  },
  palettes: { brand: "brand-source" },
  semantics: { accent: "brand" },
}, contract);
if (compileTheme(scaffold.definition, contract).report.counts.brickOverridden !== 2) {
  throw new Error("archive scaffold did not compile");
}
console.log(definition.metadata.id, compilation.report.counts.brickRequired);
`);

  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", archive, ...brickInstallTargets, "esbuild@0.25.10"], consumerDirectory);
  const consumerOutput = run(process.execPath, ["index.mjs"], consumerDirectory).trim();
  assert.equal(consumerOutput, "archive-consumer 2");
  const help = run(process.execPath, [resolve(consumerDirectory, "node_modules/@flowstack-ui/theme/dist/cli.js"), "--help"], consumerDirectory);
  assert.match(help, /flowstack-theme validate/u);
  assert.match(help, /flowstack-theme scaffold-colors/u);

  const installedPackage = JSON.parse(await readFile(resolve(consumerDirectory, "node_modules/@flowstack-ui/theme/package.json"), "utf8"));
  assert.equal(Object.keys(installedPackage.dependencies ?? {}).length, 0);
  const installedBrick = JSON.parse(await readFile(resolve(consumerDirectory, "node_modules/@flowstack-ui/brick/package.json"), "utf8"));
  assert.equal(installedBrick.version, brickVersion);
  const agentManifest = JSON.parse(await readFile(resolve(consumerDirectory, "node_modules/@flowstack-ui/theme/dist/agents/manifest.json"), "utf8"));
  const agentCoverage = JSON.parse(await readFile(resolve(consumerDirectory, "node_modules/@flowstack-ui/theme/dist/agents/coverage.json"), "utf8"));
  assert.equal(agentManifest.package, "@flowstack-ui/theme");
  assert.equal(agentManifest.packageVersion, installedPackage.version);
  assert.deepEqual(agentManifest.guides.map(({ id }) => id), ["theme-system"]);
  assert.equal(agentManifest.coverage, "./coverage.json");
  assert.equal(agentCoverage.schema, "flowstack.agent-coverage.v1");
  assert.equal(agentCoverage.package, installedPackage.name);
  assert.equal(agentCoverage.packageVersion, installedPackage.version);
  assert.equal(agentCoverage.profile.kind, "operation-package");
  assert.equal(agentCoverage.summary.operationOwners, 7);
  assert.equal(agentCoverage.summary.guidedOperationOwners, 7);
  assert.equal(agentCoverage.summary.ownerUnits, 7);
  assert.equal(agentCoverage.summary.guidedOwnerUnits, 7);
  assert.equal(agentCoverage.summary.classifiedPublicSurfaces, agentCoverage.summary.publicSurfaces);
  assert.deepEqual(agentCoverage.failures, []);
  assert.deepEqual(agentManifest.operations.map(({ id }) => id).sort(), agentCoverage.operations.map(({ id }) => id).sort());
  const installedAgents = (await import("node:fs/promises")).readdir(resolve(consumerDirectory, "node_modules/@flowstack-ui/theme/dist/agents"));
  assert.deepEqual((await installedAgents).sort(), ["coverage.json", "manifest.json", "theme-system.json", "theme-system.md"]);
  const rootModule = await import(resolve(consumerDirectory, "node_modules/@flowstack-ui/theme/dist/index.js"));
  const schemaModule = await import(resolve(consumerDirectory, "node_modules/@flowstack-ui/theme/dist/schema.js"));
  for (const surface of agentCoverage.surfaces.filter(({ value }) => value)) {
    if (surface.surface.startsWith(".#")) assert.ok(surface.surface.slice(2) in rootModule, `missing installed root symbol ${surface.surface}`);
    if (surface.surface.startsWith("./schema#")) assert.ok(surface.surface.slice(9) in schemaModule, `missing installed schema symbol ${surface.surface}`);
  }
  const installedGuide = JSON.parse(await readFile(resolve(consumerDirectory, "node_modules/@flowstack-ui/theme/dist/agents/theme-system.json"), "utf8"));
  const installedGuideMarkdown = await readFile(resolve(consumerDirectory, "node_modules/@flowstack-ui/theme/dist/agents/theme-system.md"), "utf8");
  assert.equal(installedGuide.id, "theme-system");
  assert.match(installedGuideMarkdown, /## Selection map/u);

  await writeFile(resolve(consumerDirectory, "browser.js"), 'import "./compiled-theme.css"; import { Button } from "@flowstack-ui/brick/button"; console.log(Button);\n');
  run(resolve(consumerDirectory, "node_modules/.bin/esbuild"), ["browser.js", "--bundle", "--platform=browser", "--outfile=browser-bundle.js", "--metafile=browser-meta.json"], consumerDirectory);
  const browserMeta = JSON.parse(await readFile(resolve(consumerDirectory, "browser-meta.json"), "utf8"));
  assert.equal(Object.keys(browserMeta.inputs).some((path) => path.includes("node_modules/@flowstack-ui/theme/")), false, "Theme compiler entered the browser bundle");

  console.log(`Verified ${basename(archive)} and its clean consumer.`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
