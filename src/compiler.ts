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
  type ThemeContrastPairResult,
  type ThemeData,
  type ThemeDefinition,
  type ThemeProjectContrastPair,
  type ThemeProjectContrastPairResult,
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
const componentAuthorPathPattern = /^[a-z0-9]+(?:\.[a-z0-9]+)*$/u;

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
  const classifications = new Set(["required", "derived", "component-input", "optional-extension", "internal", "deprecated"]);
  if (input.$schema !== BRICK_THEME_CONTRACT_SCHEMA) issues.push(issue("invalid-contract", "$contract.$schema", `Expected "${BRICK_THEME_CONTRACT_SCHEMA}".`));
  if (!Number.isInteger(input.contractVersion) || Number(input.contractVersion) < 2) issues.push(issue("invalid-contract", "$contract.contractVersion", "Theme contrast validation requires Brick theme contract revision 2 or newer."));
  if (!isObject(input.package) || input.package.name !== "@flowstack-ui/brick" || typeof input.package.version !== "string" || !parseVersion(input.package.version)) issues.push(issue("invalid-contract", "$contract.package", "Expected an @flowstack-ui/brick package and semantic version."));
  if (!isObject(input.css) || input.css.variablePrefix !== "--brick-" || typeof input.css.themeLayer !== "string" || !cssLayerPattern.test(input.css.themeLayer) || typeof input.css.themeAttribute !== "string" || !dataAttributePattern.test(input.css.themeAttribute) || typeof input.css.appearanceAttribute !== "string" || !dataAttributePattern.test(input.css.appearanceAttribute) || !Array.isArray(input.css.appearanceValues) || input.css.appearanceValues.some((value) => value !== "light" && value !== "dark")) issues.push(issue("invalid-contract", "$contract.css", "Expected the safe Brick CSS activation contract."));
  const tokenNames = new Set<string>();
  const requiredColorTokenNames = new Set<string>();
  if (!Array.isArray(input.tokens)) {
    issues.push(issue("invalid-contract", "$contract.tokens", "Expected a token array."));
  } else {
    input.tokens.forEach((token, index) => {
      if (!isObject(token) || typeof token.name !== "string" || !cssCustomPropertyPattern.test(token.name) || typeof token.classification !== "string" || !classifications.has(token.classification) || (typeof token.type !== "string" && token.type !== null)) {
        issues.push(issue("invalid-contract", `$contract.tokens[${index}]`, "Expected a named, classified, typed token."));
      } else if ((token.classification === "required" || token.classification === "derived") && (typeof token.type !== "string" || !isObject(token.defaults) || !isObject(token.tokenPaths))) {
        issues.push(issue("invalid-contract", `$contract.tokens[${index}]`, "Required and derived tokens need defaults and token paths."));
      } else if (token.classification === "deprecated" && (!isObject(token.tokenPaths) || !isObject(token.deprecated) || typeof token.deprecated.replacement !== "string")) {
        issues.push(issue("invalid-contract", `$contract.tokens[${index}]`, "Deprecated tokens need token paths and a replacement token."));
      }
      if (isObject(token) && typeof token.name === "string") {
        if (tokenNames.has(token.name)) issues.push(issue("invalid-contract", `$contract.tokens[${index}].name`, `Duplicate token "${token.name}".`));
        tokenNames.add(token.name);
        if (token.type === "color") {
          if (token.classification === "required") requiredColorTokenNames.add(token.name);
        }
      }
    });
    if (Array.isArray(input.atomicColorFamilies)) {
      for (const [index, family] of input.atomicColorFamilies.entries()) {
        if (!isObject(family) || !Array.isArray(family.tokens)) continue;
        for (const name of family.tokens) {
          if (typeof name !== "string" || !tokenNames.has(name)) issues.push(issue("invalid-contract", `$contract.atomicColorFamilies[${index}].tokens`, `Unknown family token "${String(name)}".`));
        }
      }
    }
  }
  if (Array.isArray(input.tokens)) {
    input.tokens.forEach((token, index) => {
      if (!isObject(token) || token.classification !== "deprecated" || !isObject(token.deprecated) || typeof token.deprecated.replacement !== "string") return;
      if (!tokenNames.has(token.deprecated.replacement) || token.deprecated.replacement === token.name) {
        issues.push(issue("invalid-contract", `$contract.tokens[${index}].deprecated.replacement`, `Unknown replacement token "${token.deprecated.replacement}".`));
      }
      if (token.deprecated.message !== undefined && typeof token.deprecated.message !== "string") {
        issues.push(issue("invalid-contract", `$contract.tokens[${index}].deprecated.message`, "Expected a string deprecation message."));
      }
    });
  }
  if (!Array.isArray(input.atomicColorFamilies) || input.atomicColorFamilies.some((family) => !isObject(family) || typeof family.id !== "string" || !Array.isArray(family.tokens))) issues.push(issue("invalid-contract", "$contract.atomicColorFamilies", "Expected named atomic families with token arrays."));
  const componentInputs = new Map<string, PlainObject>();
  if (!Array.isArray(input.componentThemeInputs)) {
    issues.push(issue("invalid-contract", "$contract.componentThemeInputs", "Expected declared component theme inputs."));
  } else {
    input.componentThemeInputs.forEach((entry, index) => {
      if (!isObject(entry) || typeof entry.name !== "string" || !cssCustomPropertyPattern.test(entry.name) || typeof entry.type !== "string" || typeof entry.component !== "string" || typeof entry.fallback !== "string" || typeof entry.supportedRange !== "string") {
        issues.push(issue("invalid-contract", `$contract.componentThemeInputs[${index}]`, "Expected a declared component theme input."));
        return;
      }
      if (componentInputs.has(entry.name)) issues.push(issue("invalid-contract", `$contract.componentThemeInputs[${index}].name`, `Duplicate component theme input "${entry.name}".`));
      componentInputs.set(entry.name, entry);
      if (entry.allowedValues !== undefined) {
        if (!Array.isArray(entry.allowedValues) || entry.allowedValues.length === 0 || entry.allowedValues.some((value) => typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value))) || new Set(entry.allowedValues).size !== entry.allowedValues.length) {
          issues.push(issue("invalid-contract", `$contract.componentThemeInputs[${index}].allowedValues`, "Expected a non-empty list of unique string or finite-number values."));
        } else if (!entry.allowedValues.includes(entry.fallback)) {
          issues.push(issue("invalid-contract", `$contract.componentThemeInputs[${index}].fallback`, "Categorical component input fallback must be one of allowedValues."));
        }
      }
      if (entry.authorPath !== undefined && (typeof entry.authorPath !== "string" || !componentAuthorPathPattern.test(entry.authorPath))) {
        issues.push(issue("invalid-contract", `$contract.componentThemeInputs[${index}].authorPath`, "Expected a lowercase dot-separated component author path."));
      }
      if (entry.valueAssignments !== undefined) {
        if (!isObject(entry.valueAssignments) || !Array.isArray(entry.allowedValues) || entry.allowedValues.some((value) => typeof value !== "string")) {
          issues.push(issue("invalid-contract", `$contract.componentThemeInputs[${index}].valueAssignments`, "Policy recipes require string allowedValues and an assignment map."));
        } else {
          const expectedKeys = [...entry.allowedValues].sort();
          const actualKeys = Object.keys(entry.valueAssignments).sort();
          if (expectedKeys.length !== actualKeys.length || expectedKeys.some((key, keyIndex) => key !== actualKeys[keyIndex])) {
            issues.push(issue("invalid-contract", `$contract.componentThemeInputs[${index}].valueAssignments`, "Expected one assignment list for every allowed value."));
          }
          let expectedOutputs: string[] | undefined;
          for (const value of entry.allowedValues) {
            const assignments = entry.valueAssignments[value];
            if (!Array.isArray(assignments) || assignments.length === 0) {
              issues.push(issue("invalid-contract", `$contract.componentThemeInputs[${index}].valueAssignments.${value}`, "Expected at least one policy assignment."));
              continue;
            }
            const outputs: string[] = [];
            assignments.forEach((assignment, assignmentIndex) => {
              const path = `$contract.componentThemeInputs[${index}].valueAssignments.${value}[${assignmentIndex}]`;
              if (!isObject(assignment) || typeof assignment.name !== "string" || !cssCustomPropertyPattern.test(assignment.name) || typeof assignment.type !== "string" || (typeof assignment.value !== "string" && (typeof assignment.value !== "number" || !Number.isFinite(assignment.value)))) {
                issues.push(issue("invalid-contract", path, "Expected a named, typed CSS custom-property assignment."));
                return;
              }
              outputs.push(assignment.name);
              if (!tokenNames.has(assignment.name)) issues.push(issue("invalid-contract", `${path}.name`, `Unknown policy output token "${assignment.name}".`));
              if (!validCssValue(assignment.type, assignment.value)) issues.push(issue("invalid-contract", `${path}.value`, `Invalid ${assignment.type} policy value.`));
            });
            outputs.sort();
            if (new Set(outputs).size !== outputs.length) issues.push(issue("invalid-contract", `$contract.componentThemeInputs[${index}].valueAssignments.${value}`, "Policy outputs must be unique."));
            if (expectedOutputs === undefined) expectedOutputs = outputs;
            else if (expectedOutputs.length !== outputs.length || expectedOutputs.some((output, outputIndex) => output !== outputs[outputIndex])) {
              issues.push(issue("invalid-contract", `$contract.componentThemeInputs[${index}].valueAssignments.${value}`, "Every policy value must assign the same output tokens."));
            }
          }
        }
      }
    });
  }
  if (!isObject(input.contrast) || input.contrast.algorithm !== "wcag2-relative-luminance" || input.contrast.colorSpace !== "srgb" || !Array.isArray(input.contrast.pairs)) {
    issues.push(issue("invalid-contract", "$contract.contrast", "Expected the sRGB WCAG 2 contrast contract."));
  } else {
    const pairIds = new Set<string>();
    input.contrast.pairs.forEach((pair, index) => {
      if (!isObject(pair) || typeof pair.id !== "string" || !new Set(["text", "text-distinction", "non-text"]).has(String(pair.kind)) || typeof pair.foreground !== "string" || typeof pair.background !== "string" || typeof pair.minimumRatio !== "number" || !Number.isFinite(pair.minimumRatio) || pair.minimumRatio < 1 || pair.minimumRatio > 21) {
        issues.push(issue("invalid-contract", `$contract.contrast.pairs[${index}]`, "Expected a named text or non-text contrast pair with a ratio from 1 through 21."));
        return;
      }
      if (pairIds.has(pair.id)) issues.push(issue("invalid-contract", `$contract.contrast.pairs[${index}].id`, `Duplicate contrast pair "${pair.id}".`));
      pairIds.add(pair.id);
      if (!requiredColorTokenNames.has(pair.foreground)) issues.push(issue("invalid-contract", `$contract.contrast.pairs[${index}].foreground`, `Expected a required semantic color token; received "${pair.foreground}".`));
      if (!requiredColorTokenNames.has(pair.background)) issues.push(issue("invalid-contract", `$contract.contrast.pairs[${index}].background`, `Expected a required semantic color token; received "${pair.background}".`));
      if (pair.kind === "text" && pair.minimumRatio < 4.5) issues.push(issue("invalid-contract", `$contract.contrast.pairs[${index}].minimumRatio`, "Normal text pairs must require at least 4.5:1."));
      if (pair.kind === "non-text" && pair.minimumRatio < 3) issues.push(issue("invalid-contract", `$contract.contrast.pairs[${index}].minimumRatio`, "Non-text pairs must require at least 3:1."));
      if (pair.kind === "text-distinction" && pair.minimumRatio < 3) issues.push(issue("invalid-contract", `$contract.contrast.pairs[${index}].minimumRatio`, "Text-distinction pairs must require at least 3:1."));
      if (pair.when !== undefined) {
        if (!isObject(pair.when) || typeof pair.when.componentInput !== "string" || (typeof pair.when.equals !== "string" && (typeof pair.when.equals !== "number" || !Number.isFinite(pair.when.equals)))) {
          issues.push(issue("invalid-contract", `$contract.contrast.pairs[${index}].when`, "Expected a component-input equality condition."));
        } else {
          const componentInput = componentInputs.get(pair.when.componentInput);
          if (!componentInput || !Array.isArray(componentInput.allowedValues) || !componentInput.allowedValues.includes(pair.when.equals)) {
            issues.push(issue("invalid-contract", `$contract.contrast.pairs[${index}].when`, "Contrast condition must reference an allowed categorical component-input value."));
          }
        }
      }
    });
  }
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
  if (new Set(["inherit", "initial", "revert", "revert-layer", "unset"]).has(trimmed)) return true;
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

