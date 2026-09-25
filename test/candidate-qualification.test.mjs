import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

function rejectCandidate(settings, message) {
  const env = { ...process.env };
  for (const key of ["FLOWSTACK_BRICK_ARCHIVE", "FLOWSTACK_BRICK_VERSION", "FLOWSTACK_BRICK_SHA256", "FLOWSTACK_ATOM_ARCHIVE", "FLOWSTACK_ATOM_SHA256"]) delete env[key];
  const result = spawnSync(process.execPath, ["scripts/verify-package.mjs"], {
    encoding: "utf8", env: { ...env, ...settings }, timeout: 10000,
  });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, message);
}

test("candidate version cannot silently replace the released baseline", () => {
  rejectCandidate({ FLOWSTACK_BRICK_VERSION: "0.3.0" }, /a candidate version requires a Brick archive/);
});

test("candidate archives require recorded SHA-256 before archive inspection", () => {
  rejectCandidate({ FLOWSTACK_BRICK_ARCHIVE: resolve("package.json"), FLOWSTACK_ATOM_ARCHIVE: resolve("package.json") }, /Brick candidate requires its SHA-256/);
});

test("changed archive bytes fail before parsing or installation", () => {
  rejectCandidate({ FLOWSTACK_BRICK_ARCHIVE: resolve("package.json"), FLOWSTACK_ATOM_ARCHIVE: resolve("package.json"), FLOWSTACK_BRICK_SHA256: "0".repeat(64) }, /Brick archive digest mismatch/);
});
