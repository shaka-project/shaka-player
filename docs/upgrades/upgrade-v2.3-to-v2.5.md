# Shaka Upgrade Guide, v2.3 => v2.5

This is a detailed guide for upgrading from Shaka Player v2.3 to v2.5.
Feel free to skim or to search for the class and method names you are using in
your application.


#### What's New in v2.5?

Shaka v2.5 introduces several improvements over v2.3, including:
  - An official Shaka Player UI library to provide customizable and styleable
    video controls
    - Load dist/shaka-player.ui.js
    - See tutorial in docs/tutorials/ui.md
  - Complete redesign of the demo app
  - FairPlay support
  - Native HLS support on iOS and Safari
  - Support for single-file playback
  - Network requests can be aborted when switching streams
  - Partial support for SMPTE-TT subtitles
  - Improved service worker in demo app PWA
  - Drift tolerance for live DASH streams (on by default)
  - PlayReady license URL parsing (ms:laurl)
  - Support for CEA captions
  - New config field to ignore manifest minBufferTime
  - Offline storage without a Player instance
  - A safe margin parameter was added for clearing the buffer
  - Widevine SAMPLE-AES support in HLS
  - Support for TTML and VTT regions
  - A video element is no longer required when `Player` is constructed
  - New `attach()` and `detach()` methods have been added to `Player` to manage
    attachment to video elements
  - Fetch is now preferred over XHR when available
  - Live stream playback can begin at a negative offset from the live edge


#### Extern namespace change

If you use the Closure Compiler in your own project, you need to know that v2.5
changes the namespace for our externs, such as plugin interfaces and manifest
types.  The namespace has changed from `shakaExtern` to `shaka.extern`.  You
MUST update any references to `shakaExtern`.

```js
// v2.3:
/**
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shakaExtern.Request} request
 * @return {!Promise}
 */
function myFilter(type, request) { /* ... */ }

// v2.5:
/**
 * @param {shaka.net.NetworkingEngine.RequestType} type
 * @param {shaka.extern.Request} request
 * @return {!Promise}
 */
function myFilter(type, request) { /* ... */ }
```


#### Factory parameter change

The optional `Factory` parameter in `Player.load()` and `Storage.store()` has
been changed to a MIME type string.  The `Factory` parameter is now deprecated
and will be removed in v3.0.  Applications SHOULD update to use MIME types
instead of explicit factories.  Any registered factory can be referenced by its
registered MIME type.

```js
// v2.3:
player.load('foo.mpd', /* startTime= */ 0,
    /* factory= */ shaka.dash.DashParser);

// v2.5:
player.load('foo.mpd', /* startTime= */ 0,
    /* mimeType= */ 'application/dash+xml');
```

