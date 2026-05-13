# Shaka Upgrade Guide, v2.5 => v3.0

This is a detailed guide for upgrading from Shaka Player v2.5 to v3.0.
Feel free to skim or to search for the class and method names you are using in
your application.


#### What's New in v3.0?

Shaka v3.0 introduces several improvements over v2.5, including:
  - Ad-insertion APIs (integrated with the Google IMA SDK)
  - Ad-related UI elements
  - Offline storage operations can be aborted
  - Support for concurrent operations in a single shaka.offline.Storage instance
  - Config field `manifest.dash.defaultPresentationDelay` has been moved to
    `manifest.defaultPresentationDelay` and now applies to both DASH & HLS
  - New config field `streaming.inaccurateManifestTolerance` to control
    assumptions about manifest accuracy
  - New fields in getStats()
  - Stable Track objects across DASH Periods
  - New loop button available in UI overflow menu (`'loop'`, hidden by default)
  - New playback rate submenu in UI overflow menu (`'playback_rate'`, shown by
    default)


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


#### UI API change

In v2.5.1, the method `shaka.ui.Overlay.getPlayer()` was deprecated and moved
to `ui.getControls().getPlayer()`.  In v3.0, the old location was removed.
Applications that use this method MUST update to the new location.

```js
// v2.5:
const player = ui.getPlayer();

// v3.0:
const player = ui.getControls().getPlayer();
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

Backward compatibility will be provided until v4.0.  Applications SHOULD update
to use the new location.

```js
// v2.5:
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

Backward compatibility is provided until v4.0.  If we detect that a factory
needs to be called with `new`, we will do so and log a deprecation warning.
Applications SHOULD update their factories.

This change affects the following types:

 - {@link shaka.extern.AbrManager.Factory}
 - {@link shaka.extern.ManifestParser.Factory}
 - {@link shaka.extern.TextDisplayer.Factory}
 - {@link shaka.extern.TextParserPlugin}

```js
// v2.5:
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


#### FairPlay configuration changes

The init data format in our Safari EME polyfill has been updated to match the
init data format of Safari's unprefixed EME implementation.  This means init
data will arrive in the "skd" format, which is different from what was provided
by the polyfill in v2.5.  This format is a buffer containing a UTF-8 string,
which is a URL that begins with `skd://`.  Init data processing done by the
`drm.initDataTransform` callback MUST be updated.

The signature of the configurable callback `drm.initDataTransform` has changed.
Applications using this for FairPlay content MUST update their callbacks.  A
new parameter has been added to the callback signature.

```js
// v2.5:
function initDataTransform(/** Uint8Array */ initData,
                           /** shaka.extern.DrmInfo */ drmInfo) {}

// v3.0:
function initDataTransform(/** Uint8Array */ initData,
                           /** string */ initDataType,
                           /** shaka.extern.DrmInfo */ drmInfo) {}
```

The new default for `drm.initDataTransform` should work for most content.
Please try the default first (without configuring your own callback).  If init
data transformation is still needed, please use the utilities provided in
{@link shaka.util.FairPlayUtils}, {@link shaka.util.StringUtils} to make this
processing easier.  You can refer to {@tutorial fairplay} as well.


#### Misc configuration changes

The configurable callback `manifest.dash.customScheme` has been removed in v3.0
and is no longer supported.

The config field `manifest.dash.defaultPresentationDelay` has been moved to
`manifest.defaultPresentationDelay`.  Backward compatibility is provided until
v4.0.  Applications using this field SHOULD update to use the new location.

The `manifest.defaultPresentationDelay` field now affects both DASH and HLS
content.  The default value is `0`, which is interpreted differently for DASH
and HLS:

 - In DASH, `0` means a default of `1.5 * minBufferTime`.
 - In HLS, `0` means a default of `3 * segment duration`.

The config field `manifest.dash.initialSegmentLimit` has been added to control
memory usage during DASH `<SegmentTemplate>` parsing.

The config field `streaming.inaccurateManifestTolerance` (in seconds) has been
added to control off-by-one behavior in streaming.  Compared with v2.5.x
behavior, the default for this field should reduce the frequency with which we
have to fetch an additional segment before a seek target.  For less accurate
manifests, the tolerance can be increased.  For completely accurate manifests,
applications may set this to `0`.

See {@link shaka.extern.ManifestConfiguration} and
{@link shaka.extern.StreamingConfiguration} for details.


#### Offline API changes

In v3.0, the offline storage method `Storage.getStoreInProgress()` is now
deprecated and always returns `false`.  There is no longer any restriction on
concurrent operations.  This method will be removed in v4.0.  Applications
SHOULD stop using it.

The method `Storage.store()` now returns an instance of `IAbortableOperation`
instead of `Promise`.  This allows applications to call `op.abort()` to stop an
operation in progress.  The operation `Promise` can now be found on
`op.promise`.  Backward compatibility is provided until v4.0; these operations
will work like `Promise`s in v3.0.  (Applications MAY `await` them or call
`.then()` on them.)  In v4.0, these returned operations will no longer be
`Promise`-like, so applications SHOULD update at this time to use `op.promise`.

```js
// v2.5:
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


#### New UI elements

The following new UI elements have been added:

 - Ad-related elements (shown automatically during an ad, not currently
   configurable)
 - Overflow menu toggle for looping video (`'loop'`, not shown by default)
 - Overflow menu item and submenu for playback rate (`'playback_rate'`, shown
   by default)

See {@tutorial ui-customization}.


#### AbrManager plugin changes

In v3.0, we added a method to the `shaka.extern.AbrManager` interface called
`playbackRateChanged(rate)`.  This allows implementations to consider the
current playback rate in their ABR decisions.

Backward compatibility will be provided until v4.0.  Applications with custom
`AbrManager` plugins SHOULD update to add this method to their implementations.

See {@link shaka.extern.AbrManager} for details.


#### TextDisplayer plugin changes

The `Cue` objects consumed by `TextDisplayer` have changed in v3.0.

 - `Cue.size` now defaults to `0`, which should be interpreted as "auto" (fit
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


#### UI element plugin changes

The interface {@link shaka.extern.IUIElement} now has a synchronous `release()`
method instead of an asynchronous `destroy()` method.  Backward compatibility
will be provided until v4.0.  Applications with UI element plugins SHOULD
update their plugins to replace `destroy()` with `release()`.

```js
// v2.5:
class MyUIElement {
  async destroy() {
    // Release resources asynchronously.
  }
}

// v3.0:
class MyUIElement {
  release() {
    // Release resources synchronously.
  }
}
```


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
