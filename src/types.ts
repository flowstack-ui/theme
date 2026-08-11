export const THEME_DEFINITION_SCHEMA = "flowstack.theme.v1" as const;

export type ThemeAppearance = "light" | "dark";
export type ThemeDefaultAppearance = ThemeAppearance | "system";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type ThemeData = Readonly<Record<string, JsonValue>>;

export interface ThemeMetadata {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface ThemeCompatibility {
  readonly brick: string;
}

export interface ThemeAppearances {
  readonly supported: readonly [ThemeAppearance, ...ThemeAppearance[]];
  readonly default: ThemeDefaultAppearance;
}

export interface ThemeDefinition {
  readonly $schema: typeof THEME_DEFINITION_SCHEMA;
  readonly metadata: ThemeMetadata;
  readonly compatibility: ThemeCompatibility;
  readonly appearances: ThemeAppearances;
  readonly palettes?: ThemeData;
  readonly roles?: ThemeData;
  readonly brick?: ThemeData;
  readonly foundations?: ThemeData;
  readonly components?: ThemeData;
  readonly extensions?: ThemeData;
  readonly requirements?: ThemeData;
  readonly guidance?: ThemeData;
}

export type ThemeValidationIssueCode =
  | "duplicate-appearance"
  | "invalid-appearance"
  | "invalid-default-appearance"
  | "invalid-id"
  | "invalid-schema"
  | "invalid-type"
  | "missing-value"
  | "non-serializable"
  | "unknown-key";

export interface ThemeValidationIssue {
  readonly code: ThemeValidationIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface ThemeValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ThemeValidationIssue[];
}
