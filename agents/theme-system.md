# FLOWSTACK Theme system

## Purpose

Author, compile, and integrate a project theme without changing Brick component
meaning or moving application runtime ownership into Theme.

## Decision order

1. Identify brand and product colors as project palettes and roles before
   mapping any value to Brick.
2. Install a released Brick version whose theme contract revision is supported
   by Theme.
3. Map only UI meanings Brick owns into `brick.light` and `brick.dark`. Keep
   charts, syntax, editorial, and campaign colors in project roles or
   namespaced extensions.
4. Override a complete atomic Brick family or inherit that entire family from
   Brick defaults.
5. Compile at build time, review the contrast report and static artifacts, and
   ship the CSS rather than the compiler.
6. Let the application own activation, saved preference, fonts, assets,
   portals, and first-paint behavior.

## Rules

- **MUST:** Keep definitions JSON-compatible and deterministic.
- **MUST:** Read the installed Brick package's contract instead of copying its
  token inventory.
- **MUST:** Override complete atomic color families.
- **MUST:** Map colors by semantic meaning, never merely by hue.
- **MUST:** Keep unlimited non-Brick colors in palettes, roles, or namespaced
  extensions.
- **MUST:** Treat insufficient or unprovable declared contrast as a build
  failure without rounding.
- **MUST:** Ship static compiled CSS and keep the compiler out of the browser.
- **MUST:** Leave activation, persistence, fonts, assets, first paint, and
  portals with the application.
- **MUST:** Do not treat breakpoints as theme values that reconfigure Brick's
  precompiled media queries.
- **SHOULD:** Use only contract-audited global component inputs.

## Ownership

- Brick owns accessible defaults, semantic UI roles, component recipes,
  atomic families, contrast relationships, and approved component inputs.
- Theme owns serializable values, mappings, validation, and deterministic
  artifacts.
- The application owns activation, saved preference, fonts, assets, first
  paint, portals, routes, and product art direction.

## Validation checklist

- Validate the definition envelope before compiling.
- Compile against the exact installed Brick contract and review every
  diagnostic.
- Confirm the report contains a passing result for every declared pair and
  supported appearance.
- Confirm generated artifacts are byte-stable.
- Build and qualify the production application's appearance, portal, and
  first-paint behavior.
- Confirm the browser bundle does not contain the Theme compiler.

## Related guidance

- `docs/installation.md`
- `docs/authoring.md`
- `docs/fonts.md`
- `docs/appearances-and-portals.md`
- `docs/migration.md`
- `docs/troubleshooting.md`