function validComponentValue(input: BrickThemeContract["componentThemeInputs"][number], value: string | number): boolean {
  if (!validCssValue(input.type, value)) return false;
  if (input.allowedValues && !input.allowedValues.includes(value)) return false;
  if (input.supportedRange.toLowerCase().includes("non-negative") && typeof value === "string" && /^-\d/u.test(value.trim())) return false;
  if (input.supportedRange.toLowerCase().includes("non-negative") && typeof value === "number" && value < 0) return false;
  return true;
}

type SrgbColor = readonly [number, number, number];

function parseSrgbChannel(value: string): number | undefined {
  const trimmed = value.trim();
  const percentage = trimmed.endsWith("%");
  const number = Number(percentage ? trimmed.slice(0, -1) : trimmed);
  if (!Number.isFinite(number)) return undefined;
  const normalized = percentage ? number / 100 : number / 255;
  return normalized >= 0 && normalized <= 1 ? normalized : undefined;
}

function opaqueAlpha(value: string | undefined): boolean {
  if (value === undefined) return true;
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) return Number(trimmed.slice(0, -1)) === 100;
  return Number(trimmed) === 1;
}

function parseOpaqueSrgb(value: string | number): SrgbColor | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/u.exec(trimmed)?.[1];
  if (hex) {
    const expanded = hex.length <= 4 ? [...hex].map((part) => `${part}${part}`).join("") : hex;
    if (expanded.length === 8 && expanded.slice(6) !== "ff") return undefined;
    return [0, 2, 4].map((index) => Number.parseInt(expanded.slice(index, index + 2), 16) / 255) as unknown as SrgbColor;
  }

  const functional = /^rgba?\((.*)\)$/u.exec(trimmed)?.[1];
  if (!functional) return undefined;
  let channels: string[];
  let alpha: string | undefined;
  if (functional.includes(",")) {
    const parts = functional.split(",").map((part) => part.trim());
    channels = parts.slice(0, 3);
    alpha = parts[3];
  } else {
    const [channelSource, alphaSource] = functional.split("/").map((part) => part.trim());
    channels = channelSource.split(/\s+/u);
    alpha = alphaSource;
  }
  if (channels.length !== 3 || !opaqueAlpha(alpha)) return undefined;
  const parsed = channels.map(parseSrgbChannel);
  return parsed.every((channel): channel is number => channel !== undefined)
    ? parsed as unknown as SrgbColor
    : undefined;
}

