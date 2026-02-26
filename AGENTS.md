# Shaka Player — AI Agent Instructions

## Project Overview

Shaka Player is an open-source JavaScript library for adaptive media playback
(DASH, HLS, MSF). It is maintained by Google and is published on npm as
`shaka-player`. The public API is exposed under the global `shaka` namespace.

GitHub: https://github.com/shaka-project/shaka-player

## Directory Structure

```
shaka-player/
├── lib/                  # Core library source (JS, Closure-annotated)
│   ├── abr/              # Adaptive bitrate logic
│   ├── ads/              # Ad insertion (IMA, etc.)
│   ├── cast/             # Chromecast sender/receiver
│   ├── cea/              # Closed captions (CEA-608/708)
│   ├── config/           # Configuration utilities
│   ├── dash/             # DASH manifest parser
│   ├── debug/            # Logging
│   ├── deprecate/        # Deprecation helpers
│   ├── device/           # Device-specific overrides (Tizen, WebOS, Xbox, etc.)
│   ├── drm/              # DRM (Widevine, PlayReady, FairPlay)
│   ├── hls/              # HLS manifest parser
│   ├── lcevc/            # LCEVC video enhancement
│   ├── media/            # Core media engine (buffering, segments, timelines)
│   ├── msf/              # MOQT Streaming Format
│   ├── net/              # Networking plugins (fetch, data URI, etc.)
│   ├── offline/          # Offline download/storage
│   ├── polyfill/         # Browser polyfills
│   ├── queue/            # Media queuing
│   ├── text/             # Text tracks / subtitles
│   ├── transmuxer/       # Container transmuxing
│   ├── util/             # General utilities
│   └── player.js         # Main Player class
├── ui/                   # UI layer (controls, buttons, LESS styles)
├── externs/              # Closure Compiler extern definitions
│   ├── shaka/            # Shaka's own public interface types
│   └── *.js              # Browser/platform externs
├── build/                # Build and tooling scripts (Python + Node.js)
│   ├── all.py            # Main build entry point
│   ├── build.py          # Closure compilation
│   ├── check.py          # Style/type checking
│   ├── test.py           # Test runner wrapper
│   ├── generateExterns.js  # Generates .externs.js from compiled output
│   ├── generateLocalizations.py  # Generates localization JS from JSON
│   ├── generateTsDefs.py # Generates .d.ts from compiled externs
│   ├── types/            # Build variant definition files (+@complete, -@networking, etc.)
│   ├── wrapper.template.js # IIFE wrapper for compiled output (see below)
│   └── *.py              # Other helper scripts (compiler, stats, docs, etc.)
├── conditional/          # Conditional build helpers (e.g. dummy Cast proxy)
├── demo/                 # Demo app (Closure-based)
├── test/                 # Jasmine unit + integration tests (Karma)
├── dist/                 # Build output (compiled JS, source maps, .d.ts, externs)
├── docs/                 # JSDoc API documentation
├── third_party/          # Third-party code
├── shaka-player.uncompiled.js  # Entry point listing all goog.require'd modules
└── package.json
```

## Current Build System

The build system is **Python + Java (Closure Compiler)**. Node.js is also used
for some tooling scripts.

### Key commands

```bash
# Full build (lint, type-check, compile, docs)
python3 build/all.py

# Compile only
python3 build/build.py

# Style and type checks only (no output)
python3 build/check.py

# Run tests (wraps Karma)
python3 build/test.py [--quick] [--filter="<regex>"] [--browsers Chrome]
python3 build/test.py --uncompiled   # test against uncompiled sources
python3 build/test.py --quick        # unit tests only, skip integration tests

# Build docs
python3 build/docs.py

# Regenerate deps.js (needed when using uncompiled library)
python3 build/gendeps.py

# Bundle size analysis
python3 build/stats.py -s           # function sizes
python3 build/stats.py -c           # class dependencies
```

### Configurable builds

`build.py` supports a `+`/`-` system for including/excluding feature modules:

```bash
python3 build/build.py +@complete              # everything
python3 build/build.py +@complete -@networking # no networking plugins
python3 build/build.py +@complete -@ui         # no UI
```

Build variant definitions live in `build/types/`. The default build is
`+@complete`.

### Output artifacts (`dist/`)

Each build variant produces a family of files. The variants are:
`compiled` (default, no UI), `ui`, `dash`, `hls`, `experimental`.

| Pattern | Description |
|---------|-------------|
| `shaka-player.{variant}.js` | Minified production bundle |
| `shaka-player.{variant}.debug.js` | Unminified bundle with source maps |
| `shaka-player.{variant}.d.ts` | TypeScript declarations |
| `shaka-player.{variant}.externs.js` | Closure externs for downstream Closure users |
| `shaka-player.{variant}-es2021.js` | ES2021 target variant (same family) |
| `controls.css` | UI stylesheet |

## Closure Compiler & Module System

All source files use **Google Closure Compiler** patterns:

- `goog.provide('shaka.Foo')` — declares a namespace/class
- `goog.require('shaka.Bar')` — declares a dependency
- Types are expressed entirely in **JSDoc** annotations (`@type`, `@param`,
  `@return`, `@implements`, etc.)
- The compiler runs in `ADVANCED_OPTIMIZATIONS` mode, performing whole-program
  dead code elimination, renaming, and inlining

The **`externs/shaka/`** directory is an abuse of the Closure externs mechanism
to define Shaka's own public interface types (e.g.
`shaka.extern.Player.Configuration`). These are not true extern files — they
represent public API structure that Closure must not rename.

## Output Wrapper

The compiled bundle is wrapped in an IIFE that provides compatibility with
CommonJS, AMD, and direct `<script>` usage.  See `build/wrapper.template.js`.

This functionality must be preserved (or replicated) in any new build system.

## Test System

- **Framework**: Jasmine
- **Runner**: Karma (via `build/test.py`, which wraps `karma start`)
- **Config**: `karma.conf.js`
- Test files live in `test/`, mirroring the `lib/` structure
- Integration tests require a compiled library; unit tests can run uncompiled
- Key test flags: `--quick`, `--filter`, `--uncompiled`, `--random`, `--browsers`

## UI Layer

- UI source: `ui/` — all standard JS (Closure-annotated)
- Styling: **LESS** files in `ui/less/`, compiled to `dist/controls.css`
- Localization strings: generated by `build/generateLocalizations.py`

## ESLint

Config: `eslint.config.mjs`
Custom rules in `build/eslint-plugin-shaka-rules/`.
Run via `python3 build/check.py` or directly with `npx eslint`.

## Externs Structure

- `externs/*.js` — browser/platform API externs
- `externs/shaka/*.js` — Shaka's own interface/typedef definitions
- `ui/externs/*.js` — UI layer interface/typedef definitions (same pattern as `externs/shaka/`)

## Node Version Requirement

Node.js >= 18 for tests only (see `package.json` `"engines"` field).
