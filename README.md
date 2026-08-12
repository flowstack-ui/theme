# @flowstack-ui/theme

Serializable theme authoring and validation for Flowstack UI.

The package is intentionally framework-neutral. It does not require React,
inject styles in the browser, load fonts, persist preferences, or replace
Brick's accessible default.

## Current scope

The package provides:

- the `flowstack.theme.v1` definition boundary;
- typed `defineTheme` authoring;
- deterministic structural and JSON-compatibility validation;
- exact alias, default, appearance, atomic-family, foundation, component-input,
  and extension resolution against a Brick theme contract;
- byte-stable CSS, DTCG token, manifest, and report artifacts;
- JSON validation and compilation CLI commands;
- package and exact-archive consumer verification; and
- a zero-runtime-dependency, exact-archive consumer boundary.

Colors generation, presets, React providers, runtime scope helpers, font
loading, and application preference persistence are outside this release.

## Installation

```bash
npm install --save-dev @flowstack-ui/theme
```

## Authoring

Create `flowstack.theme.ts`:

```ts
import {
  THEME_DEFINITION_SCHEMA,
  assertThemeDefinition,
  defineTheme,
} from "@flowstack-ui/theme";

export const theme = defineTheme({
  $schema: THEME_DEFINITION_SCHEMA,
  metadata: {
    id: "acme",
    name: "Acme",
  },
  compatibility: {
    brick: "^0.1.0",
  },
  appearances: {
    supported: ["light", "dark"],
    default: "system",
  },
  palettes: {
    brand: {
      primary: "#3157d5",
      secondary: "#13a8b5",
      warmth: "#e97824",
    },
  },
  roles: {
    brandPrimary: "{palettes.brand.primary}",
    brandSecondary: "{palettes.brand.secondary}",
  },
  requirements: {
    fonts: [{ family: "Acme Sans", source: "application" }],
  },
});

assertThemeDefinition(theme);
```

The structural validator verifies the definition envelope and serializability.
The compiler then resolves exact aliases such as
`{palettes.brand.primary}`. Palettes, roles, and namespaced extensions remain
project vocabulary and emit `--flowstack-theme-*` variables.

Brick mappings use semantic paths from its generated contract:

```json
{
  "brick": {
    "light": {
      "color": {
        "focus": {
          "ring": "{roles.brandPrimary}"
        }
      }
    }
  }
}
```

An override to any member of an atomic Brick color family must include that
family's complete map for that appearance. Omitting the entire family inherits
Brick's complete defaults. `foundations` accepts only contract-declared derived
semantic paths, while `components` accepts only Brick's audited component
theme inputs.

## JSON CLI

Validate a JSON representation of the same schema:

```bash
flowstack-theme validate ./flowstack.theme.json
```

Compile against the contract shipped by an installed Brick package:

```bash
flowstack-theme compile ./flowstack.theme.json \
  --contract ./node_modules/@flowstack-ui/brick/dist/theme-contract.json \
  --out-dir ./dist/theme
```

This writes `theme.css`, `theme.tokens.json`, `theme.manifest.json`, and
`theme.report.json`. Import `theme.css`, then activate the theme with
`data-flowstack-theme="acme"`; Brick's appearance attribute continues to own
light and dark selection. The CLI intentionally reads JSON and never executes
TypeScript configuration files.

The same build flow is available through `compileTheme`, `compileThemeFiles`,
and `writeThemeArtifacts`.

## Development

Use Node 22 and npm:

```bash
npm ci
npm run check:focused -- validation
npm run check:repository
npm run check:release
```

See [architecture](docs/architecture.md) and [testing](docs/testing.md).

## License

MIT