See {@link shaka.Player#load} for details.


#### Manifest URI API change

The method `Player.getManifestUri()` has been renamed to `Player.getAssetUri()`.
The older method is now deprecated and will be removed in v3.0.  Applications
SHOULD update to the new method, whose name more accurately reflects our new
support for non-manifest content.

```js
// v2.3:
const uri = player.getManifestUri();

// v2.5:
const uri = player.getAssetUri();
```


#### Text parser plugin API changes

The TextParser plugin API has changed.

The `segmentStart` attribute of `shakaExtern.TextParser.TimeContext` is now
nullable.  Your plugin will receive a `segmentStart` of `null` if the
information is not available, as is the case in HLS.

Text-parsing plugins that produce region information will need to be updated to
use the new `shaka.text.CueRegion` class.  The new structure allows for more
accurate representation of both TTML and VTT regions.

All application-specific text-parsing plugins MUST to be updated.
v2.5 does not have backward compatibility for this!

See {@link shaka.extern.TextParser.TimeContext} and {@link shaka.text.CueRegion}
for details.


#### TextDisplayer plugin API changes

The `Cue` objects consumed by `TextDisplayer` have changed in v2.5.

 - `CueRegion` structure has changed to allow for more accurate representation
   of both TTML and VTT regions
 - `Cue.writingDirection` has been split into `Cue.writingMode` and
   `Cue.direction` to fix bugs in the handling of these attributes
 - `Cue.backgroundImage` has been added

All application-specific TextDisplayer plugins MUST to be updated.
v2.5 does not have backward compatibility for this!

See {@link shaka.extern.Cue} and {@link shaka.extern.CueRegion} for details.


#### NetworkingEngine API changes

In v2.3, the `request()` method on `shaka.net.NetworkingEngine` returned a
Promise.  Now, in v2.5, it returns an instance of
`shakaExtern.IAbortableOperation`, which contains a Promise.

All applications which make application-level requests via `NetworkingEngine`
MUST update to the new API.  Support for the old API was removed in v2.5.

```js
// v2.3:
const response = await player.getNetworkingEngine().request(type, request);

// v2.5:
const operation = player.getNetworkingEngine().request(type, request);
// The operation can also be aborted on some condition.
onSomeCondition(() => {
  operation.abort();
});
// Use operation.promise to get the response.
const response = await operation.promise;
```


#### Network scheme plugin changes

In v2.4, we changed the API for network scheme plugins.

These plugins now return an instance of `shakaExtern.IAbortableOperation`.
We suggest using the utility `shaka.util.AbortableOperation` for convenience.

We also introduced an additional parameter for network scheme plugins to
identify the request type.

All applications which have application-level network scheme plugins MUST
update to the new API.  Support for the old API was removed in v2.5.

In v2.5, we added another new parameter to network scheme plugins to allow
plugins to provide progress events.  This callback is only provided to your
plugin for segment requests, so you must handle the case where this is not
provided.  If you ignore this callback, the bandwidth estimate will take longer
to converge and `StreamingEngine` will be unable to abort a request early to
switch to a better stream.  Applications SHOULD update their custom network
scheme plugins to provide progress events if feasible.

```js
// v2.3:
function mySchemePlugin(uri, request) {
  return new Promise((resolve, reject) => {
    // ...
  });
}
shaka.net.NetworkingEngine.registerScheme('foo', mySchemePlugin);

// v2.5:
function mySchemePlugin(uri, request, requestType) {
  let rejectCallback = null;

  const promise = new Promise((resolve, reject) => {
    rejectCallback = reject;

    // Use this if you have a need for it.  Ignore it otherwise.
    if (requestType == shaka.net.NetworkingEngine.RequestType.MANIFEST) {
      // ...
    } else {
      // ...
    }

    // ...
  });

  const abort = () => {
    // Abort the operation.
    // ...

    // Reject the Promise.
    rejectCallback(new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.OPERATION_ABORTED));
  };

  return new shaka.util.AbortableOperation(promise, abort);
}
shaka.net.NetworkingEngine.registerScheme('foo', mySchemePlugin);

// v2.5:
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

A new request type has been introduced:
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
const response = await player.getNetworkingEngine().request(type, request);

// v2.5:
const operation = player.getNetworkingEngine().request(type, request);
// The operation can also be aborted on some condition.
onSomeCondition(() => {
  operation.abort();
});
// Use operation.promise to get the response.
const response = await operation.promise;
```

See {@link shaka.net.NetworkingEngine} for details.


#### Offline storage changes

In v2.5, `shaka.offline.Storage.configure()` now takes a complete `Player`
configuration object instead of a separate one.  The fields that were previously
part of the `Storage` config (`trackSelectionCallback`, `progressCallback`, and
`usePersistentLicense`) have been moved inside the `offline` field.  The old
field locations are now deprecated and will be removed in v3.0.  Applications
SHOULD update to use the new field locations.

```js
// v2.4:
storage.configure({
  trackSelectionCallback: myTrackSelectionCallback,
});

// v2.5:
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


#### Manifest parser plugin API changes

The API for `shaka.media.PresentationTimeline` has changed.  `ManifestParser`
plugins that use these methods MUST be updated:

  - `setAvailabilityStart()` was renamed to `setUserSeekStart()`.
  - `notifySegments()` now takes a reference array and a boolean called
    `isFirstPeriod`, instead of a period start time and a reference array.

```js
// v2.3:
timeline.setAvailabilityStart(100);
timeline.notifySegments(segmentList, /* periodStart= */ 0);

// v2.5:
timeline.setUserSeekStart(100);
timeline.notifySegments(segmentList, /* isFirstPeriod= */ true);
```
