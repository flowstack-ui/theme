# Architecture

## Package purpose

`@flowstack-ui/theme` is build-time infrastructure for serializable FLOWSTACK
theme definitions. Brick owns components and its default semantic contract. A
theme maps project visual decisions into that contract and may also retain
additional project roles that Brick does not consume.

## Definition and compiler boundary

The definition envelope is `flowstack.theme.v1`. Compilable token leaves are
strings or finite numbers. Exact `{path.to.token}` aliases may cross palettes,
roles, Brick mappings, foundations, component inputs, and extensions. Unknown
or circular aliases fail compilation.

The first schema identifier is `flowstack.theme.v1`. Additive optional fields
may remain within version 1. Removing a field, changing existing meaning, or
making previously valid data invalid requires a new schema identifier or a
documented compatibility migration.

## Contract mapping

The compiler receives Brick's generated
`flowstack.brick-theme-contract.v1` as data; it does not import Brick source or
carry a copied token list. Theme `brick.light` and `brick.dark` objects address
required semantic paths after the contract's `semantic.<appearance>` prefix.
Theme `foundations` addresses derived semantic paths. Theme `components`
addresses only declared inherited component inputs, for example
`components.drawer.radius`.

Sparse authoring is safe at the family level. A completely omitted atomic
family inherits Brick defaults, but a partially overridden family is rejected.
Every emitted appearance contains the complete required Brick map.
Compatibility accepts exact semantic versions, caret or tilde ranges,
comparator sets, and `||` alternatives.

Project `palettes`, `roles`, and `extensions` are open vocabularies. They emit
under `--flowstack-theme-*`, never create new `--brick-*` meanings, and are
also retained in the token artifact. Extension top-level keys are the
discoverable namespaces recorded by the manifest.

## Generated artifacts

- `theme.css` contains the static `flowstack.theme` layer and activation
  selectors taken from the Brick contract.
- `theme.tokens.json` contains resolved DTCG-compatible `$value` leaves.
- `theme.manifest.json` records identity, compatibility, activation,
  extensions, requirements, and artifact names.
- `theme.report.json` records deterministic compilation counts and warnings.

Fixed-light and fixed-dark definitions emit one complete appearance. Dual
definitions may select a fixed default or `system`; the latter adds a static
`prefers-color-scheme` rule. Explicit nearest Brick appearance boundaries
always receive a complete map.

## Runtime boundary

The core package has no runtime dependencies and no React provider. It produces
deterministic static CSS and machine-readable artifacts at build time.
Optional future framework integration may coordinate selection and first paint
without resolving component styles during React rendering.

## Dependency direction

- Brick never depends on Theme.
- Theme does not import Brick component source.
- Theme builds read a versioned contract exposed by the installed Brick
  package.
- Colors remains optional build-time tooling after its algorithms qualify.
- Applications own preference, persistence, fonts, assets, and routes.
