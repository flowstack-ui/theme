import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  BRICK_THEME_CONTRACT_SCHEMA,
  THEME_DEFINITION_SCHEMA,
  ThemeCompilationError,
  compileTheme,
  writeThemeArtifacts,
} from "../dist/index.js";

function token(name, classification, type, light, dark, path, appearance = "light-and-dark") {
  return {
    name,
    classification,
    type,
    appearance,
    defaults: { light, dark },
    tokenPaths: { light: `semantic.light.${path}`, dark: `semantic.dark.${path}` },
  };
}

function contract() {
  return {
    $schema: BRICK_THEME_CONTRACT_SCHEMA,
    contractVersion: 4,
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
      pairs: [
        {
          id: "accent-on-solid/accent-solid",
          kind: "text",
          foreground: "--brick-color-accent-on-solid",
          background: "--brick-color-accent-solid",
          minimumRatio: 4.5,
        },
        {
          id: "accent-link-from-primary-text/text-primary",
          kind: "text-distinction",
          foreground: "--brick-color-accent-on-solid",
          background: "--brick-color-accent-solid",
          minimumRatio: 3,
          when: { componentInput: "--brick-link-decoration-policy", equals: "interaction" },
        },
      ],
    },
    componentThemeInputs: [
      { name: "--brick-drawer-radius", type: "dimension", fallback: "--brick-radius-overlay", supportedRange: "non-negative CSS <length>", component: "drawer" },
      {
        name: "--brick-link-decoration-policy",
        type: "string",
        fallback: "always",
        supportedRange: '"always" or "interaction"',
        allowedValues: ["always", "interaction"],
        authorPath: "link.decoration",
        valueAssignments: {
          always: [
            { name: "--brick-link-decoration", type: "string", value: "underline" },
            { name: "--brick-link-theme-font-weight", type: "fontWeight", value: "inherit" },
          ],
          interaction: [
            { name: "--brick-link-decoration", type: "string", value: "none" },
            { name: "--brick-link-theme-font-weight", type: "fontWeight", value: "var(--brick-font-weight-medium)" },
          ],
        },
        component: "link",
      },
    ],
    tokens: [
      token("--brick-color-accent-solid", "required", "color", "#554fd8", "#7772ee", "color.accent.solid"),
      token("--brick-color-accent-on-solid", "required", "color", "#ffffff", "#111111", "color.accent.on-solid"),
      token("--brick-radius-overlay", "derived", "dimension", "0.75rem", "0.75rem", "radius.overlay", "invariant"),
      { name: "--brick-link-decoration", classification: "optional-extension", type: null, appearance: "invariant", component: "link" },
      { name: "--brick-link-theme-font-weight", classification: "internal", type: null, appearance: "invariant", component: "link" },
      {
        ...token("--brick-color-accent-legacy", "deprecated", "color", "#554fd8", "#7772ee", "color.accent.legacy"),
        deprecated: {
          replacement: "--brick-color-accent-solid",
          message: "The legacy accent role is no longer maintained.",
        },
      },
    ],
  };
}

function definition() {
  return {
    $schema: THEME_DEFINITION_SCHEMA,
    metadata: { id: "acme", name: "Acme" },
    compatibility: { brick: "^0.1.0" },
    appearances: { supported: ["light", "dark"], default: "system" },
    palettes: { brand: { blue: "#1261a0", orange: "#f27b22" } },
    roles: { brandPrimary: "{palettes.brand.blue}", promotional: "{palettes.brand.orange}" },
    brick: {
      light: { color: { accent: { solid: "{roles.brandPrimary}", "on-solid": "#ffffff" } } },
      dark: { color: { accent: { solid: "#68b5f0", "on-solid": "#081521" } } },
    },
    foundations: { radius: { overlay: "1rem" } },
    components: { drawer: { radius: "1.25rem" } },
    extensions: { charts: { revenue: "{roles.promotional}" } },
    requirements: { fonts: [{ family: "Acme Sans", source: "application" }] },
    guidance: { intent: "Clear product UI" },
  };
}

