import {
  THEME_DEFINITION_SCHEMA,
  type ThemeAppearance,
  type ThemeDefinition,
  type ThemeValidationIssue,
  type ThemeValidationIssueCode,
  type ThemeValidationResult,
} from "./types.js";

const topLevelKeys = new Set([
  "$schema",
  "metadata",
  "compatibility",
  "appearances",
  "palettes",
  "roles",
  "appearanceRoles",
  "brick",
  "foundations",
  "components",
  "extensions",
  "relationships",
  "requirements",
  "guidance",
]);

const metadataKeys = new Set(["id", "name", "description"]);
const compatibilityKeys = new Set(["brick"]);
const appearanceKeys = new Set(["supported", "default"]);
const appearanceRoleKeys = new Set(["light", "dark"]);
const relationshipKeys = new Set(["contrast"]);
const contrastPairKeys = new Set([
  "id",
  "kind",
  "foreground",
  "background",
  "minimumRatio",
]);
const dataSectionKeys = [
  "palettes",
  "roles",
  "brick",
  "foundations",
  "components",
  "extensions",
  "requirements",
  "guidance",
] as const;
const themeIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export class ThemeValidationError extends TypeError {
  readonly issues: readonly ThemeValidationIssue[];

  constructor(issues: readonly ThemeValidationIssue[]) {
    super(
      `Invalid FLOWSTACK theme definition:\n${issues
        .map((issue) => `- ${issue.path}: ${issue.message}`)
        .join("\n")}`,
    );
    this.name = "ThemeValidationError";
    this.issues = issues;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function addIssue(
  issues: ThemeValidationIssue[],
  code: ThemeValidationIssueCode,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  issues: ThemeValidationIssue[],
): void {
  for (const key of Object.keys(value).sort()) {
    if (!allowed.has(key)) {
      addIssue(issues, "unknown-key", `${path}.${key}`, `Unknown field "${key}".`);
    }
  }
}

function requireObject(
  parent: Record<string, unknown>,
  key: string,
  issues: ThemeValidationIssue[],
): Record<string, unknown> | undefined {
  const value = parent[key];
  if (value === undefined) {
    addIssue(issues, "missing-value", `$.${key}`, "This object is required.");
    return undefined;
  }
  if (!isPlainObject(value)) {
    addIssue(issues, "invalid-type", `$.${key}`, "Expected a plain object.");
    return undefined;
  }
  return value;
}

function requireNonEmptyString(
  parent: Record<string, unknown>,
  key: string,
  path: string,
  issues: ThemeValidationIssue[],
): string | undefined {
  const value = parent[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    addIssue(issues, value === undefined ? "missing-value" : "invalid-type", `${path}.${key}`, "Expected a non-empty string.");
    return undefined;
  }
  return value;
}

function validateJsonValue(
  value: unknown,
  path: string,
  issues: ThemeValidationIssue[],
  active: Set<object>,
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      addIssue(issues, "non-serializable", path, "Numbers must be finite JSON values.");
    }
    return;
  }
  if (typeof value !== "object") {
    addIssue(issues, "non-serializable", path, `Values of type ${typeof value} are not JSON-compatible.`);
    return;
  }
  if (active.has(value)) {
    addIssue(issues, "non-serializable", path, "Cyclic values are not JSON-compatible.");
    return;
  }

  active.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJsonValue(entry, `${path}[${index}]`, issues, active));
    active.delete(value);
    return;
  }
  if (!isPlainObject(value)) {
    addIssue(issues, "non-serializable", path, "Expected a JSON-compatible plain object.");
    active.delete(value);
    return;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    addIssue(issues, "non-serializable", path, "Symbol keys are not JSON-compatible.");
  }
  for (const key of Object.keys(value).sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.get || descriptor?.set) {
      addIssue(issues, "non-serializable", `${path}.${key}`, "Accessors are not valid theme data.");
      continue;
    }
    validateJsonValue(value[key], `${path}.${key}`, issues, active);
  }
  active.delete(value);
}

function validateMetadata(root: Record<string, unknown>, issues: ThemeValidationIssue[]): void {
  const metadata = requireObject(root, "metadata", issues);
  if (!metadata) return;
  rejectUnknownKeys(metadata, metadataKeys, "$.metadata", issues);
  const id = requireNonEmptyString(metadata, "id", "$.metadata", issues);
  requireNonEmptyString(metadata, "name", "$.metadata", issues);
  if (id && !themeIdPattern.test(id)) {
    addIssue(issues, "invalid-id", "$.metadata.id", "Use lowercase letters, numbers, and single hyphens.");
  }
  if (metadata.description !== undefined && typeof metadata.description !== "string") {
    addIssue(issues, "invalid-type", "$.metadata.description", "Expected a string.");
  }
}

function validateCompatibility(root: Record<string, unknown>, issues: ThemeValidationIssue[]): void {
  const compatibility = requireObject(root, "compatibility", issues);
  if (!compatibility) return;
  rejectUnknownKeys(compatibility, compatibilityKeys, "$.compatibility", issues);
  requireNonEmptyString(compatibility, "brick", "$.compatibility", issues);
}

