# Architecture

## Package purpose

`@flowstack-ui/theme` is build-time infrastructure for serializable FLOWSTACK
theme definitions. Brick owns components and its default semantic contract. A
theme maps project visual decisions into that contract and may also retain
additional project roles that Brick does not consume.

## Bootstrap boundary

The initial repository freezes only the definition envelope and verification
surface. It does not freeze the later palette, role, Brick mapping,
foundations, component-input, or generated-artifact field details beyond their
JSON-compatible top-level namespaces.

The first schema identifier is `flowstack.theme.v1`. Additive optional fields
may remain within version 1. Removing a field, changing existing meaning, or
making previously valid data invalid requires a new schema identifier or a
documented compatibility migration.

## Runtime boundary

The core package has no runtime dependencies and no React provider. Later
compiler work produces deterministic static CSS and machine-readable
artifacts. Optional framework integration may coordinate selection and first
paint without resolving component styles during React rendering.

## Dependency direction

- Brick never depends on Theme.
- Theme does not import Brick component source.
- Later Theme builds read a versioned contract exposed by the installed Brick
  package.
- Colors remains optional build-time tooling after its algorithms qualify.
- Applications own preference, persistence, fonts, assets, and routes.
