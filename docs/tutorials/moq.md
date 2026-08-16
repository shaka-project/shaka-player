# Media over QUIC (MoQ)

This tutorial explains how to use Shaka Player to stream live content over
**MoQT** (Media over QUIC Transport), using the **MSF** (MoQ Streaming Format)
manifest parser built into the player.

**Important**

Support for MoQ in Shaka Player is currently **experimental** and is only
available in the experimental builds. It will remain experimental until the
underlying specifications are finalized and no longer in draft status.

**Relevant specs:**
- [draft-ietf-moq-transport](https://datatracker.ietf.org/doc/draft-ietf-moq-transport/)
- [draft-ietf-moq-msf](https://datatracker.ietf.org/doc/draft-ietf-moq-msf/)
- [draft-ietf-moq-cmsf](https://datatracker.ietf.org/doc/draft-ietf-moq-cmsf/)


## Prerequisites

MoQ streaming relies on the **WebTransport** browser API, which has the
following requirements:

- The page must be served over **HTTPS** or from `localhost`.
- The browser must support the WebTransport API.
- The MoQT relay/server must also be reachable over HTTPS (or from localhost
  for testing with self-signed certificates; see `fingerprintUri` below).


## Basic Usage

Loading a MoQ stream is straightforward, but there is one **mandatory
requirement**: you must always pass `'application/msf'` as the `mimeType`
argument to `player.load()`. This is what tells Shaka to use the MSF manifest
parser instead of DASH or HLS parsers.

```js
const manifestUri = 'https://relay.example.com/moq-endpoint';

async function initPlayer() {
  shaka.polyfill.installAll();

  if (!shaka.Player.isBrowserSupported()) {
    console.error('Browser not supported!');
    return;
  }

  const video = document.getElementById('video');
  const player = new shaka.Player();
  await player.attach(video);

  player.addEventListener('error', (event) => {
    console.error('Error code', event.detail.code, event.detail);
  });

  try {
    // The mimeType 'application/msf' is REQUIRED for MOQ streams.
    await player.load(manifestUri, /* startTime= */ null, 'application/msf');
    console.log('MOQ stream loaded!');
  } catch (e) {
    console.error('Load failed', e);
  }
}

document.addEventListener('DOMContentLoaded', initPlayer);
```

> **Important:** Never omit the `'application/msf'` MIME type. Without it,
> Shaka cannot identify the stream as a MoQ source and will fail or attempt
> to parse it as a different format.


## What Happens Under the Hood

When `player.load()` is called with `'application/msf'`, Shaka:

1. Opens a **WebTransport** connection to the given URI.
2. Performs **MoQT session setup** (client/server handshake, version
   negotiation).
3. Either subscribes to the **catalog** track in a known namespace (if
   `manifest.msf.namespaces` is configured), or waits for a
   `PUBLISH_NAMESPACE` announcement from the server to discover the namespace
   dynamically.
4. Parses the catalog (a JSON document) to discover all available audio,
   video, and text tracks.
5. Subscribes to each track's MoQT data stream, feeding segments into Shaka's
   regular media pipeline.

> **Note:** Only **live** content is supported. VOD content (where `isLive`
> is false in the catalog) is not supported and will throw an error.


## MSF Configuration

All MoQ-specific options live under `manifest.msf` in the player configuration.

```js
player.configure({
  manifest: {
    msf: {
      // Options described below
    }
  }
});
```

### `fingerprintUri` (string, default: `''`)

URL of a plain-text file containing the **SHA-256 hex fingerprint** of the
server's self-signed TLS certificate. This is needed when connecting to a
local relay or a server with a self-signed cert that the browser would
otherwise reject.

```js
player.configure({
  manifest: {
    msf: {
      fingerprintUri: 'https://relay.example.com/cert.hex',
    }
  }
});
```

When set, Shaka fetches the fingerprint before opening the WebTransport
connection and uses it to pin the certificate. Leave empty for servers with
a CA-signed certificate.

### `namespaces` (Array\<string\>, default: `[]`)

The MoQT **namespace** to subscribe to for the catalog track. A namespace is
an array of string path components that together identify the session on the
relay.

```js
player.configure({
  manifest: {
    msf: {
      // Subscribe to the catalog in namespace ['live', 'channel1']
      namespaces: ['live', 'channel1'],
    }
  }
});
```

When `namespaces` is set, Shaka immediately subscribes (or fetches) the
catalog in that namespace. When left empty (`[]`), Shaka instead listens for
a `PUBLISH_NAMESPACE` announcement from the server and uses the advertised
namespace automatically. Use the explicit form when you know the namespace
ahead of time to reduce start-up latency.

### `authorizationToken` (string, default: `''`)

An optional **authorization token** sent to the server during the MoQT
client setup handshake. The token is encoded with alias type `USE_VALUE`
(`0x03`) per the spec.

```js
player.configure({
  manifest: {
    msf: {
      authorizationToken: 'Bearer my-secret-token',
    }
  }
});
```

### `subscribeFilterType` (MsfFilterType, default: `LARGEST_OBJECT`)

Controls the filter applied when subscribing to tracks. Corresponds to the
MoQT subscribe filter parameter.

| Value | Description |
|---|---|
| `shaka.config.MsfFilterType.LARGEST_OBJECT` | Start from the latest available object. |
| `shaka.config.MsfFilterType.NEXT_GROUP_START` | Start from the next available group . |

```js
player.configure({
  manifest: {
    msf: {
      subscribeFilterType: shaka.config.MsfFilterType.LARGEST_OBJECT,
    }
  }
});
```

### `useFetchCatalog` (boolean, default: `false`)

When `true`, Shaka retrieves the catalog using a **FETCH** (one-shot
retrieval) instead of an ongoing `SUBSCRIBE`. Use this when the catalog is
static and does not update over the lifetime of the session.

```js
player.configure({
  manifest: {
    msf: {
      useFetchCatalog: true,
    }
  }
});
```

When `false` (the default), Shaka subscribes to the catalog track and will
pick up catalog updates if the server sends them.

### `version` (MsfVersion, default: `AUTO`)

Controls which MoQT draft version(s) to negotiate with the server.

| Value | WebTransport protocol strings offered | Description |
|---|---|---|
| `shaka.config.MsfVersion.AUTO` | `moqt-16`, `moq-00` | Try draft-16 first, fall back to draft-14 (default). |
| `shaka.config.MsfVersion.DRAFT_14` |  | Force draft-14 only. |
| `shaka.config.MsfVersion.DRAFT_16` | `moqt-16` | Force draft-16 only. |

```js
player.configure({
  manifest: {
    msf: {
      version: shaka.config.MsfVersion.DRAFT_16,
    }
  }
});
```

The negotiated version is determined from the `protocol` property of the
established WebTransport connection.

### `catalogPreprocessor` (function, default: identity)

An optional callback invoked after the catalog JSON is parsed, before Shaka
processes its tracks. Use this to modify or filter catalog entries
programmatically.

```js
player.configure({
  manifest: {
    msf: {
      catalogPreprocessor: (catalog) => {
        // Example: remove loc tracks from the catalog
        catalog.tracks = catalog.tracks.filter(
            (t) => t.packaging !== 'loc');
        return catalog;
      },
    }
  }
});
```

The function receives and must return a `msfCatalog.Catalog` object.


## Full Configuration Example

```js
player.configure({
  manifest: {
    msf: {
      fingerprintUri: '',           // Set for self-signed cert servers
      namespaces: ['live', 'ch1'], // Known namespace; leave [] to auto-discover
      authorizationToken: '',       // Bearer token if required by server
      useFetchCatalog: false,       // true = one-shot FETCH, false = SUBSCRIBE
      version: shaka.config.MsfVersion.AUTO, // Version negotiation strategy
      subscribeFilterType: shaka.config.MsfFilterType.LARGEST_OBJECT,
      catalogPreprocessor: (catalog) => catalog, // Identity (no-op)
    }
  }
});
```


## DRM with MoQ

DRM configuration for MoQ streams works exactly like DASH or HLS. DRM
information is carried in the **catalog** via `contentProtections` entries
(which include the key system UUID, PSSH, and license server URL). Shaka
extracts this automatically and populates its DRM subsystem.

You only need to provide additional DRM configuration if the catalog does not
include the license server URL, or if you require advanced options such as
hardware robustness or custom headers:

```js
player.configure({
  drm: {
    servers: {
      'com.widevine.alpha': 'https://license.example.com/widevine',
      'com.microsoft.playready': 'https://license.example.com/playready',
    },
    advanced: {
      'com.widevine.alpha': {
        videoRobustness: ['HW_SECURE_ALL'],
        audioRobustness: ['SW_SECURE_CRYPTO'],
      }
    }
  },
  manifest: {
    msf: {
      namespaces: ['live', 'encrypted-channel'],
      authorizationToken: 'my-token',
    }
  }
});

await player.load(uri, null, 'application/msf');
```


## Testing with a Local Relay

When running a local MoQT relay with a self-signed TLS certificate, use the
`fingerprintUri` option:

1. Generate a self-signed certificate and export its SHA-256 fingerprint as a
   hex string (no colons, no spaces) into a plain-text file, e.g.
   `cert.hex`.
2. Serve that file from an HTTPS endpoint accessible to the browser.
3. Configure Shaka:

```js
player.configure({
  manifest: {
    msf: {
      fingerprintUri: 'https://localhost:4443/cert.hex',
      namespaces: ['test'],
    }
  }
});

await player.load('https://localhost:4433/moq', null, 'application/msf');
```