function validateAppearances(root: Record<string, unknown>, issues: ThemeValidationIssue[]): void {
  const appearances = requireObject(root, "appearances", issues);
  if (!appearances) return;
  rejectUnknownKeys(appearances, appearanceKeys, "$.appearances", issues);

  const supported = appearances.supported;
  const accepted = new Set<ThemeAppearance>();
  if (!Array.isArray(supported) || supported.length === 0) {
    addIssue(issues, supported === undefined ? "missing-value" : "invalid-type", "$.appearances.supported", "Expected a non-empty array containing light and/or dark.");
  } else {
    supported.forEach((appearance, index) => {
      if (appearance !== "light" && appearance !== "dark") {
        addIssue(issues, "invalid-appearance", `$.appearances.supported[${index}]`, "Expected light or dark.");
      } else if (accepted.has(appearance)) {
        addIssue(issues, "duplicate-appearance", `$.appearances.supported[${index}]`, `Appearance "${appearance}" is duplicated.`);
      } else {
        accepted.add(appearance);
      }
    });
  }

  const defaultAppearance = appearances.default;
  if (defaultAppearance !== "light" && defaultAppearance !== "dark" && defaultAppearance !== "system") {
    addIssue(issues, defaultAppearance === undefined ? "missing-value" : "invalid-default-appearance", "$.appearances.default", "Expected light, dark, or system.");
  } else if (defaultAppearance === "system") {
    if (!(accepted.has("light") && accepted.has("dark"))) {
      addIssue(issues, "invalid-default-appearance", "$.appearances.default", "System preference requires both light and dark appearances.");
    }
  } else if (!accepted.has(defaultAppearance)) {
    addIssue(issues, "invalid-default-appearance", "$.appearances.default", `Default appearance "${defaultAppearance}" is not supported.`);
  }
}

function validateAppearanceRoles(root: Record<string, unknown>, issues: ThemeValidationIssue[]): void {
  const value = root.appearanceRoles;
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    addIssue(issues, "invalid-type", "$.appearanceRoles", "Expected a plain object when provided.");
    return;
  }
  rejectUnknownKeys(value, appearanceRoleKeys, "$.appearanceRoles", issues);
  for (const appearance of appearanceRoleKeys) {
    if (value[appearance] !== undefined && !isPlainObject(value[appearance])) {
      addIssue(issues, "invalid-type", `$.appearanceRoles.${appearance}`, "Expected a plain object when provided.");
    }
  }
}

function validateRelationships(root: Record<string, unknown>, issues: ThemeValidationIssue[]): void {
  const value = root.relationships;
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    addIssue(issues, "invalid-type", "$.relationships", "Expected a plain object when provided.");
    return;
  }
  rejectUnknownKeys(value, relationshipKeys, "$.relationships", issues);
  if (value.contrast === undefined) return;
  if (!Array.isArray(value.contrast)) {
    addIssue(issues, "invalid-type", "$.relationships.contrast", "Expected an array when provided.");
    return;
  }
  value.contrast.forEach((pair, index) => {
    const path = `$.relationships.contrast[${index}]`;
    if (!isPlainObject(pair)) {
      addIssue(issues, "invalid-type", path, "Expected a plain object contrast relationship.");
      return;
    }
    rejectUnknownKeys(pair, contrastPairKeys, path, issues);
    for (const key of ["id", "kind", "foreground", "background"] as const) {
      if (typeof pair[key] !== "string" || pair[key].trim().length === 0) {
        addIssue(issues, pair[key] === undefined ? "missing-value" : "invalid-type", `${path}.${key}`, "Expected a non-empty string.");
      }
    }
    if (typeof pair.minimumRatio !== "number" || !Number.isFinite(pair.minimumRatio)) {
      addIssue(issues, pair.minimumRatio === undefined ? "missing-value" : "invalid-type", `${path}.minimumRatio`, "Expected a finite number.");
    }
  });
}

export function validateThemeDefinition(input: unknown): ThemeValidationResult {
  const issues: ThemeValidationIssue[] = [];
  validateJsonValue(input, "$", issues, new Set());

  if (!isPlainObject(input)) {
    if (!issues.some((issue) => issue.path === "$")) {
      addIssue(issues, "invalid-type", "$", "Expected a plain object theme definition.");
    }
    return { valid: false, issues };
  }

  rejectUnknownKeys(input, topLevelKeys, "$", issues);
  if (input.$schema !== THEME_DEFINITION_SCHEMA) {
    addIssue(issues, input.$schema === undefined ? "missing-value" : "invalid-schema", "$.$schema", `Expected "${THEME_DEFINITION_SCHEMA}".`);
  }
  validateMetadata(input, issues);
  validateCompatibility(input, issues);
  validateAppearances(input, issues);
  validateAppearanceRoles(input, issues);
  validateRelationships(input, issues);

  for (const key of dataSectionKeys) {
    if (input[key] !== undefined && !isPlainObject(input[key])) {
      addIssue(issues, "invalid-type", `$.${key}`, "Expected a plain object when provided.");
    }
  }

  return { valid: issues.length === 0, issues };
}

export function assertThemeDefinition(input: unknown): asserts input is ThemeDefinition {
  const result = validateThemeDefinition(input);
  if (!result.valid) throw new ThemeValidationError(result.issues);
}

export function isThemeDefinition(input: unknown): input is ThemeDefinition {
  return validateThemeDefinition(input).valid;
}
