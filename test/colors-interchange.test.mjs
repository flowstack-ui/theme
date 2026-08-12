import assert from "node:assert/strict";
import test from "node:test";

import {
  BRICK_THEME_CONTRACT_SCHEMA,
  COLORS_CANDIDATE_SCHEMA,
  COLORS_THEME_SCAFFOLD_REPORT_SCHEMA,
  COLORS_THEME_SCAFFOLD_SCHEMA,
  ColorsThemeScaffoldError,
  compileTheme,
  scaffoldThemeFromColors,
} from "../dist/index.js";

function value(role, hex) {
  return { role, srgb: { hex } };
}

const interfaceLight = {
  soft: "#eeeeff",
  softHover: "#ddddff",
  softPressed: "#ccccff",
  border: "#aaaaff",
  borderStrong: "#7777bb",
  focusRing: "#0000aa",
  solid: "#3157d5",
  solidHover: "#294cc5",
  solidPressed: "#223fae",
  text: "#111177",
  onSoft: "#111177",
  onSolid: "#ffffff",
};

const interfaceDark = {
  soft: "#17172c",
  softHover: "#20203d",
  softPressed: "#29294e",
  border: "#555588",
  borderStrong: "#8888bb",
  focusRing: "#aaaaff",
  solid: "#3157d5",
  solidHover: "#4166df",
  solidPressed: "#5377e6",
  text: "#ccccff",
  onSoft: "#ccccff",
  onSolid: "#ffffff",
};

const neutralLight = {
  canvas: "#ffffff",
  surface: "#fafafa",
  surfaceRaised: "#f0f0f0",
  surfaceHover: "#e5e5e5",
  surfacePressed: "#dddddd",
  border: "#cccccc",
  borderStrong: "#777777",
  textMuted: "#666666",
  text: "#444444",
  textStrong: "#111111",
  textInverse: "#ffffff",
};

const neutralDark = {
  canvas: "#111111",
  surface: "#181818",
  surfaceRaised: "#222222",
  surfaceHover: "#2b2b2b",
  surfacePressed: "#333333",
  border: "#555555",
  borderStrong: "#999999",
  textMuted: "#aaaaaa",
  text: "#cccccc",
  textStrong: "#ffffff",
  textInverse: "#000000",
};

function roles(source) {
  return Object.fromEntries(
    Object.entries(source).map(([role, hex]) => [role, value(role, hex)]),
  );
}

function candidate(review = "accepted") {
  return {
    $schema: COLORS_CANDIDATE_SCHEMA,
    status: "accepted",
    review: { status: review },
    families: [
      {
        id: "brand-source",
        profile: "interface",
        status: "accepted",
        appearances: {
          light: { roles: roles(interfaceLight) },
          dark: { roles: roles(interfaceDark) },
        },
      },
      {
        id: "neutral-source",
        profile: "neutral",
        status: "accepted",
        appearances: {
          light: { roles: roles(neutralLight) },
          dark: { roles: roles(neutralDark) },
        },
      },
      {
        id: "campaign-source",
        profile: "decorative",
        status: "accepted",
        appearances: {
          light: { steps: [value("step-1", "#fff0ff"), value("step-2", "#ff00ff"), value("step-3", "#550055")] },
          dark: { steps: [value("step-1", "#220022"), value("step-2", "#ff00ff"), value("step-3", "#ffd0ff")] },
        },
      },
    ],
  };
}

function token(name, familyPath, light, dark) {
  return {
    name,
    classification: "required",
    type: "color",
    appearance: "light-and-dark",
    defaults: { light, dark },
    tokenPaths: {
      light: `semantic.light.${familyPath}`,
      dark: `semantic.dark.${familyPath}`,
    },
  };
}

