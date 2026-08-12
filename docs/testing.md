# Testing

This repository implements focused, repository, and release verification.

```bash
npm run check:focused -- definition
npm run check:focused -- validation
npm run check:focused -- compiler
npm run check:focused -- cli
npm run check:repository
npm run check:release
```

## Focused owners

- `definition` builds the package and compiles public type fixtures.
- `validation` builds the package and runs structural validation tests.
- `compiler` covers aliases, defaults, atomic families, fixed and dual
  appearances, component inputs, project roles, artifact writes, deterministic
  output, declared semantic contrast pairs, and failure diagnostics.
- `cli` builds the package and runs CLI process tests.
- `all` runs every focused package test.

## Repository gate

The repository gate verifies routing and workflows, rejects runtime
dependencies and private imports, typechecks source, runs unit and type tests,
builds the package, inspects the publishable archive, installs that exact
archive into a temporary clean consumer, executes public imports, and checks
that no automated-test port is registered or occupied.

## Release boundary

The release gate equals the repository gate because the compiler has no browser
or server surface. Browser qualification of Brick appearance boundaries belongs
to the cross-repository Theme qualification batch and does not weaken this
package's exact-archive consumer.

Human review remains responsible for deciding whether public schema meaning is
appropriately stable. Automated structural success cannot approve product
semantics. Compiler contrast results cover declared opaque color pairs; browser
qualification remains responsible for rendered states and composition.
