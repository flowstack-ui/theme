# AGENTS.md — @flowstack-ui/theme

This repository contains the public `@flowstack-ui/theme` package.

## Boundary

- Keep the package framework-neutral and independent of private FLOWSTACK
  workspace files, applications, brand presets, and customer data.
- Version 0.1 begins with serializable theme definition and validation. Exact
  Brick contract resolution and CSS compilation arrive in later approved
  batches.
- Do not add React context, client-side style injection, local storage, font
  loading, routing, component behavior, or application persistence to the core
  package.
- Do not add a runtime dependency on Brick or Colors. Later compiler work may
  read an installed Brick contract or optionally use qualified Colors tooling
  at build time.
- Theme definitions must remain JSON-compatible. Functions, callbacks, DOM
  values, class instances, cyclic data, non-finite numbers, and environment-
  dependent output are invalid.
- Source belongs in `src/`, tests in `test/`, scripts in `scripts/`, and public
  guidance in `docs/`.
- Do not edit or commit `dist/`, package archives, caches, or `node_modules/`.

## Read first

1. [`README.md`](README.md)
2. [`docs/architecture.md`](docs/architecture.md)
3. [`docs/testing.md`](docs/testing.md)
4. [`CHANGELOG.md`](CHANGELOG.md)

## Verification

Use the smallest focused owner while iterating:

```bash
npm run check:focused -- definition
npm run check:focused -- validation
npm run check:focused -- cli
```

Before handoff, run:

```bash
npm run check:repository
```

Release candidates additionally run `npm run check:release` and publish only
the exact archive qualified by the repository workflow.
