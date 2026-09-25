# AGENTS.md — @flowstack-ui/theme

This repository contains the public `@flowstack-ui/theme` package.

## Boundary

- Keep the package framework-neutral and independent of private FLOWSTACK
  workspace files, applications, brand presets, and customer data.
- Own serializable theme definitions, exact Brick contract validation, and
  deterministic static compilation. Qualify both supported legacy contracts
  and constrained v2 contracts through their exact package artifacts.
- Do not add React context, client-side style injection, local storage, font
  loading, routing, component behavior, or application persistence to the core
  package.
- Do not add a runtime dependency on Brick or Colors. The compiler reads an
  exact installed Brick contract and may consume qualified serialized Colors
  candidates at build time; neither becomes application runtime code.
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

## FLOWSTACK Agent Workflows

Choose the primary workflow before doing task work. Review-only or diagnostic
requests use `$flowstack-ui-review`. Package source, schema, compiler API,
Agent Knowledge, dependency, qualification, or release work uses
`$flowstack-ui-maintainer`. A supplied application-plan use of Theme routes to
`$flowstack-ui-compose` in the consuming repository. Other consumer-interface
implementation routes to `$flowstack-ui-builder` outside this package. The
more specific route wins; all Theme package changes use Maintainer.

If the matching skill is not discoverable, read its canonical `SKILL.md` from
an installed or checked-out `flowstack-ui/agent-tools` repository and follow
that workflow manually. If neither is available, preserve the mapping, resolve
exact-version package Agent Knowledge directly, and report the missing skill
instead of substituting remembered guidance.

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
