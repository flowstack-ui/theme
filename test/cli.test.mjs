import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const cli = resolve("dist/cli.js");

test("CLI help describes validation and compilation", () => {
  const result = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /flowstack-theme validate/);
  assert.match(result.stdout, /flowstack-theme compile/);
  assert.match(result.stdout, /theme\.manifest\.json/);
});

test("CLI compiles all four artifacts", () => {
  const root = mkdtempSync(resolve(tmpdir(), "flowstack-theme-cli-compile-"));
  try {
    const theme = resolve(root, "theme.json");
    const contract = resolve(root, "contract.json");
    const output = resolve(root, "dist");
    writeFileSync(theme, JSON.stringify({
      $schema: "flowstack.theme.v1",
      metadata: { id: "cli-compiled", name: "CLI Compiled" },
      compatibility: { brick: "^0.1.0" },
      appearances: { supported: ["light"], default: "light" },
    }));
    writeFileSync(contract, JSON.stringify({
      $schema: "flowstack.brick-theme-contract.v1",
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
        defaults: { light: "#554fd8", dark: "#7772ee" },
        tokenPaths: { light: "semantic.light.color.accent.solid", dark: "semantic.dark.color.accent.solid" },
      }],
    }));
    const result = spawnSync(process.execPath, [cli, "compile", theme, "--contract", contract, "--out-dir", output], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Compiled cli-compiled theme/u);
    for (const name of ["theme.css", "theme.tokens.json", "theme.manifest.json", "theme.report.json"]) {
      assert.equal(existsSync(resolve(output, name)), true, `${name} was not emitted`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI validates JSON and rejects invalid definitions", () => {
  const root = mkdtempSync(resolve(tmpdir(), "flowstack-theme-cli-"));
  try {
    const valid = resolve(root, "valid.json");
    const invalid = resolve(root, "invalid.json");
    writeFileSync(valid, JSON.stringify({
      $schema: "flowstack.theme.v1",
      metadata: { id: "cli-theme", name: "CLI Theme" },
      compatibility: { brick: "^0.1.0" },
      appearances: { supported: ["light"], default: "light" },
    }));
    writeFileSync(invalid, JSON.stringify({ $schema: "wrong" }));

    const validResult = spawnSync(process.execPath, [cli, "validate", valid], { encoding: "utf8" });
    assert.equal(validResult.status, 0, validResult.stderr);
    assert.match(validResult.stdout, /Valid cli-theme theme definition/);

    const invalidResult = spawnSync(process.execPath, [cli, "validate", invalid], { encoding: "utf8" });
    assert.equal(invalidResult.status, 1);
    assert.match(invalidResult.stderr, /Theme definition is invalid/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