function relativeLuminance(color: SrgbColor): number {
  const [red, green, blue] = color.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) as unknown as SrgbColor;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: SrgbColor, background: SrgbColor): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

function reportContrastRatio(ratio: number): number {
  return Number(ratio.toPrecision(12));
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
  if (definition.appearanceRoles) {
    flatten(definition.appearanceRoles, "appearanceRoles", authorValues, issues);
  }
  const resolved = resolveAliases(authorValues, issues);
  const consumed = new Set<string>();
  const requiredTokens = contract.tokens.filter((token) => token.classification === "required");
  const derivedTokens = contract.tokens.filter((token) => token.classification === "derived");
  const deprecatedTokens = contract.tokens.filter((token) => token.classification === "deprecated");
  const requiredByName = new Map(requiredTokens.map((token) => [token.name, token]));
  const appearanceTokens: Record<ThemeAppearance, CompiledThemeToken[]> = { light: [], dark: [] };
  const invariantTokens: CompiledThemeToken[] = [];
  let inherited = 0;
  let overridden = 0;

  for (const token of deprecatedTokens) {
    for (const appearance of definition.appearances.supported) {
      const semanticPath = tokenAuthorPath(token, appearance);
      if (!semanticPath) continue;
      const authorPath = `brick.${appearance}.${semanticPath}`;
      if (!resolved.has(authorPath)) continue;
      consumed.add(authorPath);
      const replacement = contract.tokens.find(({ name }) => name === token.deprecated?.replacement);
      const replacementPath = replacement ? tokenAuthorPath(replacement, appearance) : undefined;
      const instruction = replacementPath ? `Use "brick.${appearance}.${replacementPath}" instead.` : `Use ${token.deprecated?.replacement} instead.`;
      const detail = token.deprecated?.message ? ` ${token.deprecated.message}` : "";
      issues.push(issue("deprecated-token", `$.${authorPath}`, `${instruction}${detail}`));
    }
  }

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
  const componentValues = new Map<string, string | number>();
  for (const input of contract.componentThemeInputs) {
    const suffix = input.name.startsWith(contract.css.variablePrefix) ? input.name.slice(contract.css.variablePrefix.length) : input.name.replace(/^--/u, "");
    const authorPath = `components.${input.authorPath ?? suffix.replace(/-/gu, ".")}`;
    const value = resolved.get(authorPath);
    componentValues.set(input.name, value ?? input.fallback);
    if (value === undefined) continue;
    consumed.add(authorPath);
    componentCount += 1;
    if (!validComponentValue(input, value)) issues.push(issue("invalid-token-value", `$.${authorPath}`, `Expected ${input.supportedRange}.`));
    invariantTokens.push({ name: input.name, path: authorPath, type: input.type, value, source: "theme" });
    const assignments = input.valueAssignments?.[String(value)];
    if (assignments) {
      for (const assignment of assignments) {
        invariantTokens.push({
          name: assignment.name,
          path: authorPath,
          type: assignment.type,
          value: assignment.value,
          source: "theme",
        });
      }
    }
  }

  const contrastResults: ThemeContrastPairResult[] = [];
  const unverifiableTokens = new Set<string>();
  for (const appearance of definition.appearances.supported) {
    const tokensByName = new Map(appearanceTokens[appearance].map((token) => [token.name, token]));
    for (const pair of contract.contrast.pairs) {
      if (pair.when && componentValues.get(pair.when.componentInput) !== pair.when.equals) continue;
      const foregroundToken = tokensByName.get(pair.foreground);
      const backgroundToken = tokensByName.get(pair.background);
      if (!foregroundToken || !backgroundToken) {
        issues.push(issue("invalid-contract", `$contract.contrast.pairs.${pair.id}`, `Contrast pair tokens are not available for the ${appearance} appearance.`));
        continue;
      }
      const foreground = parseOpaqueSrgb(foregroundToken.value);
      const background = parseOpaqueSrgb(backgroundToken.value);
      for (const [token, parsed] of [[foregroundToken, foreground], [backgroundToken, background]] as const) {
        const key = `${appearance}:${token.name}`;
        if (!parsed && !unverifiableTokens.has(key)) {
          unverifiableTokens.add(key);
          issues.push(issue("unverifiable-contrast", `$.${token.path}`, `Contrast tokens must resolve to an opaque sRGB hex or rgb() color; received "${String(token.value)}".`));
        }
      }
      if (!foreground || !background) continue;
      const ratio = contrastRatio(foreground, background);
      if (ratio < pair.minimumRatio) {
        issues.push(issue("insufficient-contrast", `$contrast.${appearance}.${pair.id}`, `${pair.foreground} against ${pair.background} has ${ratio.toPrecision(6)}:1 contrast; ${pair.minimumRatio}:1 is required.`));
        continue;
      }
      contrastResults.push({
        ...pair,
        appearance,
        foregroundValue: String(foregroundToken.value),
        backgroundValue: String(backgroundToken.value),
        ratio: reportContrastRatio(ratio),
        valid: true,
      });
    }
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

  const appearanceRoleTokens: Record<ThemeAppearance, CompiledThemeToken[]> = { light: [], dark: [] };
  const appearanceRolePaths = new Set<string>();
  for (const path of resolved.keys()) {
    const match = /^appearanceRoles\.(light|dark)\.(.+)$/u.exec(path);
    if (match) appearanceRolePaths.add(match[2]);
  }
  for (const appearance of ["light", "dark"] as const) {
    const hasAppearanceValues = [...resolved.keys()].some((path) => path.startsWith(`appearanceRoles.${appearance}.`));
    if (hasAppearanceValues && !definition.appearances.supported.includes(appearance)) {
      issues.push(issue("unsupported-appearance", `$.appearanceRoles.${appearance}`, `The "${appearance}" role map is not listed in appearances.supported.`));
    }
  }
  for (const logicalPath of [...appearanceRolePaths].sort(compareText)) {
    const cssPath = cssSegment(`roles.${logicalPath}`, issues);
    if (!cssPath) continue;
    const name = `--flowstack-theme-${cssPath}`;
    const invariantPath = cssNames.get(name);
    if (invariantPath) {
      issues.push(issue("naming-collision", `$.appearanceRoles`, `Appearance role "${logicalPath}" and "${invariantPath}" both compile to ${name}.`));
      continue;
    }
    cssNames.set(name, `appearanceRoles.${logicalPath}`);
    for (const appearance of definition.appearances.supported) {
      const path = `appearanceRoles.${appearance}.${logicalPath}`;
      const value = resolved.get(path);
      if (value === undefined) {
        issues.push(issue("missing-appearance-role", `$.${path}`, `Appearance role "${logicalPath}" must define every supported appearance.`));
        continue;
      }
      consumed.add(path);
      if (typeof value === "string" && (value.trim().length === 0 || /[;{}]/u.test(value))) {
        issues.push(issue("invalid-token-value", `$.${path}`, "Appearance role values must be safe, non-empty CSS values."));
      }
      appearanceRoleTokens[appearance].push({
        name,
        path,
        type: typeof value === "number" ? "number" : "string",
        appearance,
        value,
        source: "theme",
      });
    }
  }
  for (const appearance of definition.appearances.supported) {
    appearanceTokens[appearance].push(...appearanceRoleTokens[appearance]);
  }

  const projectContrastResults: ThemeProjectContrastPairResult[] = [];
  const projectPairIds = new Set<string>();
  for (const [pairIndex, pair] of (definition.relationships?.contrast ?? []).entries()) {
    const pairPath = `$.relationships.contrast[${pairIndex}]`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(pair.id)) {
      issues.push(issue("invalid-project-relationship", `${pairPath}.id`, "Use a lowercase kebab-case relationship id."));
    }
    if (projectPairIds.has(pair.id)) {
      issues.push(issue("invalid-project-relationship", `${pairPath}.id`, `Duplicate project contrast relationship "${pair.id}".`));
    }
    projectPairIds.add(pair.id);
    if (!new Set(["text", "text-distinction", "non-text"]).has(pair.kind)) {
      issues.push(issue("invalid-project-relationship", `${pairPath}.kind`, "Expected text, text-distinction, or non-text."));
    }
    if (!Number.isFinite(pair.minimumRatio) || pair.minimumRatio < 1 || pair.minimumRatio > 21) {
      issues.push(issue("invalid-project-relationship", `${pairPath}.minimumRatio`, "Expected a ratio from 1 through 21."));
    } else if (pair.kind === "text" && pair.minimumRatio < 4.5) {
      issues.push(issue("invalid-project-relationship", `${pairPath}.minimumRatio`, "Normal text pairs must require at least 4.5:1."));
    } else if ((pair.kind === "non-text" || pair.kind === "text-distinction") && pair.minimumRatio < 3) {
      issues.push(issue("invalid-project-relationship", `${pairPath}.minimumRatio`, "Non-text and text-distinction pairs must require at least 3:1."));
    }
    for (const appearance of definition.appearances.supported) {
      const foregroundPath = `appearanceRoles.${appearance}.${pair.foreground}`;
      const backgroundPath = `appearanceRoles.${appearance}.${pair.background}`;
      const foregroundValue = resolved.get(foregroundPath);
      const backgroundValue = resolved.get(backgroundPath);
      if (foregroundValue === undefined || backgroundValue === undefined) {
        const missing = foregroundValue === undefined ? pair.foreground : pair.background;
        issues.push(issue("invalid-project-relationship", `${pairPath}.${foregroundValue === undefined ? "foreground" : "background"}`, `Unknown ${appearance} appearance role "${missing}".`));
        continue;
      }
      const foreground = parseOpaqueSrgb(foregroundValue);
      const background = parseOpaqueSrgb(backgroundValue);
      if (!foreground) {
        issues.push(issue("unverifiable-contrast", `$.${foregroundPath}`, `Project contrast roles must resolve to an opaque sRGB hex or rgb() color; received "${String(foregroundValue)}".`));
      }
      if (!background) {
        issues.push(issue("unverifiable-contrast", `$.${backgroundPath}`, `Project contrast roles must resolve to an opaque sRGB hex or rgb() color; received "${String(backgroundValue)}".`));
      }
      if (!foreground || !background) continue;
      const ratio = contrastRatio(foreground, background);
      if (ratio < pair.minimumRatio) {
        issues.push(issue("insufficient-contrast", `$projectContrast.${appearance}.${pair.id}`, `${pair.foreground} against ${pair.background} has ${ratio.toPrecision(6)}:1 contrast; ${pair.minimumRatio}:1 is required.`));
        continue;
      }
      projectContrastResults.push({
        ...(pair as ThemeProjectContrastPair),
        appearance,
        foregroundValue: String(foregroundValue),
        backgroundValue: String(backgroundValue),
        ratio: reportContrastRatio(ratio),
        valid: true,
      });
    }
  }

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
    counts: { emitted: allTokens.length, brickRequired: requiredTokens.length * definition.appearances.supported.length, brickInherited: inherited, brickOverridden: overridden, foundations: foundationCount, componentInputs: componentCount, contrastPairs: contrastResults.length + projectContrastResults.length, brickContrastPairs: contrastResults.length, projectContrastPairs: projectContrastResults.length, projectTokens: projectTokens.length + definition.appearances.supported.reduce((total, appearance) => total + appearanceRoleTokens[appearance].length, 0) },
    contrast: {
      algorithm: contract.contrast.algorithm,
      colorSpace: contract.contrast.colorSpace,
      pairs: contrastResults,
      projectPairs: projectContrastResults,
    },
    warnings: [] as readonly string[],
  } as const;
  return { css: buildCss(definition, contract, invariantTokens, appearanceTokens), tokens: tokenDocument as Readonly<Record<string, JsonValue>>, manifest, report, resolvedTokens: allTokens };
}
