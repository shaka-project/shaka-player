# Shaka Upgrade Guide, v2.4 => v3.0

This is a detailed guide for upgrading from Shaka Player v2.4 to v3.0.
Feel free to skim or to search for the class and method names you are using in
your application.


#### What's New in v3.0?

Shaka v3.0 introduces several improvements over v2.4, including:
  - An official Shaka Player UI library to provide customizable and styleable
    video controls
    - Load dist/shaka-player.ui.js
    - See tutorial in docs/tutorials/ui.md
  - Ad-insertion APIs (integrated with the Google IMA SDK)
  - Complete redesign of the demo app
  - FairPlay support
  - Native HLS support on iOS and Safari
  - Support for single-file playback
  - Network requests can be aborted when switching streams
  - Offline storage operations can be aborted
  - Support for concurrent operations in a single shaka.offline.Storage instance
  - Stable Track objects across DASH Periods
  - Partial support for SMPTE-TT subtitles
  - Improved service worker in demo app PWA
  - Drift tolerance for live DASH streams (on by default)
  - PlayReady license URL parsing (ms:laurl)
  - Support for CEA captions in DASH
  - Merged CEA captions in text tracks API
  - New config field to ignore manifest minBufferTime
  - New config field `streaming.inaccurateManifestTolerance` to control
    assumptions about manifest accuracy
  - New fields in getStats()
  - Configuration for presentation delay
  - Offline storage without a Player instance
  - A safe margin parameter was added for clearing the buffer
  - Widevine SAMPLE-AES support in HLS


#### Extern namespace change

If you use the Closure Compiler in your own project, you need to know that v3.0
changes the namespace for our externs, such as plugin interfaces and manifest
types.  The namespace has changed from `shakaExtern` to `shaka.extern`.  You
MUST update any references to `shakaExtern`.

```js
// v2.4:
/**
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shakaExtern.Request} request
 * @return {!Promise}
 */
function myFilter(type, request) { /* ... */ }

// v3.0:
/**
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shaka.extern.Request} request
 * @return {!Promise}
 */
function myFilter(type, request) { /* ... */ }
```


#### Player Factory parameter change

The optional `Factory` parameter in `Player.load()` and `Storage.store()` has
been changed to a MIME type string.  The `Factory` parameter was deprecated in
v2.5 and removed in v3.0.  Applications MUST update to use MIME types instead of
explicit factories.  Any registered factory can be referenced by its registered
MIME type.

```js
// v2.4:
player.load('foo.mpd', /* startTime= */ 0,
    /* factory= */ shaka.dash.DashParser);

// v3.0:
player.load('foo.mpd', /* startTime= */ 0,
    /* mimeType= */ 'application/dash+xml');
```

