import assert from "node:assert/strict";
import test from "node:test";

import {
  THEME_DEFINITION_SCHEMA,
  assertThemeDefinition,
  defineTheme,
  isThemeDefinition,
  validateThemeDefinition,
} from "../dist/index.js";

function validTheme() {
  return {
    $schema: THEME_DEFINITION_SCHEMA,
    metadata: { id: "test-theme", name: "Test Theme" },
    compatibility: { brick: "^0.1.0" },
    appearances: { supported: ["light", "dark"], default: "system" },
    palettes: {
      brand: {
        primary: "#3157d5",
        secondary: "#13a8b5",
        warmth: "#e97824",
        promotional: "#d93bbd",
      },
    },
    roles: {
      brandPrimary: "{palettes.brand.primary}",
      brandSecondary: "{palettes.brand.secondary}",
    },
  };
}

test("defineTheme preserves the exact author object", () => {
  const theme = validTheme();
  assert.equal(defineTheme(theme), theme);
});

test("a serializable multi-palette definition validates", () => {
  const theme = validTheme();
  assert.deepEqual(validateThemeDefinition(theme), { valid: true, issues: [] });
  assert.equal(isThemeDefinition(theme), true);
  assert.doesNotThrow(() => assertThemeDefinition(theme));
});

test("system preference requires both appearance maps", () => {
  const theme = validTheme();
  theme.appearances.supported = ["light"];
  const result = validateThemeDefinition(theme);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "invalid-default-appearance"));
});

test("unsupported and duplicate appearances are rejected deterministically", () => {
  const theme = validTheme();
  theme.appearances.supported = ["light", "light", "sepia"];
  theme.appearances.default = "sepia";
  const result = validateThemeDefinition(theme);
  assert.deepEqual(result.issues.map(({ code, path }) => [code, path]), [
    ["duplicate-appearance", "$.appearances.supported[1]"],
    ["invalid-appearance", "$.appearances.supported[2]"],
    ["invalid-default-appearance", "$.appearances.default"],
  ]);
});

test("unknown fields and invalid ids are rejected", () => {
  const theme = { ...validTheme(), provider: true };
  theme.metadata = { id: "Bad Theme", name: "Bad Theme" };
  const result = validateThemeDefinition(theme);
  assert.ok(result.issues.some((issue) => issue.code === "unknown-key" && issue.path === "$.provider"));
  assert.ok(result.issues.some((issue) => issue.code === "invalid-id"));
});

test("functions, non-finite numbers, class instances, and cycles are rejected", () => {
  const theme = validTheme();
  theme.palettes.functionValue = () => "#fff";
  theme.roles.nonFinite = Number.NaN;
  theme.components = {};
  theme.components.instance = new Date();
  theme.extensions = {};
  theme.extensions.loop = theme.extensions;
  const result = validateThemeDefinition(theme);
  assert.equal(result.valid, false);
  assert.equal(result.issues.filter((issue) => issue.code === "non-serializable").length, 4);
});

test("assertThemeDefinition exposes stable validation details", () => {
  assert.throws(
    () => assertThemeDefinition({}),
    (error) => error.name === "ThemeValidationError" && error.issues.length > 0,
  );
});