function contract() {
  const definitions = [
    ["accent", [
      ["--brick-color-accent-solid", "color.accent.solid", "#3157d5", "#3157d5"],
      ["--brick-color-accent-on-solid", "color.accent.on-solid", "#ffffff", "#ffffff"],
    ]],
    ["focus", [
      ["--brick-color-focus-ring", "color.focus-ring", "#0000aa", "#aaaaff"],
    ]],
    ["surface", [
      ["--brick-color-surface-base", "color.surface.base", "#fafafa", "#181818"],
      ["--brick-color-surface-canvas", "color.surface.canvas", "#ffffff", "#111111"],
      ["--brick-color-surface-overlay", "color.surface.overlay", "#e5e5e5", "#2b2b2b"],
      ["--brick-color-surface-raised", "color.surface.raised", "#e5e5e5", "#2b2b2b"],
      ["--brick-color-surface-subtle", "color.surface.subtle", "#f0f0f0", "#222222"],
    ]],
    ["border", [
      ["--brick-color-border-default", "color.border.default", "#cccccc", "#555555"],
      ["--brick-color-border-strong", "color.border.strong", "#777777", "#999999"],
      ["--brick-color-border-subtle", "color.border.subtle", "#cccccc", "#555555"],
    ]],
    ["text", [
      ["--brick-color-text-disabled", "color.text.disabled", "#666666", "#aaaaaa"],
      ["--brick-color-text-inverse", "color.text.inverse", "#ffffff", "#000000"],
      ["--brick-color-text-muted", "color.text.muted", "#666666", "#aaaaaa"],
      ["--brick-color-text-primary", "color.text.primary", "#111111", "#ffffff"],
      ["--brick-color-text-secondary", "color.text.secondary", "#444444", "#cccccc"],
    ]],
  ];
  const tokens = definitions.flatMap(([, entries]) =>
    entries.map(([name, path, light, dark]) => token(name, path, light, dark))
  );
  return {
    $schema: BRICK_THEME_CONTRACT_SCHEMA,
    contractVersion: 2,
    package: { name: "@flowstack-ui/brick", version: "0.1.9" },
    css: {
      variablePrefix: "--brick-",
      layerOrder: ["brick.tokens", "flowstack.theme", "brick.foundations"],
      themeLayer: "flowstack.theme",
      themeAttribute: "data-flowstack-theme",
      appearanceAttribute: "data-brick-appearance",
      appearanceValues: ["light", "dark"],
    },
    atomicColorFamilies: definitions.map(([id, entries]) => ({
      id,
      tokens: entries.map(([name]) => name),
    })),
    contrast: {
      algorithm: "wcag2-relative-luminance",
      colorSpace: "srgb",
      pairs: [
        { id: "accent-on-solid/accent-solid", kind: "text", foreground: "--brick-color-accent-on-solid", background: "--brick-color-accent-solid", minimumRatio: 4.5 },
        { id: "text-primary/surface-canvas", kind: "text", foreground: "--brick-color-text-primary", background: "--brick-color-surface-canvas", minimumRatio: 4.5 },
        { id: "focus-ring/surface-canvas", kind: "non-text", foreground: "--brick-color-focus-ring", background: "--brick-color-surface-canvas", minimumRatio: 3 },
      ],
    },
    componentThemeInputs: [],
    tokens,
  };
}

function mapping() {
  return {
    $schema: COLORS_THEME_SCAFFOLD_SCHEMA,
    theme: {
      $schema: "flowstack.theme.v1",
      metadata: { id: "scaffolded", name: "Scaffolded" },
      compatibility: { brick: "^0.1.0" },
      appearances: { supported: ["light", "dark"], default: "system" },
    },
    palettes: {
      brand: "brand-source",
      campaign: "campaign-source",
      neutral: "neutral-source",
    },
    semantics: { accent: "brand", focus: "brand", neutral: "neutral" },
  };
}

test("scaffolds reviewed candidate families into an ordinary compilable Theme", () => {
  const result = scaffoldThemeFromColors(candidate(), mapping(), contract());
  assert.equal(result.report.$schema, COLORS_THEME_SCAFFOLD_REPORT_SCHEMA);
  assert.deepEqual(result.report.counts, {
    importedValues: 52,
    mappedBrickTokens: 32,
  });
  assert.equal(result.definition.palettes.colors.brand.light.solid, "#3157d5");
  assert.equal(result.definition.palettes.colors.campaign.dark["step-2"], "#ff00ff");
  assert.equal(
    result.definition.brick.light.color.accent.solid,
    "{palettes.colors.brand.light.solid}",
  );
  assert.equal(
    result.definition.brick.dark.color.text.inverse,
    "{palettes.colors.neutral.dark.textInverse}",
  );

  const compilation = compileTheme(result.definition, contract());
  assert.equal(compilation.report.counts.brickInherited, 0);
  assert.equal(compilation.report.counts.brickOverridden, 32);
  assert.equal(compilation.report.contrast.pairs.length, 6);
  assert.ok(compilation.report.contrast.pairs.every(({ valid }) => valid));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test("requires review and explicit compatible semantic selections", () => {
  assert.throws(
    () => scaffoldThemeFromColors(candidate("unreviewed"), mapping(), contract()),
    (error) => error instanceof ColorsThemeScaffoldError
      && error.issues.some(({ code }) => code === "candidate-not-reviewed"),
  );

  const incompatible = mapping();
  incompatible.semantics.neutral = "campaign";
  assert.throws(
    () => scaffoldThemeFromColors(candidate(), incompatible, contract()),
    (error) => error instanceof ColorsThemeScaffoldError
      && error.issues.some(({ code }) => code === "incompatible-profile"),
  );

  const unknown = mapping();
  unknown.semantics.accent = "missing";
  assert.throws(
    () => scaffoldThemeFromColors(candidate(), unknown, contract()),
    (error) => error instanceof ColorsThemeScaffoldError
      && error.issues.some(({ code }) => code === "unknown-palette"),
  );
});

test("rejects missing roles and collisions instead of emitting partial families", () => {
  const missing = candidate();
  delete missing.families[0].appearances.light.roles.onSolid;
  assert.throws(
    () => scaffoldThemeFromColors(missing, mapping(), contract()),
    (error) => error instanceof ColorsThemeScaffoldError
      && error.issues.some(({ code }) => code === "missing-role"),
  );

  const collision = mapping();
  collision.theme.palettes = { colors: { owned: "#ffffff" } };
  assert.throws(
    () => scaffoldThemeFromColors(candidate(), collision, contract()),
    (error) => error instanceof ColorsThemeScaffoldError
      && error.issues.some(({ code }) => code === "naming-collision"),
  );
});