See {@link shaka.Player#load} for details.


#### Manifest URI API change

The method `Player.getManifestUri()` has been renamed to `Player.getAssetUri()`.
The older method was deprecated in v2.5 and was removed in v3.0.  Applications
MUST update to the new method, whose name more accurately reflects our support
for non-manifest content.

```js
// v2.4:
const uri = player.getManifestUri();

// v3.0:
const uri = player.getAssetUri();
```


#### Embedded text (CEA 608/708) API change

The CEA-specific methods `Player.selectEmbeddedTextTrack()` and
`Player.usingEmbeddedTextTrack()` were deprecated in v2.5 and were removed in
v3.0.  CEA captions now show up in the standard text track APIs:
`getTextTracks()`, `selectTextTrack()`, `getTextLanguages()`,
`getTextLanguagesAndRoles()`, and `selectTextLanguage()`.  Applications MUST
update to using the track APIs.  If you have content with VTT or TTML subtitles,
you should already be using these APIs.

```js
// v2.4:
player.selectEmbeddedTextTrack();

// v3.0:
const tracks = player.getTextTracks();
const desiredTrack = someProcessToChooseOne(tracks);
player.selectTextTrack(desiredTrack);
```


#### Utility method changes

In v3.0, the method `shaka.util.Uint8ArrayUtils.equal` has been moved to
`shaka.util.BufferUtils.equal`.  The new method supports both `ArrayBuffer` and
subclasses of `ArrayBufferView` like `Uint8Array`.

Backward compatibility will be provided until v3.1.  Applications SHOULD update
to use the new location.

```js
// v2.4:
if (shaka.util.Uint8ArrayUtils.equal(array1, array2) { ...

// v3.0:
if (shaka.util.BufferUtils.equal(array1, array2) { ...
```


#### Configurable factory changes

All configuration fields and plugin registration interfaces that accept
factories have been changed in v3.0.  These factories SHOULD now be functions
that return an object and MAY be arrow functions.  This makes our configuration
and plugin registration interfaces consistent and improves usability in some
cases.

Backward compatibility is provided until v3.1.  If we detect that a factory
needs to be called with `new`, we will do so and log a deprecation warning.
Applications SHOULD update their factories.

This change affects the following types:

 - {@link shaka.extern.AbrManager.Factory}
 - {@link shaka.extern.ManifestParser.Factory}
 - {@link shaka.extern.TextDisplayer.Factory}
 - {@link shaka.extern.TextParserPlugin}

```js
// v2.4:
class MyAbrManager {
  // ...
}
player.configure('abrFactory', MyAbrManager);

class MyManifestParser {
  // ...
}
shaka.media.ManifestParser.registerParserByMime('text/foo', MyManifestParser);

// v3.0:
player.configure('abrFactory', () => new MyAbrManager());
shaka.media.ManifestParser.registerParserByMime(
    'text/foo', () => new MyManifestParser());
```


#### Misc configuration changes

The configurable callback `manifest.dash.customScheme` has been removed in v3.0
and is no longer supported.

The config field `manifest.dash.defaultPresentationDelay` has been moved to
`manifest.defaultPresentationDelay`.  Backward compatibility is provided until
v3.1.  Applications using this field SHOULD update to use the new location.

The `manifest.defaultPresentationDelay` field now affects both DASH and HLS
content.  The default value is `0`, which is interpretted differently for DASH
and HLS:

 - In DASH, `0` means a default of `1.5 * minBufferTime`.
 - In HLS, `0` means a default of `3 * segment duration`.

The config field `manifest.dash.initialSegmentLimit` has been added to control
memory usage during DASH `<SegmentTemplate>` parsing.

The config field `streaming.inaccurateManifestTolerance` (in seconds) has been
added to control off-by-one behavior in streaming.  Compared with v2.4.x
behavior, the default for this field should reduce the frequency with which we
have to fetch an additional segment before a seek target.  For less accurate
manifests, the tolerance can be increased.  For completely accurate manifests,
applications may set this to `0`.

See {@link shaka.extern.ManifestConfiguration} and
{@link shaka.extern.StreamingConfiguration} for details.


#### Offline API changes

In v3.0, there is no longer any restriction on concurrent operations.

The method `Storage.store()` now returns an instance of `IAbortableOperation`
instead of `Promise`.  This allows applications to call `op.abort()` to stop an
operation in progress.  The operation `Promise` can now be found on
`op.promise`.  Backward compatibility is provided until v3.1; these operations
will work like `Promise`s in v3.0.  (Applications MAY `await` them or call
`.then()` on them.)  In v3.1, these returned operations will no longer be
`Promise`-like, so applications SHOULD update at this time to use `op.promise`.

```js
// v2.4:
try {
  const result = await storage.store();
} catch (error) {
  // Store failed!
}

// v3.0:
const op = storage.store();
cancelButton.onclick = async () => {
  await op.abort();
};

try {
  const result = await op.promise;
} catch (error) {
  if (error.code == shaka.util.Error.Code.OPERATION_ABORTED) {
    // Store aborted by the user!
  } else {
    // Store failed!
  }
}
```

In v3.0, `shaka.offline.Storage.configure()` now takes a complete `Player`
configuration object instead of a separate one.  The fields that were previously
part of the `Storage` config (`trackSelectionCallback`, `progressCallback`, and
`usePersistentLicense`) have been moved inside the `offline` field.  The old
field locations were deprecated in v2.5 and removed in v3.0.  Applications MUST
update to use the new field locations.

```js
// v2.4:
storage.configure({
  trackSelectionCallback: myTrackSelectionCallback,
});

// v3.0:
const storage = new shaka.offline.Storage();
storage.configure({
  offline: {
    trackSelectionCallback: myTrackSelectionCallback,
  },
});

// OR use shared Player configuration:
const storage = new shaka.offline.Storage(player);
player.configure({
  offline: {
    trackSelectionCallback: myTrackSelectionCallback,
  },
});

// OR use shared Player configuration and two-argument configure():
const storage = new shaka.offline.Storage(player);
player.configure('offline.trackSelectionCallback', myTrackSelectionCallback);
```

A new method has been introduced to allow an application to clean up and release
any offline EME sessions that were not cleanly released:
`Storage.removeEmeSessions()`.  Applications MAY use this if desired.

See {@link shaka.offline.Storage} for details.


#### NetworkingEngine API changes

The fields `Request.body` and `Response.data` can now be either `ArrayBuffer` or
an `ArrayBufferView` (e.g. `Uint8Array`).  This means your request and response
filters no longer have to convert a `Uint8Array` to `ArrayBuffer` to assign to
`Request.body` or `Response.data`.  However, this also means such filters MUST
not assume one type or the other if they read those fields.

Applications SHOULD use these provided utilities to simplify common conversions:

 - {@link shaka.util.BufferUtils}
 - {@link shaka.util.StringUtils}
 - {@link shaka.util.Uint8ArrayUtils}


#### Track API changes

The track APIs on `Player` have changed.  Tracks now represent the entire
presentation across DASH Periods, and will no longer change at Period
boundaries.  The `originalId` field is now a combination of the original IDs of
the DASH Representations that make up the track.


#### Stats changes

The stats returned by `Player.getStats()` have changed.

The `streamBandwidth` field now accounts for the current playback rate when
reporting the bandwidth requirements of a stream.  For example, if the content
is playing at 2x, the bandwidth requirement to play it is also doubled.

The following new fields have been added:

 - `manifestTimeSeconds`
 - `drmTimeSeconds`
 - `liveLatency`

See {@link shaka.extern.Stats stats} for details.


#### Network scheme plugin changes

In v2.5, we added a new parameter to network scheme plugins to allow plugins to
provide progress events.  This callback is only provided to your plugin for
segment requests, so you must handle the case where this is not provided.  The
use of this callback enables `StreamingEngine` to converge more quickly on the
ideal bandwidth estimate.  Applications SHOULD update their custom network
scheme plugins to provide progress events if feasible.

```js
// v3.0:
function mySchemePlugin(uri, request, requestType, progressUpdated) {
  /// ...

    if (progressUpdated) {
      progressUpdated(/* timeElapsedMilliseconds= */ currentTime - lastTime,
                      /* bytesLoaded= */, loaded - lastLoaded,
                      /* byteRemaining= */, contentLength - loaded);
      lastTime = currentTime;
      lastLoaded = loaded;
    }

  /// ...
}
shaka.net.NetworkingEngine.registerScheme('foo', mySchemePlugin);
```

See {@link shaka.extern.ProgressUpdated} and {@link shaka.extern.SchemePlugin}
for details.


#### Network filter changes

A new request type was introduced in v2.5:
`shaka.net.NetworkingEngine.RequestType.TIMING`.  This is used for time sync
requests in the DASH parser.  Previously, these requests used the type
`MANIFEST`.  Applications which look for specific request types in a filter MAY
use this information if desired.


#### NetworkingEngine changes

In v2.3, the `request()` method on `shaka.net.NetworkingEngine` returned a
`Promise`.  In v2.5, it returns an implementation of
`IAbortableOperation.<shaka.extern.Response>`, which contains a `Promise`.

All applications which make application-level requests via `NetworkingEngine`
MUST update to the new API.  The old API was removed in v2.5.

```js
// v2.3:
try {
  const response = await player.getNetworkingEngine().request(type, request);
} catch (error) {
  // Request failed!
}

// v3.0:
const operation = player.getNetworkingEngine().request(type, request);

// The operation can also be aborted on some condition.
onSomeCondition(() => {
  operation.abort();
});

// Use operation.promise to get the response.
try {
  const response = await operation.promise;
} catch (error) {
  if (error.code == shaka.util.Error.Code.OPERATION_ABORTED) {
    // Request aborted!
  } else {
    // Request failed!
  }
}
```

See {@link shaka.net.NetworkingEngine} for details.


#### AbrManager plugin changes

In v3.0, we added a method to the `shaka.extern.AbrManager` interface called
`playbackRateChanged(rate)`.  This allows implementations to consider the
current playback rate in their ABR decisions.

Backward compatibility will be provided until v3.1.  Applications with custom
`AbrManager` plugins SHOULD update to add this method to their implementations.

See {@link shaka.extern.AbrManager} for details.


#### TextDisplayer plugin changes

The `Cue` objects consumed by `TextDisplayer` have changed in v2.5 and v3.0.

 - `Cue.writingDirection` has been split into `Cue.writingMode` and
   `Cue.direction` to fix bugs in the handling of these attributes
 - `Cue.size` now defaults to `0`, which should be interpretted as "auto" (fit
   to text).

All application-specific TextDisplayer plugins MUST be updated.
v3.0 does not have backward compatibility for this!

In addition, the following new fields have been added and MAY be used by
`TextDisplayer` plugins:

 - `Cue.backgroundImage`
 - `Cue.border`
 - `Cue.cellResolution`
 - `Cue.letterSpacing`
 - `Cue.linePadding`
 - `Cue.opacity`

See {@link shaka.extern.Cue} for details.


#### Built-in network scheme plugin changes

Some of the built-in network scheme plugins have changed their API.  Instead of
registering the class itself, they now register a static `parse()` method on
the class.  Any applications with scheme plugins that delegate to these
built-in plugins MUST update to call the new methods.

This affects the following classes:

 - {@link shaka.net.DataUriPlugin}
 - {@link shaka.net.HttpFetchPlugin}
 - {@link shaka.net.HttpXHRPlugin}

```js
// v2.5:
function MySchemePlugin(uri, request, requestType, progressUpdated) {
  return shaka.net.DataUriPlugin(
      uri, request, requestType, progressUpdated);
}
shaka.net.NetworkingEngine.registerScheme('data', MySchemePlugin);

// v3.0:
function MySchemePlugin(uri, request, requestType, progressUpdated) {
  return shaka.net.DataUriPlugin.parse(
      uri, request, requestType, progressUpdated);
}
```


#### Manifest parser plugin API changes

v3.0 introduced many changes to the {@link shaka.extern.Manifest} structure.
Any application with a custom {@link shaka.extern.ManifestParser} or which uses
{@link shaka.Player#getManifest} MUST be upgraded for compatibility with v3.0.

If your application meets either of these criteria, please refer to
{@tutorial upgrade-manifest} for detailed instructions on upgrading.
