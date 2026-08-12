import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { assertBrickThemeContract } from "./compiler.js";
import {
  COLORS_CANDIDATE_SCHEMA,
  COLORS_THEME_SCAFFOLD_REPORT_SCHEMA,
  COLORS_THEME_SCAFFOLD_SCHEMA,
  type BrickAtomicColorFamily,
  type BrickContractToken,
  type BrickThemeContract,
  type ColorsPaletteProfile,
  type ColorsThemeScaffoldIssue,
  type ColorsThemeScaffoldIssueCode,
  type ColorsThemeScaffoldRequest,
  type ColorsThemeScaffoldResult,
  type ColorsThemeSemanticTarget,
  type JsonValue,
  type ThemeAppearance,
  type ThemeDefinition,
} from "./types.js";
import { assertThemeDefinition } from "./validation.js";

type PlainObject = Record<string, unknown>;

interface CandidateColor {
  readonly role: string;
  readonly srgb: Readonly<{ hex: string }>;
}

interface CandidateAppearance {
  readonly roles?: Readonly<Record<string, CandidateColor>>;
  readonly steps?: readonly CandidateColor[];
}

interface CandidateFamily {
  readonly id: string;
  readonly profile: ColorsPaletteProfile;
  readonly status: "accepted" | "rejected";
  readonly appearances: Readonly<
    Partial<Record<ThemeAppearance, CandidateAppearance>>
  >;
}

interface ColorsCandidateDocument {
  readonly $schema: typeof COLORS_CANDIDATE_SCHEMA;
  readonly status: "accepted" | "rejected";
  readonly review: Readonly<{
    status: "unreviewed" | "accepted" | "edited" | "rejected";
  }>;
  readonly families: readonly CandidateFamily[];
}

const paletteNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const exactHexPattern = /^#[0-9a-f]{6}$/u;
const semanticTargets = [
  "neutral",
  "accent",
  "focus",
  "danger",
  "info",
  "success",
  "warning",
] as const satisfies readonly ColorsThemeSemanticTarget[];

const interfaceRoleByToken = {
  border: "border",
  "on-soft": "onSoft",
  "on-solid": "onSolid",
  soft: "soft",
  "soft-hover": "softHover",
  "soft-pressed": "softPressed",
  solid: "solid",
  "solid-hover": "solidHover",
  "solid-pressed": "solidPressed",
  surface: "soft",
  text: "text",
} as const satisfies Readonly<Record<string, string>>;

const neutralRoleByFamilyAndToken = {
  surface: {
    base: "surface",
    canvas: "canvas",
    overlay: "surfaceHover",
    raised: "surfaceHover",
    subtle: "surfaceRaised",
  },
  border: {
    default: "border",
    strong: "borderStrong",
    subtle: "border",
  },
  text: {
    disabled: "textMuted",
    inverse: "textInverse",
    muted: "textMuted",
    primary: "textStrong",
    secondary: "text",
  },
} as const satisfies Readonly<Record<string, Readonly<Record<string, string>>>>;

function interfaceRole(token: string): string | undefined {
  return (interfaceRoleByToken as Readonly<Record<string, string>>)[token];
}

function neutralRole(family: string, token: string): string | undefined {
  return (
    neutralRoleByFamilyAndToken as Readonly<
      Record<string, Readonly<Record<string, string>>>
    >
  )[family]?.[token];
}

export class ColorsThemeScaffoldError extends TypeError {
  readonly issues: readonly ColorsThemeScaffoldIssue[];

  constructor(issues: readonly ColorsThemeScaffoldIssue[]) {
    super(
      `Unable to scaffold FLOWSTACK theme from Colors:\n${issues
        .map((entry) => `- ${entry.path}: ${entry.message}`)
        .join("\n")}`,
    );
    this.name = "ColorsThemeScaffoldError";
    this.issues = issues;
  }
}

function issue(
  code: ColorsThemeScaffoldIssueCode,
  path: string,
  message: string,
): ColorsThemeScaffoldIssue {
  return { code, path, message };
}

