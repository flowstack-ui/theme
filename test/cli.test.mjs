import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

const cli = resolve("dist/cli.js");

test("CLI help describes the bootstrap boundary", () => {
  const result = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /flowstack-theme validate/);
  assert.match(result.stdout, /later batches/);
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