test("compiler resolves aliases and emits complete deterministic dual-appearance artifacts", async () => {
  const first = compileTheme(definition(), contract());
  const second = compileTheme(definition(), contract());
  assert.deepEqual(first, second);
  assert.match(first.css, /^@layer flowstack\.theme/u);
  assert.match(first.css, /prefers-color-scheme: dark/u);
  assert.match(first.css, /color-scheme: light dark/u);
  assert.match(first.css, /data-brick-appearance="dark"[\s\S]*color-scheme: dark/u);
  assert.match(first.css, /--brick-color-accent-solid: #1261a0/u);
  assert.match(first.css, /--flowstack-theme-roles-promotional: #f27b22/u);
  assert.match(first.css, /--flowstack-theme-extensions-charts-revenue: #f27b22/u);
  assert.equal(first.tokens.roles.brandPrimary.$value, "#1261a0");
  assert.equal(first.tokens.brick.dark.color.accent.solid.$value, "#68b5f0");
  assert.deepEqual(first.manifest.extensionNamespaces, ["charts"]);
  assert.deepEqual(first.manifest.requirements.fonts, [{ family: "Acme Sans", source: "application" }]);
  assert.equal(first.report.counts.brickOverridden, 4);
  assert.equal(first.report.counts.componentInputs, 1);
  assert.equal(first.report.counts.contrastPairs, 2);
  assert.equal(first.report.contrast.algorithm, "wcag2-relative-luminance");
  assert.equal(first.report.contrast.pairs.length, 2);
  assert.ok(first.report.contrast.pairs.every(({ ratio, valid }) => ratio >= 4.5 && valid));
  assert.ok(first.report.contrast.pairs.every(({ ratio }) =>
    Number(ratio.toPrecision(12)) === ratio));

  const output = await mkdtemp(resolve(tmpdir(), "flowstack-theme-artifacts-"));
  try {
    await writeThemeArtifacts(first, output);
    assert.equal(await readFile(resolve(output, "theme.css"), "utf8"), first.css);
    for (const name of ["theme.tokens.json", "theme.manifest.json", "theme.report.json"]) {
      assert.match(await readFile(resolve(output, name), "utf8"), /\n$/u);
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("fixed-light and fixed-dark themes use their selected complete map without system CSS", () => {
  for (const appearance of ["light", "dark"]) {
    const input = definition();
    input.appearances = { supported: [appearance], default: appearance };
    delete input.brick[appearance === "light" ? "dark" : "light"];
    const result = compileTheme(input, contract());
    assert.doesNotMatch(result.css, /prefers-color-scheme/u);
    assert.match(result.css, new RegExp(`color-scheme: ${appearance}`, "u"));
    assert.match(result.css, new RegExp(`data-brick-appearance="${appearance}"`, "u"));
    assert.equal(result.report.counts.brickRequired, 2);
  }
});

test("sparse definitions inherit complete Brick defaults", () => {
  const input = definition();
  delete input.brick;
  const result = compileTheme(input, contract());
  assert.equal(result.report.counts.brickInherited, 4);
  assert.match(result.css, /--brick-color-accent-solid: #554fd8/u);
  assert.match(result.css, /--brick-color-accent-solid: #7772ee/u);
});

test("partial atomic families, unknown inputs, invalid values, aliases, and versions fail clearly", () => {
  const legacyContract = contract();
  legacyContract.contractVersion = 1;
  delete legacyContract.contrast;
  assert.throws(() => compileTheme(definition(), legacyContract), (error) =>
    error instanceof ThemeCompilationError &&
    error.issues.some(({ code, path }) => code === "invalid-contract" && path === "$contract.contractVersion"));

  const deprecated = definition();
  deprecated.brick.light.color.accent.legacy = "#3157d5";
  assert.throws(() => compileTheme(deprecated, contract()), (error) =>
    error instanceof ThemeCompilationError &&
    error.issues.some(({ code, path, message }) =>
      code === "deprecated-token" &&
      path === "$.brick.light.color.accent.legacy" &&
      message.includes("brick.light.color.accent.solid")));

  const partial = definition();
  delete partial.brick.light.color.accent["on-solid"];
  assert.throws(() => compileTheme(partial, contract()), (error) => error instanceof ThemeCompilationError && error.issues.some(({ code }) => code === "incomplete-family"));

  const unknown = definition();
  unknown.components.button = { glow: "1rem" };
  assert.throws(() => compileTheme(unknown, contract()), (error) => error.issues.some(({ code }) => code === "unsupported-component-input"));

  const invalid = definition();
  invalid.components.drawer.radius = "red; color: blue";
  assert.throws(() => compileTheme(invalid, contract()), (error) => error.issues.some(({ code }) => code === "invalid-token-value"));

  const negative = definition();
  negative.components.drawer.radius = "-1rem";
  assert.throws(() => compileTheme(negative, contract()), (error) => error.issues.some(({ code }) => code === "invalid-token-value"));

  const categorical = definition();
  categorical.components.link = { decoration: "sometimes" };
  assert.throws(() => compileTheme(categorical, contract()), (error) =>
    error.issues.some(({ code, path }) => code === "invalid-token-value" && path === "$.components.link.decoration"));

  const circular = definition();
  circular.roles.a = "{roles.b}";
  circular.roles.b = "{roles.a}";
  assert.throws(() => compileTheme(circular, contract()), (error) => error.issues.some(({ code }) => code === "alias-cycle"));

  const incompatible = definition();
  incompatible.compatibility.brick = "^2.0.0";
  assert.throws(() => compileTheme(incompatible, contract()), (error) => error.issues.some(({ code }) => code === "incompatible-brick"));
});

test("component policy recipes emit their Brick-owned assignments and activate conditional contrast pairs", () => {
  const inherited = compileTheme(definition(), contract());
  assert.equal(inherited.report.counts.contrastPairs, 2);
  assert.doesNotMatch(inherited.css, /--brick-link-decoration/u);

  const input = definition();
  input.components.link = { decoration: "interaction" };
  const result = compileTheme(input, contract());
  assert.match(result.css, /--brick-link-decoration-policy: interaction/u);
  assert.match(result.css, /--brick-link-decoration: none/u);
  assert.match(result.css, /--brick-link-theme-font-weight: var\(--brick-font-weight-medium\)/u);
  assert.equal(result.report.counts.componentInputs, 2);
  assert.equal(result.report.counts.contrastPairs, 4);
  assert.ok(result.report.contrast.pairs.some(({ kind, when }) =>
    kind === "text-distinction" && when?.componentInput === "--brick-link-decoration-policy"));

  const strictContract = contract();
  strictContract.contrast.pairs[1].minimumRatio = 10;
  assert.doesNotThrow(() => compileTheme(definition(), strictContract));
  assert.throws(() => compileTheme(input, strictContract), (error) =>
    error instanceof ThemeCompilationError &&
    error.issues.some(({ code, path }) =>
      code === "insufficient-contrast" &&
      path === "$contrast.light.accent-link-from-primary-text/text-primary"));
});

test("project roles remain project variables and never create Brick color names", () => {
  const result = compileTheme(definition(), contract());
  assert.match(result.css, /--flowstack-theme-roles-promotional/u);
  assert.doesNotMatch(result.css, /--brick-color-promotional/u);
});

test("appearance roles emit one stable project variable and validated project relationships", () => {
  const input = definition();
  input.appearanceRoles = {
    light: { blocks: { expressiveSurface: { surface: "#4a2f00", foreground: "#ffffff" } } },
    dark: { blocks: { expressiveSurface: { surface: "#f2bd59", foreground: "#211f1c" } } },
  };
  input.relationships = {
    contrast: [{
      id: "blocks-expressive-surface-content",
      kind: "text",
      foreground: "blocks.expressiveSurface.foreground",
      background: "blocks.expressiveSurface.surface",
      minimumRatio: 4.5,
    }],
  };
  const result = compileTheme(input, contract());
  const variable = "--flowstack-theme-roles-blocks-expressive-surface-surface";
  assert.equal(result.css.match(new RegExp(variable, "gu"))?.length, 4);
  assert.match(result.css, new RegExp(`${variable}: #4a2f00`, "u"));
  assert.match(result.css, new RegExp(`${variable}: #f2bd59`, "u"));
  assert.equal(result.report.counts.brickContrastPairs, 2);
  assert.equal(result.report.counts.projectContrastPairs, 2);
  assert.equal(result.report.counts.contrastPairs, 4);
  assert.equal(result.report.contrast.projectPairs.length, 2);
  assert.equal(result.tokens.appearanceRoles.light.blocks.expressiveSurface.surface.$value, "#4a2f00");
});

test("appearance roles reject missing appearances, collisions, and unsafe project relationships", () => {
  const missing = definition();
  missing.appearanceRoles = { light: { panel: { surface: "#111111" } } };
  assert.throws(() => compileTheme(missing, contract()), (error) =>
    error instanceof ThemeCompilationError &&
    error.issues.some(({ code, path }) => code === "missing-appearance-role" && path === "$.appearanceRoles.dark.panel.surface"));

  const collision = definition();
  collision.roles.panel = { surface: "#111111" };
  collision.appearanceRoles = {
    light: { panel: { surface: "#222222" } },
    dark: { panel: { surface: "#333333" } },
  };
  assert.throws(() => compileTheme(collision, contract()), (error) =>
    error instanceof ThemeCompilationError && error.issues.some(({ code }) => code === "naming-collision"));

  const unsafe = definition();
  unsafe.appearanceRoles = {
    light: { panel: { surface: "#777777", foreground: "#888888" } },
    dark: { panel: { surface: "#777777", foreground: "#888888" } },
  };
  unsafe.relationships = { contrast: [{
    id: "panel-content",
    kind: "text",
    foreground: "panel.foreground",
    background: "panel.surface",
    minimumRatio: 4.5,
  }] };
  assert.throws(() => compileTheme(unsafe, contract()), (error) =>
    error instanceof ThemeCompilationError &&
    error.issues.some(({ code, path }) => code === "insufficient-contrast" && path === "$projectContrast.light.panel-content"));

  const unprovable = definition();
  unprovable.appearanceRoles = {
    light: { panel: { surface: "color(display-p3 0.2 0.2 0.2)", foreground: "#ffffff" } },
    dark: { panel: { surface: "#111111", foreground: "#ffffff" } },
  };
  unprovable.relationships = unsafe.relationships;
  assert.throws(() => compileTheme(unprovable, contract()), (error) =>
    error instanceof ThemeCompilationError &&
    error.issues.some(({ code, path }) => code === "unverifiable-contrast" && path === "$.appearanceRoles.light.panel.surface"));
});

test("fixed-appearance themes require and report only their supported project-role map", () => {
  const input = definition();
  input.appearances = { supported: ["light"], default: "light" };
  delete input.brick.dark;
  input.appearanceRoles = {
    light: { panel: { surface: "#111111", foreground: "#ffffff" } },
  };
  input.relationships = { contrast: [{
    id: "panel-content",
    kind: "text",
    foreground: "panel.foreground",
    background: "panel.surface",
    minimumRatio: 4.5,
  }] };
  const result = compileTheme(input, contract());
  assert.equal(result.report.counts.projectContrastPairs, 1);
  assert.doesNotMatch(result.css, /prefers-color-scheme/u);
  assert.match(result.css, /--flowstack-theme-roles-panel-surface: #111111/u);
});

test("contrast validation compares the raw ratio and rejects insufficient pairs", () => {
  const input = definition();
  input.brick.light.color.accent.solid = "#777777";
  assert.throws(() => compileTheme(input, contract()), (error) =>
    error instanceof ThemeCompilationError &&
    error.issues.some(({ code, path }) => code === "insufficient-contrast" && path === "$contrast.light.accent-on-solid/accent-solid"));
});

test("contrast validation accepts opaque rgb syntax and rejects colors it cannot prove", () => {
  const rgb = definition();
  rgb.brick.light.color.accent.solid = "rgb(18 97 160)";
  assert.equal(compileTheme(rgb, contract()).report.counts.contrastPairs, 2);

  const unprovable = definition();
  unprovable.brick.light.color.accent.solid = "oklch(50% 0.15 250)";
  assert.throws(() => compileTheme(unprovable, contract()), (error) =>
    error instanceof ThemeCompilationError &&
    error.issues.some(({ code, path }) => code === "unverifiable-contrast" && path === "$.brick.light.color.accent.solid"));
});