function isObject(value: unknown): value is PlainObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function json(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

function cloneDefinition(definition: ThemeDefinition): PlainObject {
  return JSON.parse(JSON.stringify(definition)) as PlainObject;
}

function validateCandidateColor(
  value: unknown,
  path: string,
  expectedRole: string,
  issues: ColorsThemeScaffoldIssue[],
): void {
  if (
    !isObject(value)
    || value.role !== expectedRole
    || !isObject(value.srgb)
    || typeof value.srgb.hex !== "string"
    || !exactHexPattern.test(value.srgb.hex)
  ) {
    issues.push(issue(
      "invalid-candidate",
      path,
      "Expected a named candidate value with an exact lowercase six-digit sRGB hex.",
    ));
  }
}

function assertColorsCandidate(input: unknown): asserts input is ColorsCandidateDocument {
  const issues: ColorsThemeScaffoldIssue[] = [];
  if (!isObject(input)) {
    throw new ColorsThemeScaffoldError([
      issue("invalid-candidate", "$candidate", "Expected a Colors candidate object."),
    ]);
  }
  if (input.$schema !== COLORS_CANDIDATE_SCHEMA) {
    issues.push(issue(
      "invalid-candidate",
      "$candidate.$schema",
      `Expected "${COLORS_CANDIDATE_SCHEMA}".`,
    ));
  }
  if (input.status !== "accepted" && input.status !== "rejected") {
    issues.push(issue(
      "invalid-candidate",
      "$candidate.status",
      "Expected accepted or rejected candidate status.",
    ));
  }
  if (
    !isObject(input.review)
    || !["unreviewed", "accepted", "edited", "rejected"].includes(
      String(input.review.status),
    )
  ) {
    issues.push(issue(
      "invalid-candidate",
      "$candidate.review.status",
      "Expected an explicit candidate review status.",
    ));
  }
  const ids = new Set<string>();
  if (!Array.isArray(input.families) || input.families.length === 0) {
    issues.push(issue(
      "invalid-candidate",
      "$candidate.families",
      "Expected at least one candidate family.",
    ));
  } else {
    input.families.forEach((family, familyIndex) => {
      const familyPath = `$candidate.families[${familyIndex}]`;
      if (
        !isObject(family)
        || typeof family.id !== "string"
        || !["interface", "neutral", "decorative"].includes(String(family.profile))
        || (family.status !== "accepted" && family.status !== "rejected")
        || !isObject(family.appearances)
      ) {
        issues.push(issue(
          "invalid-candidate",
          familyPath,
          "Expected a named interface, neutral, or decorative candidate family.",
        ));
        return;
      }
      if (ids.has(family.id)) {
        issues.push(issue(
          "invalid-candidate",
          `${familyPath}.id`,
          `Duplicate candidate family "${family.id}".`,
        ));
      }
      ids.add(family.id);
      for (const appearance of ["light", "dark"] as const) {
        const appearanceValue = family.appearances[appearance];
        if (appearanceValue === undefined) continue;
        const appearancePath = `${familyPath}.appearances.${appearance}`;
        if (!isObject(appearanceValue)) {
          issues.push(issue(
            "invalid-candidate",
            appearancePath,
            "Expected an appearance candidate object.",
          ));
          continue;
        }
        if (family.profile === "decorative") {
          if (!Array.isArray(appearanceValue.steps) || appearanceValue.steps.length < 3) {
            issues.push(issue(
              "invalid-candidate",
              `${appearancePath}.steps`,
              "Expected at least three decorative candidate steps.",
            ));
          } else {
            appearanceValue.steps.forEach((value, index) =>
              validateCandidateColor(
                value,
                `${appearancePath}.steps[${index}]`,
                `step-${index + 1}`,
                issues,
              )
            );
          }
        } else if (!isObject(appearanceValue.roles)) {
          issues.push(issue(
            "invalid-candidate",
            `${appearancePath}.roles`,
            "Expected candidate roles for this profile.",
          ));
        } else {
          for (const [role, value] of Object.entries(appearanceValue.roles)) {
            validateCandidateColor(
              value,
              `${appearancePath}.roles.${role}`,
              role,
              issues,
            );
          }
        }
      }
    });
  }
  if (issues.length > 0) throw new ColorsThemeScaffoldError(issues);
}

function assertScaffoldRequest(input: unknown): asserts input is ColorsThemeScaffoldRequest {
  const issues: ColorsThemeScaffoldIssue[] = [];
  if (!isObject(input)) {
    throw new ColorsThemeScaffoldError([
      issue("invalid-mapping", "$mapping", "Expected a scaffold mapping object."),
    ]);
  }
  if (input.$schema !== COLORS_THEME_SCAFFOLD_SCHEMA) {
    issues.push(issue(
      "invalid-mapping",
      "$mapping.$schema",
      `Expected "${COLORS_THEME_SCAFFOLD_SCHEMA}".`,
    ));
  }
  if (!isObject(input.theme)) {
    issues.push(issue(
      "invalid-mapping",
      "$mapping.theme",
      "Expected an ordinary flowstack.theme.v1 definition.",
    ));
  }
  if (!isObject(input.palettes) || Object.keys(input.palettes).length === 0) {
    issues.push(issue(
      "invalid-mapping",
      "$mapping.palettes",
      "Select at least one candidate family for the Theme palette.",
    ));
  } else {
    for (const [palette, family] of Object.entries(input.palettes)) {
      if (!paletteNamePattern.test(palette)) {
        issues.push(issue(
          "invalid-mapping",
          `$mapping.palettes.${palette}`,
          "Palette names use lowercase letters, numbers, and single hyphens.",
        ));
      }
      if (typeof family !== "string" || family.trim() === "") {
        issues.push(issue(
          "invalid-mapping",
          `$mapping.palettes.${palette}`,
          "Expected a candidate family ID.",
        ));
      }
    }
  }
  if (input.semantics !== undefined) {
    if (!isObject(input.semantics)) {
      issues.push(issue(
        "invalid-mapping",
        "$mapping.semantics",
        "Expected a semantic selection object.",
      ));
    } else {
      for (const [target, palette] of Object.entries(input.semantics)) {
        if (!(semanticTargets as readonly string[]).includes(target)) {
          issues.push(issue(
            "invalid-mapping",
            `$mapping.semantics.${target}`,
            `Unsupported semantic target "${target}".`,
          ));
        }
        if (typeof palette !== "string" || palette.trim() === "") {
          issues.push(issue(
            "invalid-mapping",
            `$mapping.semantics.${target}`,
            "Expected a selected Theme palette name.",
          ));
        }
      }
    }
  }
  if (issues.length > 0) throw new ColorsThemeScaffoldError(issues);
  assertThemeDefinition(input.theme);
}

function familyById(
  candidate: ColorsCandidateDocument,
  id: string,
): CandidateFamily | undefined {
  return candidate.families.find((family) => family.id === id);
}

function familyAppearance(
  family: CandidateFamily,
  appearance: ThemeAppearance,
  path: string,
): CandidateAppearance {
  const value = family.appearances[appearance];
  if (!value) {
    throw new ColorsThemeScaffoldError([
      issue(
        "missing-appearance",
        path,
        `Candidate family "${family.id}" has no ${appearance} appearance.`,
      ),
    ]);
  }
  return value;
}

function candidateRole(
  family: CandidateFamily,
  appearance: ThemeAppearance,
  role: string,
  path: string,
): CandidateColor {
  const value = familyAppearance(family, appearance, path).roles?.[role];
  if (!value) {
    throw new ColorsThemeScaffoldError([
      issue(
        "missing-role",
        path,
        `Candidate family "${family.id}" has no ${appearance} ${role} role.`,
      ),
    ]);
  }
  return value;
}

function authorPath(
  token: BrickContractToken,
  appearance: ThemeAppearance,
): string | undefined {
  const path = token.tokenPaths?.[appearance];
  const prefix = `semantic.${appearance}.`;
  return path?.startsWith(prefix) ? path.slice(prefix.length) : undefined;
}

function lastPathSegment(path: string): string {
  return path.slice(path.lastIndexOf(".") + 1);
}

function contractFamily(
  contract: BrickThemeContract,
  id: string,
  path: string,
): BrickAtomicColorFamily {
  const family = contract.atomicColorFamilies.find((entry) => entry.id === id);
  if (!family) {
    throw new ColorsThemeScaffoldError([
      issue(
        "unsupported-contract-family",
        path,
        `The installed Brick contract has no atomic "${id}" family.`,
      ),
    ]);
  }
  return family;
}

function ensureObject(parent: PlainObject, key: string): PlainObject {
  const existing = parent[key];
  if (isObject(existing)) return existing;
  const created: PlainObject = {};
  parent[key] = created;
  return created;
}

function setNested(
  root: PlainObject,
  path: readonly string[],
  value: JsonValue,
  displayPath: string,
): void {
  let current = root;
  path.forEach((segment, index) => {
    if (index === path.length - 1) {
      if (current[segment] !== undefined) {
        throw new ColorsThemeScaffoldError([
          issue(
            "naming-collision",
            displayPath,
            "The base Theme already defines this generated destination.",
          ),
        ]);
      }
      current[segment] = value;
    } else {
      const existing = current[segment];
      if (existing !== undefined && !isObject(existing)) {
        throw new ColorsThemeScaffoldError([
          issue(
            "naming-collision",
            displayPath,
            `The base Theme path collides at "${segment}".`,
          ),
        ]);
      }
      current = ensureObject(current, segment);
    }
  });
}

function importFamily(
  theme: PlainObject,
  family: CandidateFamily,
  palette: string,
  appearances: readonly ThemeAppearance[],
): number {
  let count = 0;
  for (const appearance of appearances) {
    const source = familyAppearance(
      family,
      appearance,
      `$mapping.palettes.${palette}`,
    );
    if (family.profile === "decorative") {
      source.steps?.forEach((value, index) => {
        setNested(
          theme,
          ["palettes", "colors", palette, appearance, `step-${index + 1}`],
          value.srgb.hex,
          `$.palettes.colors.${palette}.${appearance}.step-${index + 1}`,
        );
        count += 1;
      });
    } else {
      for (const [role, value] of Object.entries(source.roles ?? {}).sort(
        ([left], [right]) => left < right ? -1 : left > right ? 1 : 0,
      )) {
        setNested(
          theme,
          ["palettes", "colors", palette, appearance, role],
          value.srgb.hex,
          `$.palettes.colors.${palette}.${appearance}.${role}`,
        );
        count += 1;
      }
    }
  }
  return count;
}

function mapContractFamily(
  theme: PlainObject,
  contract: BrickThemeContract,
  contractFamilyId: string,
  palette: string,
  family: CandidateFamily,
  appearances: readonly ThemeAppearance[],
  roleForToken: (tokenPath: string) => string | undefined,
): number {
  const atomicFamily = contractFamily(
    contract,
    contractFamilyId,
    `$mapping.semantics.${contractFamilyId}`,
  );
  let count = 0;
  for (const appearance of appearances) {
    for (const tokenName of atomicFamily.tokens) {
      const token = contract.tokens.find((entry) => entry.name === tokenName);
      const tokenPath = token && authorPath(token, appearance);
      const role = tokenPath && roleForToken(tokenPath);
      if (!token || !tokenPath || !role) {
        throw new ColorsThemeScaffoldError([
          issue(
            "unsupported-contract-family",
            `$contract.atomicColorFamilies.${contractFamilyId}`,
            `Theme cannot map Brick token "${tokenName}" from the selected Colors profile.`,
          ),
        ]);
      }
      candidateRole(
        family,
        appearance,
        role,
        `$mapping.semantics.${contractFamilyId}`,
      );
      setNested(
        theme,
        ["brick", appearance, ...tokenPath.split(".")],
        `{palettes.colors.${palette}.${appearance}.${role}}`,
        `$.brick.${appearance}.${tokenPath}`,
      );
      count += 1;
    }
  }
  return count;
}

function selectedFamily(
  candidate: ColorsCandidateDocument,
  request: ColorsThemeScaffoldRequest,
  palette: string,
  target: ColorsThemeSemanticTarget,
): CandidateFamily {
  const familyId = request.palettes[palette];
  if (!familyId) {
    throw new ColorsThemeScaffoldError([
      issue(
        "unknown-palette",
        `$mapping.semantics.${target}`,
        `Palette "${palette}" is not selected in $mapping.palettes.`,
      ),
    ]);
  }
  const family = familyById(candidate, familyId);
  if (!family) {
    throw new ColorsThemeScaffoldError([
      issue(
        "missing-family",
        `$mapping.palettes.${palette}`,
        `Candidate family "${familyId}" does not exist.`,
      ),
    ]);
  }
  const expected = target === "neutral" ? "neutral" : "interface";
  if (family.profile !== expected) {
    throw new ColorsThemeScaffoldError([
      issue(
        "incompatible-profile",
        `$mapping.semantics.${target}`,
        `${target} requires a ${expected} family; "${family.id}" is ${family.profile}.`,
      ),
    ]);
  }
  return family;
}

function mapSemantics(
  theme: PlainObject,
  candidate: ColorsCandidateDocument,
  request: ColorsThemeScaffoldRequest,
  contract: BrickThemeContract,
  appearances: readonly ThemeAppearance[],
): number {
  let count = 0;
  const semantics = request.semantics ?? {};
  for (const target of semanticTargets) {
    const palette = semantics[target];
    if (!palette) continue;
    const family = selectedFamily(candidate, request, palette, target);
    if (target === "neutral") {
      for (const familyId of ["surface", "border", "text"] as const) {
        count += mapContractFamily(
          theme,
          contract,
          familyId,
          palette,
          family,
          appearances,
          (tokenPath) => neutralRole(familyId, lastPathSegment(tokenPath)),
        );
      }
    } else if (target === "focus") {
      count += mapContractFamily(
        theme,
        contract,
        "focus",
        palette,
        family,
        appearances,
        () => "focusRing",
      );
    } else {
      count += mapContractFamily(
        theme,
        contract,
        target,
        palette,
        family,
        appearances,
        (tokenPath) => interfaceRole(lastPathSegment(tokenPath)),
      );
    }
  }
  return count;
}

export function scaffoldThemeFromColors(
  candidateInput: unknown,
  requestInput: unknown,
  contractInput: unknown,
): ColorsThemeScaffoldResult {
  assertColorsCandidate(candidateInput);
  assertScaffoldRequest(requestInput);
  assertBrickThemeContract(contractInput);
  const candidate = candidateInput;
  const request = requestInput;
  const contract = contractInput;
  if (candidate.status !== "accepted") {
    throw new ColorsThemeScaffoldError([
      issue(
        "candidate-not-accepted",
        "$candidate.status",
        "Theme scaffolding requires an accepted Colors candidate.",
      ),
    ]);
  }
  if (candidate.review.status !== "accepted" && candidate.review.status !== "edited") {
    throw new ColorsThemeScaffoldError([
      issue(
        "candidate-not-reviewed",
        "$candidate.review.status",
        "Review the Colors candidate as accepted or edited before Theme scaffolding.",
      ),
    ]);
  }

  const theme = cloneDefinition(request.theme);
  if (isObject(theme.palettes) && theme.palettes.colors !== undefined) {
    throw new ColorsThemeScaffoldError([
      issue(
        "naming-collision",
        "$.palettes.colors",
        "The base Theme already owns the reserved generated Colors palette namespace.",
      ),
    ]);
  }
  const appearances = request.theme.appearances.supported;
  const familyIds = new Set<string>();
  const reports = [];
  for (const [palette, familyId] of Object.entries(request.palettes).sort(
    ([left], [right]) => left < right ? -1 : left > right ? 1 : 0,
  )) {
    if (familyIds.has(familyId)) {
      throw new ColorsThemeScaffoldError([
        issue(
          "duplicate-family",
          `$mapping.palettes.${palette}`,
          `Candidate family "${familyId}" is already imported under another palette name.`,
        ),
      ]);
    }
    familyIds.add(familyId);
    const family = familyById(candidate, familyId);
    if (!family) {
      throw new ColorsThemeScaffoldError([
        issue(
          "missing-family",
          `$mapping.palettes.${palette}`,
          `Candidate family "${familyId}" does not exist.`,
        ),
      ]);
    }
    if (family.status !== "accepted") {
      throw new ColorsThemeScaffoldError([
        issue(
          "candidate-not-accepted",
          `$candidate.families.${family.id}.status`,
          `Selected family "${family.id}" is rejected.`,
        ),
      ]);
    }
    const importedValues = importFamily(
      theme,
      family,
      palette,
      appearances,
    );
    reports.push({
      palette,
      family: family.id,
      profile: family.profile,
      importedValues,
    });
  }
  const mappedBrickTokens = mapSemantics(
    theme,
    candidate,
    request,
    contract,
    appearances,
  );
  assertThemeDefinition(theme);
  const definition = theme as unknown as ThemeDefinition;
  const importedValues = reports.reduce(
    (total, report) => total + report.importedValues,
    0,
  );
  return {
    definition,
    report: {
      $schema: COLORS_THEME_SCAFFOLD_REPORT_SCHEMA,
      candidate: {
        schema: COLORS_CANDIDATE_SCHEMA,
        review: candidate.review.status,
      },
      themeId: definition.metadata.id,
      brickVersion: contract.package.version,
      palettes: reports,
      semantics: { ...(request.semantics ?? {}) },
      counts: { importedValues, mappedBrickTokens },
      warnings: [],
    },
  };
}

export async function scaffoldThemeFromColorsFiles(
  candidatePath: string,
  requestPath: string,
  contractPath: string,
): Promise<ColorsThemeScaffoldResult> {
  const [candidate, request, contract] = await Promise.all([
    readFile(resolve(candidatePath), "utf8").then((value) => JSON.parse(value) as unknown),
    readFile(resolve(requestPath), "utf8").then((value) => JSON.parse(value) as unknown),
    readFile(resolve(contractPath), "utf8").then((value) => JSON.parse(value) as unknown),
  ]);
  return scaffoldThemeFromColors(candidate, request, contract);
}

export async function writeColorsThemeScaffold(
  result: ColorsThemeScaffoldResult,
  outputDirectory: string,
): Promise<void> {
  const directory = resolve(outputDirectory);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(resolve(directory, "flowstack.theme.json"), json(result.definition)),
    writeFile(resolve(directory, "theme.scaffold.report.json"), json(result.report)),
  ]);
}
