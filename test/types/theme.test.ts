import {
  BRICK_THEME_CONTRACT_SCHEMA,
  COLORS_THEME_SCAFFOLD_SCHEMA,
  THEME_DEFINITION_SCHEMA,
  compileTheme,
  defineTheme,
  scaffoldThemeFromColors,
  type BrickThemeContract,
  type ColorsThemeScaffoldRequest,
  type ThemeCompilation,
  type ThemeDefinition,
} from "../../dist/index.js";

const theme = defineTheme({
  $schema: THEME_DEFINITION_SCHEMA,
  metadata: { id: "typed-theme", name: "Typed Theme" },
  compatibility: { brick: "^0.1.0" },
  appearances: { supported: ["light", "dark"], default: "system" },
  palettes: {
    brand: {
      primary: "#3157d5",
      supporting: ["#13a8b5", "#e97824"],
    },
  },
  extensions: {
    "example.com/product": {
      promotional: "#d93bbd",
    },
  },
});

const id: "typed-theme" = theme.metadata.id;
void id;

const definition: ThemeDefinition = theme;
void definition;

const contract: BrickThemeContract = {
  $schema: BRICK_THEME_CONTRACT_SCHEMA,
  contractVersion: 2,
  package: { name: "@flowstack-ui/brick", version: "0.1.6" },
  css: {
    variablePrefix: "--brick-",
    layerOrder: ["brick.tokens", "flowstack.theme", "brick.foundations"],
    themeLayer: "flowstack.theme",
    themeAttribute: "data-flowstack-theme",
    appearanceAttribute: "data-brick-appearance",
    appearanceValues: ["light", "dark"],
  },
  atomicColorFamilies: [],
  contrast: { algorithm: "wcag2-relative-luminance", colorSpace: "srgb", pairs: [] },
  componentThemeInputs: [],
  tokens: [],
};
const compilation: ThemeCompilation = compileTheme(theme, contract);
void compilation;

const scaffoldRequest: ColorsThemeScaffoldRequest = {
  $schema: COLORS_THEME_SCAFFOLD_SCHEMA,
  theme,
  palettes: { brand: "brand-source", neutral: "neutral-source" },
  semantics: { accent: "brand", focus: "brand", neutral: "neutral" },
};
const scaffold = scaffoldThemeFromColors({}, scaffoldRequest, contract);
void scaffold;

defineTheme({
  $schema: THEME_DEFINITION_SCHEMA,
  metadata: { id: "invalid-function", name: "Invalid Function" },
  compatibility: { brick: "^0.1.0" },
  appearances: { supported: ["light"], default: "light" },
  palettes: {
    // @ts-expect-error functions are not serializable theme values
    brand: () => "#3157d5",
  },
});

defineTheme({
  $schema: THEME_DEFINITION_SCHEMA,
  metadata: { id: "invalid-appearance", name: "Invalid Appearance" },
  compatibility: { brick: "^0.1.0" },
  appearances: {
    // @ts-expect-error only light and dark are supported in version one
    supported: ["sepia"],
    default: "light",
  },
});
