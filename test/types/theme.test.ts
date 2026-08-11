import {
  THEME_DEFINITION_SCHEMA,
  defineTheme,
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
