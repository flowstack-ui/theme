# Authoring

A theme definition is serializable project data. JSON is the CLI boundary;
TypeScript may use `defineTheme` for typing as long as the resulting object
remains JSON-compatible.

## Start with project meaning

Define any number of raw palettes, then name the roles your product needs:

```json
{
  "$schema": "flowstack.theme.v1",
  "metadata": { "id": "acme", "name": "Acme" },
  "compatibility": { "brick": "^0.1.7" },
  "appearances": {
    "supported": ["light", "dark"],
    "default": "system"
  },
  "palettes": {
    "brand": {
      "blue": "#2457c5",
      "orange": "#c44d18",
      "magenta": "#a53c8e"
    }
  },
  "roles": {
    "brandPrimary": "{palettes.brand.blue}",
    "promotion": "{palettes.brand.magenta}"
  }
}
```

Extra colors are not forced into Brick's smaller vocabulary. Charts,
campaigns, syntax, editorial colors, maps, and future Block roles remain in
`roles` or a namespaced `extensions` object and emit as
`--flowstack-theme-*` variables.

## Map Brick semantics

The `brick` section changes stable UI meanings. Map by purpose, not merely by
hue: a promotional orange is not a warning unless it communicates warning.

```json
{
  "brick": {
    "light": {
      "color": {
        "accent": {
          "border": "#829fe0",
          "on-soft": "#173b86",
          "on-solid": "#ffffff",
          "soft": "#e8efff",
          "soft-hover": "#d9e5ff",
          "soft-pressed": "#c6d7ff",
          "solid": "{roles.brandPrimary}",
          "solid-hover": "#1c489f",
          "solid-pressed": "#173d88",
          "text": "#214b9e"
        }
      }
    }
  }
}
```

Brick publishes atomic families. Changing one member requires every member of
that family for the same appearance; omitting the entire family safely
inherits Brick's defaults. This prevents a new rest color from accidentally
keeping unrelated hover, pressed, or foreground values.

## Other sections

- `foundations` accepts contract-declared typography, radius, density, shadow,
  and motion paths.
- `components` accepts only Brick's audited inherited component inputs. It is
  not a selector or arbitrary-recipe registry.
- `requirements` records application work such as font and asset loading.
- `guidance` records intent and review notes for people and agents.

Aliases must occupy the complete value, for example
`"{roles.brandPrimary}"`. Unknown aliases, cycles, unsupported values,
incomplete families, and unknown Brick paths fail compilation.

