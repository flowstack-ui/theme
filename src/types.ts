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

export const BRICK_THEME_CONTRACT_SCHEMA = "flowstack.brick-theme-contract.v1" as const;
export const THEME_MANIFEST_SCHEMA = "flowstack.theme-manifest.v1" as const;
export const THEME_REPORT_SCHEMA = "flowstack.theme-report.v1" as const;

export type BrickTokenClassification =
  | "required"
  | "derived"
  | "component-input"
  | "optional-extension"
  | "internal";

export interface BrickContractToken {
  readonly name: string;
  readonly classification: BrickTokenClassification;
  readonly type: string | null;
  readonly appearance: "invariant" | "light-and-dark";
  readonly defaults?: Readonly<Partial<Record<ThemeAppearance, string>>>;
  readonly tokenPaths?: Readonly<Partial<Record<ThemeAppearance, string>>>;
  readonly component?: string;
}

export interface BrickAtomicColorFamily {
  readonly id: string;
  readonly tokens: readonly string[];
}

export interface BrickComponentThemeInput {
  readonly name: string;
  readonly type: string;
  readonly fallback: string;
  readonly supportedRange: string;
  readonly component: string;
}

export interface BrickThemeContract {
  readonly $schema: typeof BRICK_THEME_CONTRACT_SCHEMA;
  readonly contractVersion: number;
  readonly package: { readonly name: string; readonly version: string };
  readonly css: {
    readonly variablePrefix: string;
    readonly layerOrder: readonly string[];
    readonly themeLayer: string;
    readonly themeAttribute: string;
    readonly appearanceAttribute: string;
    readonly appearanceValues: readonly ThemeAppearance[];
  };
  readonly atomicColorFamilies: readonly BrickAtomicColorFamily[];
  readonly componentThemeInputs: readonly BrickComponentThemeInput[];
  readonly tokens: readonly BrickContractToken[];
}

export type CompiledTokenSource = "default" | "theme";

export interface CompiledThemeToken {
  readonly name: string;
  readonly path: string;
  readonly type: string;
  readonly appearance?: ThemeAppearance;
  readonly value: string | number;
  readonly source: CompiledTokenSource;
}

export interface ThemeManifest {
  readonly $schema: typeof THEME_MANIFEST_SCHEMA;
  readonly theme: ThemeMetadata;
  readonly compatibility: ThemeCompatibility;
  readonly brickContract: {
    readonly schema: string;
    readonly version: number;
    readonly package: { readonly name: string; readonly version: string };
  };
  readonly appearances: ThemeAppearances;
  readonly activation: {
    readonly themeAttribute: string;
    readonly appearanceAttribute: string;
    readonly cssLayer: string;
  };
  readonly artifacts: {
    readonly css: "theme.css";
    readonly tokens: "theme.tokens.json";
    readonly manifest: "theme.manifest.json";
    readonly report: "theme.report.json";
  };
  readonly extensionNamespaces: readonly string[];
  readonly requirements: ThemeData;
  readonly guidance: ThemeData;
}

export interface ThemeCompilationReport {
  readonly $schema: typeof THEME_REPORT_SCHEMA;
  readonly valid: true;
  readonly themeId: string;
  readonly brickVersion: string;
  readonly counts: {
    readonly emitted: number;
    readonly brickRequired: number;
    readonly brickInherited: number;
    readonly brickOverridden: number;
    readonly foundations: number;
    readonly componentInputs: number;
    readonly projectTokens: number;
  };
  readonly warnings: readonly string[];
}

export interface ThemeCompilation {
  readonly css: string;
  readonly tokens: Readonly<Record<string, JsonValue>>;
  readonly manifest: ThemeManifest;
  readonly report: ThemeCompilationReport;
  readonly resolvedTokens: readonly CompiledThemeToken[];
}

export type ThemeCompilationIssueCode =
  | "alias-cycle"
  | "incompatible-brick"
  | "incomplete-family"
  | "invalid-alias"
  | "invalid-contract"
  | "invalid-token-value"
  | "naming-collision"
  | "unsupported-appearance"
  | "unsupported-component-input"
  | "unknown-token";

export interface ThemeCompilationIssue {
  readonly code: ThemeCompilationIssueCode;
  readonly path: string;
  readonly message: string;
}
