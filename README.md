# @flowstack-ui/theme

Serializable theme authoring and validation for Flowstack UI.

The package is intentionally framework-neutral. It does not require React,
inject styles in the browser, load fonts, persist preferences, or replace
Brick's accessible default.

## Current scope

The initial package establishes:

- the `flowstack.theme.v1` definition boundary;
- typed `defineTheme` authoring;
- deterministic structural and JSON-compatibility validation;
- a JSON validation CLI;
- package and exact-archive consumer verification; and
- the public repository contract needed for later Brick-aware compilation.

Static CSS compilation, the public Brick theme contract, component theme
inputs, Colors generation, presets, and runtime scope helpers are not part of
this bootstrap release.

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
});

assertThemeDefinition(theme);
```

The bootstrap validator verifies the definition envelope and serializability.
It does not yet resolve aliases, Brick tokens, palettes, or CSS.

## JSON CLI

Validate a JSON representation of the same schema:

```bash
flowstack-theme validate ./flowstack.theme.json
```

The TypeScript authoring adapter and exact compiler are added in later
contract batches. The CLI does not execute TypeScript configuration files.

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
