# Transmuxing in a Web Worker

#### Overview

When playing HLS streams with MPEG-TS segments, Shaka Player must transmux
(convert) each segment from MPEG-TS to fMP4 before feeding it to
`MediaSource`. By default this work happens synchronously on the main thread,
which can cause frame drops or audio glitches on slower devices.

Shaka Player can offload this work to a dedicated **Web Worker**, freeing the
main thread for rendering and UI. The worker is shared across all active
streams (audio and video), so only one worker thread is ever created per page.

#### Quick Summary

To enable worker-based transmuxing you must do **two** things:

1. Make the compiled worker script reachable over HTTP from your page.
2. Tell Shaka where to find it via `mediaSource.transmuxWorkerUrl`.

Shaka does **not** auto-detect the worker URL. The library cannot reliably
know where its assets live at runtime (script tags, bundler output, CDNs,
ES modules, hashed filenames all differ). The integrating application owns
how Shaka is loaded, so the application also owns the worker URL.

If `transmuxWorkerUrl` is not set, transmux falls back to the main thread.
No error is thrown — the feature simply stays dormant.

#### Configuration Key

```js
player.configure({
  mediaSource: {
    // URL of the worker script. Empty by default. Required for the worker
    // to run; empty string keeps transmuxing on the main thread.
    transmuxWorkerUrl: '',
  },
});
```

When `transmuxWorkerUrl` is a non-empty string, Shaka creates the worker on
the first transmux call. Empty value (or device-level opt-out — see below)
falls back to main-thread transmuxing.

#### The Worker File

Compiled builds emit the worker as a standalone bundle next to the main
library bundle:

| Build type | Worker filename |
| ---------- | --------------------------------------- |
| Release    | `shaka-player.transmuxer-worker.js`     |
| Debug      | `shaka-player.transmuxer-worker.debug.js` |

Both files live in `dist/` after running `python3 build/all.py`, and ship
inside the npm package under `node_modules/shaka-player/dist/`.

You must serve the worker file from a URL the browser can reach. The exact
path depends on how you deploy Shaka — see the patterns below.

#### Deployment Patterns

##### Plain `<script>` tag

If you ship `shaka-player.compiled.js` from `/static/`, copy the worker
alongside it and point Shaka at the same directory:

```html
<script src="/static/shaka-player.compiled.js"></script>
<script>
  const player = new shaka.Player();
  player.configure(
      'mediaSource.transmuxWorkerUrl',
      '/static/shaka-player.transmuxer-worker.js');
</script>
```

##### Webpack 5 / Vite / Rollup (modern bundlers)

Use `new URL(..., import.meta.url)`. The bundler resolves the npm path,
copies the worker into the build output, and rewrites the URL at build
time:

```js
const workerUrl = new URL(
    'shaka-player/dist/shaka-player.transmuxer-worker.js',
    import.meta.url,
).toString();

player.configure('mediaSource.transmuxWorkerUrl', workerUrl);
```

##### Webpack 4

Webpack 4 has no `import.meta.url` support. Use `file-loader` or
`asset/resource`:

```js
import workerUrl from
    'shaka-player/dist/shaka-player.transmuxer-worker.js?url';

player.configure('mediaSource.transmuxWorkerUrl', workerUrl);
```

##### Create React App / static `public/` folder

Copy `node_modules/shaka-player/dist/shaka-player.transmuxer-worker.js`
into `public/` (or your equivalent static asset folder) and reference it
by absolute path:

```js
player.configure(
    'mediaSource.transmuxWorkerUrl',
    '/shaka-player.transmuxer-worker.js');
```

A small build script that copies the file on `postinstall` keeps the
worker version in sync with the installed package.

#### Same-Origin and CORS Requirements

`new Worker(url)` requires the worker script to be either:

- same origin as the host page, or
- served with CORS headers that allow the host origin
  (`Access-Control-Allow-Origin`, plus `Cross-Origin-Resource-Policy` when
  the page itself runs cross-origin).

Self-hosted same-origin deployments need no extra headers. Cross-origin
deployments must serve the worker with proper CORS configuration, or the
browser will reject the `new Worker(url)` call and Shaka will fall back to
main-thread transmuxing.

#### Uncompiled / Development Mode

In uncompiled mode (running Shaka directly from source for development)
the worker is bootstrapped from `transmuxer_worker.uncompiled.js` at the
repository root. Set the URL the same way:

```js
player.configure(
    'mediaSource.transmuxWorkerUrl',
    '/path/to/shaka-player/transmuxer_worker.uncompiled.js');
```

Run `python3 build/gendeps.py` first so the bootstrap script can locate
the Closure dependency graph.

#### Disabling the Worker

To force main-thread transmuxing — for debugging or for environments
where Web Workers are unreliable — leave `transmuxWorkerUrl` empty, or
clear it at runtime:

```js
player.configure('mediaSource.transmuxWorkerUrl', '');
```

Certain TV platforms (Tizen, WebOS, Hisense) also opt out of worker
transmuxing internally via the device layer regardless of this setting,
because Worker support is often limited or unstable on those devices.

#### Fallback Chain

Shaka silently falls back to main-thread transmuxing in any of these
cases:

1. `transmuxWorkerUrl` is empty.
2. The device platform reports no Worker support (e.g. older Tizen/WebOS).
3. `new Worker(url)` throws — CSP block, network error, MIME mismatch.
4. The first `postMessage` to the worker fails.
5. The worker does not respond within 30 seconds for a given segment.

The fallback is transparent: playback continues without error. A warning
is logged to the console when a fallback is taken.

#### Troubleshooting

**Worker URL returns 404.** Open DevTools → Network, filter by `worker`,
and compare the requested URL against your deployed asset paths. Most
often the worker file was not copied alongside the main bundle.

**CSP blocks the worker.** Add the worker's origin to the relevant
Content-Security-Policy directives:

```
worker-src 'self';
script-src 'self';
```

If the worker is served from a different origin, list that origin in
both directives (and `connect-src` if your app also fetches it
directly).

**Cross-origin Worker rejected.** Ensure the worker response includes
`Access-Control-Allow-Origin: <your page origin>` and, when the page is
itself cross-origin-isolated, `Cross-Origin-Resource-Policy:
cross-origin`.

**Need to isolate a transmux bug.** Disable the worker as shown above so
that any transmux failure surfaces on the main thread with a full stack
trace.

For general configuration see {@tutorial config}, and for all
`mediaSource` options see {@link shaka.extern.MediaSourceConfiguration}.
