# Shaka Player — AI Agent Instructions

Shaka Player is an open-source JavaScript library for adaptive media playback
(DASH, HLS, MSF), published on npm as `shaka-player`. See [README.md](README.md)
for full details. The public API is exposed under the global `shaka` namespace.

GitHub: https://github.com/shaka-project/shaka-player

## Attribution

Read [AGENT-ATTRIBUTION.md](AGENT-ATTRIBUTION.md) for attribution details.

## Common Failures

**Read this section before making any change.**

**New source file: two mandatory registrations.**

Adding a new class or plugin requires two separate registrations or it may fail to load:
1. Add a `goog.require('shaka.YourModule')` entry to
   `shaka-player.uncompiled.js` only for self-registering modules (e.g. plugins)
   that no other file `goog.require`s directly.  This keeps uncompiled/dev mode
   working.
2. Add the source file to the appropriate `build/types/` file(s)
   (determines which compiled build variants include it).

**Export annotations.**

Closure Compiler renames symbols aggressively. Getting annotations wrong
may silently break the public API:

- API symbol public to the library (callable by app code): must have `@export`
- Internal symbol public to other classes (used within the library, not by
  apps): no export annotation
- Abstract interface for generated externs: `@exportInterface`
- Event/typedef visible in docs only: `@exportDoc`
- `@expose`: deprecated, do not use

See [docs/design/current/export.md](docs/design/current/export.md) for the full
rules.

**`@suppress` is a red flag.**
Avoid `@suppress` entirely if possible. Any use must have a detailed comment
explaining why it is unavoidable. Maintainers will scrutinize every instance.

**Linter, including spell-checker.**
This check must pass before committing:

```bash
# Compiler, linter, spell check, and other checks
python3 build/check.py
```

Unknown words fail the spell-checker; add legitimate new terms to
`project-words.txt`.

**Zero runtime npm dependencies.**
Shaka Player currently ships with zero runtime npm dependencies. Do not
introduce any. New development/test dependencies are rare and require
justification.

**`lib/device/` is sensitive.**
Device-specific code in `lib/device/` may only break on CE (consumer
electronics) hardware, which is only tested in the nightly device lab CI.
Changes here need extra care and justification.  Maintainers can choose to
trigger a run in the lab for any PR.

## Directory Structure

Shallow overview of top-level directories. **If you add, remove, or rename a
top-level directory as part of a change, update this section.**

```
lib/              Core library source (JS, Closure-annotated)
ui/               UI layer (controls, buttons, LESS styles)
externs/          Closure Compiler extern definitions
  shaka/          Shaka's own public interface types
build/            Build and tooling scripts (Python + Node.js)
  types/          Build variant definitions -- edit when adding source files
test/             Jasmine tests, mirroring lib/ structure
demo/             Demo application
docs/             JSDoc output and design documents
dist/             Build output (do not edit)
third_party/      Third-party code
default-receiver/ Default Cast receiver app
app-engine/       App Engine deployment config
```

## Build System

The build system is **Python + Java (Closure Compiler)**.  Key commands:

```bash
python3 build/all.py                     # full build (lint, type-check, compile, docs)
python3 build/build.py                   # compile only
python3 build/check.py                   # lint + type checks, no output
python3 build/test.py [--quick] [--filter="<regex>"] [--uncompiled]
python3 build/build.py +@complete -@ui   # example: compile without UI
```

Build variant definitions (which source files go in which bundle) live in
`build/types/`. Must be updated when adding new source files.

## Closure Compiler & Module System

All source files use `goog.provide`/`goog.require` with JSDoc type annotations.
The compiler runs in `ADVANCED_OPTIMIZATIONS` mode. See
[docs/design/current/export.md](docs/design/current/export.md) for export
annotation rules (`@export`, `@exportInterface`, `@exportDoc`).

The compiled bundle is wrapped in an IIFE for CJS/AMD/script compatibility.
See `build/wrapper.template.js`. Preserve this in any new build system.

## Test System

Jasmine tests run via Karma (`karma.conf.js`). Test files under `test/` mirror
`lib/` directory structure.  Key flags: `--quick`, `--filter`, `--uncompiled`,
`--random`, `--browsers`.

## ESLint

Config: `eslint.config.mjs`. Custom rules: `build/eslint-plugin-shaka-rules/`.
Run via `python3 build/check.py` (preferred) or `npx eslint`.

## High-Stakes Warnings

**Adding a new source file** requires two registrations (see Common Failures
above).  Forgetting one can result in new sources not being loaded or failing
to compile.

**Changing `externs/shaka/`** is a public API change. These files define the
types that application code depends on. Any modification will receive close
scrutiny from maintainers.

**Adding npm dependencies** — zero runtime dependencies is a hard-won property
of this project. Do not add runtime deps. New development/test deps are rare;
justify thoroughly in the PR.

**Touching `lib/device/`** — breakage may only appear on CE hardware in the
nightly device lab. Flag any device-specific changes clearly in the PR.
Maintainers can choose to trigger a run in the lab for any PR.
