#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateThemeDefinition } from "./validation.js";

const help = `@flowstack-ui/theme

Usage:
  flowstack-theme validate <theme.json>
  flowstack-theme --help

The bootstrap CLI validates JSON definitions using flowstack.theme.v1.
TypeScript loading and Brick-aware compilation arrive in later batches.`;

async function main(args: readonly string[]): Promise<number> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    console.log(help);
    return 0;
  }

  if (args[0] !== "validate" || args.length !== 2) {
    console.error(help);
    return 2;
  }

  const path = resolve(args[1]);
  let input: unknown;
  try {
    input = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Unable to read ${path}: ${message}`);
    return 2;
  }

  const result = validateThemeDefinition(input);
  if (!result.valid) {
    console.error(`Theme definition is invalid:\n${result.issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n")}`);
    return 1;
  }

  console.log(`Valid ${input && typeof input === "object" && "metadata" in input && input.metadata && typeof input.metadata === "object" && "id" in input.metadata ? String(input.metadata.id) : "FLOWSTACK"} theme definition.`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
