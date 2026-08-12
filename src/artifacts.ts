import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertBrickThemeContract, compileTheme } from "./compiler.js";
import type { BrickThemeContract, ThemeCompilation } from "./types.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

function json(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export async function loadBrickThemeContract(path: string): Promise<BrickThemeContract> {
  const contract: unknown = JSON.parse(await readFile(resolve(path), "utf8"));
  assertBrickThemeContract(contract);
  return contract;
}

export async function compileThemeFiles(themePath: string, contractPath: string): Promise<ThemeCompilation> {
  const [definition, contract] = await Promise.all([
    readFile(resolve(themePath), "utf8").then((value) => JSON.parse(value) as unknown),
    loadBrickThemeContract(contractPath),
  ]);
  return compileTheme(definition, contract);
}

export async function writeThemeArtifacts(compilation: ThemeCompilation, outputDirectory: string): Promise<void> {
  const directory = resolve(outputDirectory);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(resolve(directory, "theme.css"), compilation.css),
    writeFile(resolve(directory, "theme.tokens.json"), json(compilation.tokens)),
    writeFile(resolve(directory, "theme.manifest.json"), json(compilation.manifest)),
    writeFile(resolve(directory, "theme.report.json"), json(compilation.report)),
  ]);
}
