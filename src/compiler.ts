import {
  BRICK_THEME_CONTRACT_SCHEMA,
  THEME_MANIFEST_SCHEMA,
  THEME_REPORT_SCHEMA,
  type BrickContractToken,
  type BrickThemeContract,
  type CompiledThemeToken,
  type JsonValue,
  type ThemeAppearance,
  type ThemeCompilation,
  type ThemeCompilationIssue,
  type ThemeCompilationIssueCode,
  type ThemeData,
  type ThemeDefinition,
} from "./types.js";
import { assertThemeDefinition } from "./validation.js";

type PlainObject = Record<string, unknown>;
type FlatValues = Map<string, string | number>;

const aliasPattern = /^\{([^{}\s]+)\}$/u;
const semverPattern = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/u;
const cssNameSegmentPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const cssCustomPropertyPattern = /^--[_a-z][_a-z0-9-]*$/u;
const cssLayerPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const dataAttributePattern = /^data-[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export class ThemeCompilationError extends TypeError {
  readonly issues: readonly ThemeCompilationIssue[];

  constructor(issues: readonly ThemeCompilationIssue[]) {
    super(`Unable to compile FLOWSTACK theme:\n${issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n")}`);
    this.name = "ThemeCompilationError";
    this.issues = issues;
  }
}

function issue(code: ThemeCompilationIssueCode, path: string, message: string): ThemeCompilationIssue {
  return { code, path, message };
}

function isObject(value: unknown): value is PlainObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function contractIssues(input: unknown): ThemeCompilationIssue[] {
  if (!isObject(input)) return [issue("invalid-contract", "$contract", "Expected a Brick theme contract object.")];
  const issues: ThemeCompilationIssue[] = [];
  const classifications = new Set(["required", "derived", "component-input", "optional-extension", "internal"]);
  if (input.$schema !== BRICK_THEME_CONTRACT_SCHEMA) issues.push(issue("invalid-contract", "$contract.$schema", `Expected "${BRICK_THEME_CONTRACT_SCHEMA}".`));
  if (!Number.isInteger(input.contractVersion) || Number(input.contractVersion) < 1) issues.push(issue("invalid-contract", "$contract.contractVersion", "Expected a positive integer."));
  if (!isObject(input.package) || input.package.name !== "@flowstack-ui/brick" || typeof input.package.version !== "string" || !parseVersion(input.package.version)) issues.push(issue("invalid-contract", "$contract.package", "Expected an @flowstack-ui/brick package and semantic version."));
  if (!isObject(input.css) || input.css.variablePrefix !== "--brick-" || typeof input.css.themeLayer !== "string" || !cssLayerPattern.test(input.css.themeLayer) || typeof input.css.themeAttribute !== "string" || !dataAttributePattern.test(input.css.themeAttribute) || typeof input.css.appearanceAttribute !== "string" || !dataAttributePattern.test(input.css.appearanceAttribute) || !Array.isArray(input.css.appearanceValues) || input.css.appearanceValues.some((value) => value !== "light" && value !== "dark")) issues.push(issue("invalid-contract", "$contract.css", "Expected the safe Brick CSS activation contract."));
  if (!Array.isArray(input.tokens)) {
    issues.push(issue("invalid-contract", "$contract.tokens", "Expected a token array."));
  } else {
    const names = new Set<string>();
    input.tokens.forEach((token, index) => {
      if (!isObject(token) || typeof token.name !== "string" || !cssCustomPropertyPattern.test(token.name) || typeof token.classification !== "string" || !classifications.has(token.classification) || (typeof token.type !== "string" && token.type !== null)) {
        issues.push(issue("invalid-contract", `$contract.tokens[${index}]`, "Expected a named, classified, typed token."));
      } else if ((token.classification === "required" || token.classification === "derived") && (typeof token.type !== "string" || !isObject(token.defaults) || !isObject(token.tokenPaths))) {
        issues.push(issue("invalid-contract", `$contract.tokens[${index}]`, "Required and derived tokens need defaults and token paths."));
      }
      if (isObject(token) && typeof token.name === "string") {
        if (names.has(token.name)) issues.push(issue("invalid-contract", `$contract.tokens[${index}].name`, `Duplicate token "${token.name}".`));
        names.add(token.name);
      }
    });
    if (Array.isArray(input.atomicColorFamilies)) {
      for (const [index, family] of input.atomicColorFamilies.entries()) {
        if (!isObject(family) || !Array.isArray(family.tokens)) continue;
        for (const name of family.tokens) {
          if (typeof name !== "string" || !names.has(name)) issues.push(issue("invalid-contract", `$contract.atomicColorFamilies[${index}].tokens`, `Unknown family token "${String(name)}".`));
        }
      }
    }
  }
  if (!Array.isArray(input.atomicColorFamilies) || input.atomicColorFamilies.some((family) => !isObject(family) || typeof family.id !== "string" || !Array.isArray(family.tokens))) issues.push(issue("invalid-contract", "$contract.atomicColorFamilies", "Expected named atomic families with token arrays."));
  if (!Array.isArray(input.componentThemeInputs) || input.componentThemeInputs.some((entry) => !isObject(entry) || typeof entry.name !== "string" || !cssCustomPropertyPattern.test(entry.name) || typeof entry.type !== "string" || typeof entry.component !== "string" || typeof entry.fallback !== "string" || typeof entry.supportedRange !== "string")) issues.push(issue("invalid-contract", "$contract.componentThemeInputs", "Expected declared component theme inputs."));
  return issues;
}

export function assertBrickThemeContract(input: unknown): asserts input is BrickThemeContract {
  const issues = contractIssues(input);
  if (issues.length > 0) throw new ThemeCompilationError(issues);
}

function parseVersion(value: string): readonly [number, number, number] | undefined {
  const match = semverPattern.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function compareVersion(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function satisfiesComparator(version: string, range: string): boolean {
  const actual = parseVersion(version);
  if (!actual) return false;
  const trimmed = range.trim();
  if (trimmed === "*" || trimmed.toLowerCase() === "latest") return true;
  const operator = /^(\^|~|>=|<=|>|<|=)?\s*(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/u.exec(trimmed);
  if (!operator) return false;
  const expected = parseVersion(operator[2]);
  if (!expected) return false;
  const comparison = compareVersion(actual, expected);
  switch (operator[1] ?? "=") {
    case "^": {
      const ceiling: readonly number[] = expected[0] > 0 ? [expected[0] + 1, 0, 0] : expected[1] > 0 ? [0, expected[1] + 1, 0] : [0, 0, expected[2] + 1];
      return comparison >= 0 && compareVersion(actual, ceiling) < 0;
    }
    case "~": return comparison >= 0 && compareVersion(actual, [expected[0], expected[1] + 1, 0]) < 0;
    case ">=": return comparison >= 0;
    case "<=": return comparison <= 0;
    case ">": return comparison > 0;
    case "<": return comparison < 0;
    default: return comparison === 0;
  }
}

function satisfiesRange(version: string, range: string): boolean {
  return range.split("||").some((alternative) => {
    const comparators = alternative.trim().split(/\s+/u).filter(Boolean);
    return comparators.length > 0 && comparators.every((comparator) => satisfiesComparator(version, comparator));
  });
}

function flatten(value: unknown, path: string, output: FlatValues, issues: ThemeCompilationIssue[], allowArrays = true): void {
  if (typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) {
    output.set(path, value);
    return;
  }
  if (Array.isArray(value) && allowArrays) {
    value.forEach((entry, index) => flatten(entry, path ? `${path}.${index}` : String(index), output, issues, allowArrays));
    return;
  }
  if (isObject(value)) {
    for (const key of Object.keys(value).sort()) flatten(value[key], path ? `${path}.${key}` : key, output, issues, allowArrays);
    return;
  }
  issues.push(issue("invalid-token-value", path ? `$.${path}` : "$", "Compiled token leaves must be strings or finite numbers."));
}

function resolveAliases(values: FlatValues, issues: ThemeCompilationIssue[]): FlatValues {
  const resolved = new Map<string, string | number>();
  const active: string[] = [];
  const visit = (path: string): string | number | undefined => {
    if (resolved.has(path)) return resolved.get(path);
    const cycleIndex = active.indexOf(path);
    if (cycleIndex >= 0) {
      issues.push(issue("alias-cycle", `$.${path}`, `Circular alias: ${[...active.slice(cycleIndex), path].join(" -> ")}.`));
      return undefined;
    }
    const raw = values.get(path);
    if (raw === undefined) {
      issues.push(issue("invalid-alias", `$.${active.at(-1) ?? path}`, `Unknown alias target "${path}".`));
      return undefined;
    }
    active.push(path);
    const match = typeof raw === "string" ? aliasPattern.exec(raw) : null;
    const value = match ? visit(match[1]) : raw;
    active.pop();
    if (value !== undefined) resolved.set(path, value);
    return value;
  };
  for (const path of [...values.keys()].sort()) visit(path);
  return resolved;
}

function tokenAuthorPath(token: BrickContractToken, appearance: ThemeAppearance): string | undefined {
  const path = token.tokenPaths?.[appearance];
  const prefix = `semantic.${appearance}.`;
  return path?.startsWith(prefix) ? path.slice(prefix.length) : undefined;
}

function validCssValue(type: string, value: string | number): boolean {
  if (typeof value === "number") return type === "number" || type === "fontWeight";
  const trimmed = value.trim();
  if (trimmed.length === 0 || /[;{}]/u.test(trimmed)) return false;
  switch (type) {
    case "number": return /^-?(?:\d+|\d*\.\d+)$/u.test(trimmed) || /^(?:calc|min|max|clamp)\(/u.test(trimmed);
    case "fontWeight": return /^(?:[1-9]00|normal|bold|bolder|lighter|var\(.+\))$/u.test(trimmed);
    case "duration": return /^(?:0|(?:\d+|\d*\.\d+)(?:ms|s)|var\(.+\))$/u.test(trimmed);
    case "dimension": return /^(?:0|(?:-?\d+|-?\d*\.\d+)(?:px|rem|em|%|vw|vh|vmin|vmax|ch|ex|cm|mm|in|pt|pc)|(?:calc|min|max|clamp|var)\(.+\))$/u.test(trimmed);
    case "cubicBezier": return /^(?:cubic-bezier|steps|var)\(.+\)|^(?:linear|ease|ease-in|ease-out|ease-in-out)$/u.test(trimmed);
    case "color": return /^(?:#[0-9a-f]{3,8}|[a-z]+|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|var)\(.+\))$/iu.test(trimmed);
    default: return true;
  }
}

function validComponentValue(type: string, supportedRange: string, value: string | number): boolean {
  if (!validCssValue(type, value)) return false;
  if (supportedRange.toLowerCase().includes("non-negative") && typeof value === "string" && /^-\d/u.test(value.trim())) return false;
  if (supportedRange.toLowerCase().includes("non-negative") && typeof value === "number" && value < 0) return false;
  return true;
}

function cssSegment(path: string, issues: ThemeCompilationIssue[]): string | undefined {
  const segments = path.split(".").map((part) => part
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase());
  if (segments.some((part) => !cssNameSegmentPattern.test(part))) {
    issues.push(issue("invalid-token-value", `$.${path}`, "Token path segments must form lowercase kebab-case CSS names."));
    return undefined;
  }
  return segments.join("-");
}

function setNestedToken(root: PlainObject, path: string, value: string | number, type?: string): void {
  const segments = path.split(".");
  let current = root;
  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      current[segment] = { $value: value, ...(type ? { $type: type } : {}) };
    } else {
      const next = current[segment];
      if (!isObject(next) || "$value" in next) current[segment] = {};
      current = current[segment] as PlainObject;
    }
  });
}

function declarations(tokens: readonly CompiledThemeToken[], colorScheme?: ThemeAppearance | "light dark"): string {
  return [
    ...(colorScheme ? [`    color-scheme: ${colorScheme};`] : []),
    ...[...tokens].sort((a, b) => compareText(a.name, b.name)).map((token) => `    ${token.name}: ${String(token.value)};`),
  ].join("\n");
}

function selector(attribute: string, value: string): string {
  return `[${attribute}="${value}"]`;
}

function buildCss(definition: ThemeDefinition, contract: BrickThemeContract, invariant: readonly CompiledThemeToken[], byAppearance: Readonly<Record<ThemeAppearance, readonly CompiledThemeToken[]>>): string {
  const themeSelector = selector(contract.css.themeAttribute, definition.metadata.id);
  const appearanceAttribute = contract.css.appearanceAttribute;
  const defaultAppearance = definition.appearances.default === "system" ? "light" : definition.appearances.default;
  const blocks: string[] = [];
  const base = [...invariant, ...byAppearance[defaultAppearance]];
  const baseColorScheme = definition.appearances.default === "system" ? "light dark" : defaultAppearance;
  blocks.push(`  :where(${themeSelector}) {\n${declarations(base, baseColorScheme)}\n  }`);
  if (definition.appearances.default === "system") {
    blocks.push(`  @media (prefers-color-scheme: dark) {\n    :where(${themeSelector}:not([${appearanceAttribute}])) {\n${declarations(byAppearance.dark).replace(/^/gmu, "  ")}\n    }\n  }`);
  }
  for (const appearance of definition.appearances.supported) {
    const explicit = selector(appearanceAttribute, appearance);
    blocks.push(`  :where(${themeSelector}${explicit}),\n  :where(${themeSelector} ${explicit}) {\n${declarations(byAppearance[appearance], appearance)}\n  }`);
  }
  return `@layer ${contract.css.themeLayer} {\n${blocks.join("\n\n")}\n}\n`;
}

function data(value: unknown): ThemeData {
  return isObject(value) ? value as ThemeData : {};
}

export function compileTheme(definitionInput: unknown, contractInput: unknown): ThemeCompilation {
  assertThemeDefinition(definitionInput);
  assertBrickThemeContract(contractInput);
  const definition = definitionInput;
  const contract = contractInput;
  const issues: ThemeCompilationIssue[] = [];
  if (!satisfiesRange(contract.package.version, definition.compatibility.brick)) {
    issues.push(issue("incompatible-brick", "$.compatibility.brick", `Brick ${contract.package.version} does not satisfy "${definition.compatibility.brick}".`));
  }
  for (const appearance of definition.appearances.supported) {
    if (!contract.css.appearanceValues.includes(appearance)) issues.push(issue("unsupported-appearance", "$.appearances.supported", `Brick does not support "${appearance}".`));
  }

  const authorValues: FlatValues = new Map();
  for (const section of ["palettes", "roles", "brick", "foundations", "components", "extensions"] as const) {
    if (definition[section]) flatten(definition[section], section, authorValues, issues);
  }
  const resolved = resolveAliases(authorValues, issues);
  const consumed = new Set<string>();
  const requiredTokens = contract.tokens.filter((token) => token.classification === "required");
  const derivedTokens = contract.tokens.filter((token) => token.classification === "derived");
  const requiredByName = new Map(requiredTokens.map((token) => [token.name, token]));
  const appearanceTokens: Record<ThemeAppearance, CompiledThemeToken[]> = { light: [], dark: [] };
  const invariantTokens: CompiledThemeToken[] = [];
  let inherited = 0;
  let overridden = 0;

  for (const appearance of definition.appearances.supported) {
    for (const token of requiredTokens) {
      const semanticPath = tokenAuthorPath(token, appearance);
      if (!semanticPath) {
        issues.push(issue("invalid-contract", `$contract.tokens.${token.name}`, `Missing semantic ${appearance} path.`));
        continue;
      }
      const authorPath = `brick.${appearance}.${semanticPath}`;
      const authored = resolved.get(authorPath);
      const value = authored ?? token.defaults?.[appearance];
      if (value === undefined) {
        issues.push(issue("invalid-contract", `$contract.tokens.${token.name}`, `Missing ${appearance} default.`));
        continue;
      }
      if (typeof token.type !== "string") {
        issues.push(issue("invalid-contract", `$contract.tokens.${token.name}`, "Required tokens need a CSS value type."));
        continue;
      }
      if (!validCssValue(token.type, value)) issues.push(issue("invalid-token-value", `$.${authorPath}`, `Expected Brick ${token.type} syntax.`));
      if (authored === undefined) inherited += 1; else { overridden += 1; consumed.add(authorPath); }
      appearanceTokens[appearance].push({ name: token.name, path: authorPath, type: token.type, appearance, value, source: authored === undefined ? "default" : "theme" });
    }
  }

  for (const family of contract.atomicColorFamilies) {
    for (const appearance of definition.appearances.supported) {
      const paths = family.tokens.map((name) => requiredByName.get(name)).filter((token): token is BrickContractToken => Boolean(token)).map((token) => tokenAuthorPath(token, appearance)).filter((path): path is string => Boolean(path)).map((path) => `brick.${appearance}.${path}`);
      const count = paths.filter((path) => resolved.has(path)).length;
      if (count > 0 && count !== paths.length) issues.push(issue("incomplete-family", `$.brick.${appearance}.color.${family.id}`, `Atomic family "${family.id}" must define all ${paths.length} values; received ${count}.`));
    }
  }

  let foundationCount = 0;
  for (const token of derivedTokens) {
    const semanticPath = tokenAuthorPath(token, "light") ?? tokenAuthorPath(token, "dark");
    if (!semanticPath) continue;
    const authorPath = `foundations.${semanticPath}`;
    const value = resolved.get(authorPath);
    if (value === undefined) continue;
    consumed.add(authorPath);
    foundationCount += 1;
    if (typeof token.type !== "string") {
      issues.push(issue("invalid-contract", `$contract.tokens.${token.name}`, "Derived tokens need a CSS value type."));
      continue;
    }
    if (!validCssValue(token.type, value)) issues.push(issue("invalid-token-value", `$.${authorPath}`, `Expected Brick ${token.type} syntax.`));
    invariantTokens.push({ name: token.name, path: authorPath, type: token.type, value, source: "theme" });
  }

  let componentCount = 0;
  for (const input of contract.componentThemeInputs) {
    const suffix = input.name.startsWith(contract.css.variablePrefix) ? input.name.slice(contract.css.variablePrefix.length) : input.name.replace(/^--/u, "");
    const authorPath = `components.${suffix.replace(/-/gu, ".")}`;
    const value = resolved.get(authorPath);
    if (value === undefined) continue;
    consumed.add(authorPath);
    componentCount += 1;
    if (!validComponentValue(input.type, input.supportedRange, value)) issues.push(issue("invalid-token-value", `$.${authorPath}`, `Expected ${input.supportedRange}.`));
    invariantTokens.push({ name: input.name, path: authorPath, type: input.type, value, source: "theme" });
  }

  const projectTokens: CompiledThemeToken[] = [];
  const cssNames = new Map<string, string>();
  for (const [path, value] of [...resolved].sort(([left], [right]) => compareText(left, right))) {
    const section = path.split(".")[0];
    if (section !== "palettes" && section !== "roles" && section !== "extensions") continue;
    consumed.add(path);
    if (typeof value === "string" && (value.trim().length === 0 || /[;{}]/u.test(value))) {
      issues.push(issue("invalid-token-value", `$.${path}`, "Project token values must be safe, non-empty CSS values."));
    }
    const cssPath = cssSegment(path, issues);
    if (!cssPath) continue;
    const name = `--flowstack-theme-${cssPath}`;
    const previous = cssNames.get(name);
    if (previous && previous !== path) issues.push(issue("naming-collision", `$.${path}`, `Both "${previous}" and "${path}" compile to ${name}.`));
    cssNames.set(name, path);
    projectTokens.push({ name, path, type: typeof value === "number" ? "number" : "string", value, source: "theme" });
  }
  invariantTokens.push(...projectTokens);

  for (const path of [...authorValues.keys()].sort()) {
    if (consumed.has(path) || !resolved.has(path)) continue;
    if (path.startsWith("brick.")) issues.push(issue("unknown-token", `$.${path}`, "This is not a required Brick semantic token."));
    else if (path.startsWith("foundations.")) issues.push(issue("unknown-token", `$.${path}`, "This is not a supported Brick foundation token."));
    else if (path.startsWith("components.")) issues.push(issue("unsupported-component-input", `$.${path}`, "Brick does not declare this component theme input."));
  }
  if (issues.length > 0) throw new ThemeCompilationError(issues);

  const allTokens = [...invariantTokens, ...definition.appearances.supported.flatMap((appearance) => appearanceTokens[appearance])];
  const tokenDocument: PlainObject = {
    $schema: "https://www.designtokens.org/tr/drafts/format/",
    $extensions: { "flowstack.theme": { schema: "flowstack.theme-tokens.v1", id: definition.metadata.id, brickVersion: contract.package.version } },
  };
  for (const token of [...allTokens].sort((a, b) => compareText(a.path, b.path))) setNestedToken(tokenDocument, token.path, token.value, token.type ?? undefined);
  const extensionNamespaces = Object.keys(data(definition.extensions)).sort();
  const manifest = {
    $schema: THEME_MANIFEST_SCHEMA,
    theme: definition.metadata,
    compatibility: definition.compatibility,
    brickContract: { schema: contract.$schema, version: contract.contractVersion, package: contract.package },
    appearances: definition.appearances,
    activation: { themeAttribute: contract.css.themeAttribute, appearanceAttribute: contract.css.appearanceAttribute, cssLayer: contract.css.themeLayer },
    artifacts: { css: "theme.css", tokens: "theme.tokens.json", manifest: "theme.manifest.json", report: "theme.report.json" } as const,
    extensionNamespaces,
    requirements: data(definition.requirements),
    guidance: data(definition.guidance),
  } as const;
  const report = {
    $schema: THEME_REPORT_SCHEMA,
    valid: true,
    themeId: definition.metadata.id,
    brickVersion: contract.package.version,
    counts: { emitted: allTokens.length, brickRequired: requiredTokens.length * definition.appearances.supported.length, brickInherited: inherited, brickOverridden: overridden, foundations: foundationCount, componentInputs: componentCount, projectTokens: projectTokens.length },
    warnings: [] as readonly string[],
  } as const;
  return { css: buildCss(definition, contract, invariantTokens, appearanceTokens), tokens: tokenDocument as Readonly<Record<string, JsonValue>>, manifest, report, resolvedTokens: allTokens };
}
