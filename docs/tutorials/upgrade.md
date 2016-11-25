# Shaka v2 Upgrade Guide

This is a detailed guide for upgrading from Shaka Player v1 to v2.  It is a bit
long to read from beginning to end, so feel free to skim or to search for the
class and method names you are using in your application.


#### What's New in v2?

Shaka v2 has several improvements over v1, including:
  - Support for multiple DASH Periods
  - Support for DASH Location elements
  - Support for DASH UTCTiming elements for clock synchronization
  - Lower-latency startup
  - Simplified API
  - Better browser compatibility
  - More detailed browser support test
  - Numerical error code system
  - Clears old data from the buffer to conserve memory
  - Buffering state is independent of play/pause
  - Distinguishes between subtitle and caption tracks
  - Separate audio & text language preferences
  - New plugin and build system to extend Shaka
  - Cache-friendly networking
  - Simpler, mobile-friendly demo app


#### Shaka Plugins

Shaka v2 has a new, cleaner architecture than v1 based on plugins.  In v2,
networking, manifest parsing, and subtitle/caption parsing are all plugins.

We bundle some default plugins (HTTP support, DASH support, and WebVTT), and
we plan to expand this list in future releases.  Application developers can
write their own plugins as well.  Plugins can either be compiled into the
library, or they can live outside the library in the application.  Application
developers can also customize the build to exclude any default plugins they
don't need.

For a more in-depth discussion of plugins, check out {@tutorial plugins}.


#### Namespace

In v1, the `Player` class was namespaced as `shaka.player.Player`.  In v2, this
has been simplified to `shaka.Player`.


#### load()

Before, you needed a `DashVideoSource` or other `IVideoSource` subclass to pass
to `player.load()`.  The video source was constructed with a manifest URL:

```js
// v1:
var player = new shaka.player.Player(video);
var videoSource = new shaka.player.DashVideoSource(manifestUri);
player.load(videoSource);
```

In v2, the entire video source concept is gone from the API.  Now, you pass the
URL directly to the player, and it decides which manifest parser plugin to use
based on the file extension or MIME type:

```js
// v2:
var player = new shaka.Player(video);
player.load(manifestUri);
```


#### ContentProtection callbacks

Shaka v1's `DashVideoSource` had a parameter for a `ContentProtection` callback.
This callback was required to play protected content because Shaka did not
interpret `ContentProtection` elements in the DASH manifest and could not
derive the license server URI automatically:

```js
// v1:
function interpretContentProtection(schemeIdUri, contentProtectionElement) {
  if (schemeIdUri.toLowerCase() ==
      'urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed') {
    // This is the UUID which represents Widevine.
    return [{
      'keySystem': 'com.widevine.alpha',
      'licenseServerUrl': '//widevine-proxy.appspot.com/proxy'
    }];
  } else if (schemeIdUri.toLowerCase() ==
      'urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95') {
    // This is the UUID which represents PlayReady.
    return [{
      'keySystem': 'com.microsoft.playready',
      'licenseServerUrl': '//playready.directtaps.net/pr/svc/rightsmanager.asmx'
    }];
  } else {
    return null;
  }
}
var player = new shaka.player.Player(video);
var videoSource = new shaka.player.DashVideoSource(
    manifestUri, interpretContentProtection);
player.load(videoSource);
```

In v2, these callbacks are *only* required for *non-standard* ContentProtection
schemes, such as that used by YouTube's demo assets.  For the 99% of you who are
using standard schemes, no callback is required.  Simply `configure()` the
player with your license servers:

```js
// v2:
var player = new shaka.Player(video);
player.configure({
  drm: {
    servers: {
      'com.widevine.alpha': '//widevine-proxy.appspot.com/proxy'
      'com.microsoft.playready': '//playready.directtaps.net/pr/svc/rightsmanager.asmx'
    }
  }
});
player.load(manifestUri);
```

For a more in-depth discussion of DRM configuration, see {@tutorial drm-config}.

If you need to support a custom ContentProtection scheme, you can still do so
with a callback set through `player.configure()`:

```js
// v2:
function interpretContentProtection(contentProtectionElement) {
  if (contentProtectionElement.getAttribute('schemeIdUri') ==
      'http://youtube.com/drm/2012/10/10') {
    var configs = [];
    for (....) {
      configs.push({
        'keySystem': keySystem,
        // WATCH OUT: now called URI not URL
        'licenseServerUri': licenseServerUri
      });
    }
    return configs;
  }
}

var player = new shaka.Player(video);
player.configure({
  manifest: {
    dash: {
      customScheme: interpretContentProtection
    }
  }
});
player.load(manifestUri);
```

For more on what you can specify for a custom scheme, see the docs for
{@link shakaExtern.DrmInfo}.


#### Detailed DrmInfo

Shaka v1's ContentProtection callbacks could return a detailed DrmInfo object
with lots of EME-related and license-request-related settings:

```js
// v1:
function interpretContentProtection(schemeIdUri, contentProtectionElement) {
  if (schemeIdUri.toLowerCase() ==
      'urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed') {
    return [{
      'keySystem': 'com.widevine.alpha',
      'licenseServerUrl': '//widevine-proxy.appspot.com/proxy',

      'distinctiveIdentifierRequired': true,
      'persistentStateRequired': false,
      'serverCertificate': certificateUint8Array,
      'audioRobustness': 'HW_SECURE_ALL',
      'videoRobustness': 'HW_SECURE_ALL',
      'initData': { 'initDataType': 'cenc', 'initData': initDataUint8Array },

      'licensePreProcessor': licensePreProcessor,
      'licensePostProcessor': licensePostProcessor,
      'withCredentials': true
    }];
  } else {
    return null;
  }
}
function licensePreProcessor(requestInfo) {
  // Only called for license requests.

  // Wrap the body, which is an ArrayBuffer:
  var newBody = wrapLicenseRequest(requestInfo.body);
  requestInfo.body = newBody;

  // Add a header:
  requestInfo.headers['foo'] = 'bar';
}
function licensePostProcessor(license) {
  // Only called for license responses.
  // Unwrap the license, which is a Uint8Array, use/store the extra data:
  var rawLicense = unwrapLicense(license);
  // Now return the raw license, which is also a Uint8Array:
  return rawLicense;
}
```

In v2, the EME settings have moved to the `drm.advanced` field of the config
object:

```js
// v2:
player.configure({
  drm: {
    advanced: {
      'com.widevine.alpha': {
        distinctiveIdentifierRequired: true,
        persistentStateRequired: true,
        serverCertificate: certificateUint8Array,
        audioRobustness: 'HW_SECURE_ALL',
        videoRobustness: 'HW_SECURE_ALL',
        // NOTE: initData is now an array of one or more overrides:
        initData: [{ initDataType: 'cenc', initData: initDataUint8Array }]
      }
    }
  }
});
```

For a discussion of advanced DRM configuration, see {@tutorial drm-config}.

Shaka v1's license-request-releated settings have moved to v2's network filters.

Network filters are a generic filtering system for all networking, including
license requests and responses.  They are more general and flexible, so they
take slightly more effort than the old preprocessor/postprocessor system.
However, in v2, you only need to filter your license traffic for two reasons:
  - if you use cross-site credentials (v1's "withCredentials" flag)
  - if you wrap/unwrap license requests and responses into some other format

```js
// v2:
player.getNetworkingEngine().registerRequestFilter(licensePreProcessor);
player.getNetworkingEngine().registerResponseFilter(licensePostProcessor);

function licensePreProcessor(type, request) {
  // A generic filter for all requests, so filter on type LICENSE:
  if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) return;

  // Equivalent to v1's 'withCredentials': true
  request.allowCrossSiteCredentials = true;

  // Wrap the request data, which is an ArrayBuffer:
  var newData = wrapLicenseRequest(request.data);
  request.data = newData;

  // Add a header:
  request.headers['foo'] = 'bar';
}
function licensePostProcessor(type, response) {
  // A generic filter for all responses, so filter on type LICENSE:
  if (type != shaka.net.NetworkingEngine.RequestType.LICENSE) return;

  // Unwrap the response, which is an ArrayBuffer, use/store the extra data:
  var rawLicense = unwrapLicense(response.data);
  // Instead of returning the raw license, store it back to the response:
  response.data = rawLicense;
  // Return nothing.
}
```

For more on request filters, see the docs for
{@link shaka.net.NetworkingEngine.RequestFilter}, {@link shakaExtern.Request},
{@link shaka.net.NetworkingEngine.ResponseFilter}, {@link shakaExtern.Response}.


#### ClearKey configuration

Shaka v1's `ContentProtection` callbacks could be used for ClearKey, but it
required you to craft both a data URI and fake init data in the correct format:

```js
// v1:
function interpretContentProtection(schemeIdUri, contentProtectionElement) {
  var keyid;  // as Uint8Array
  var key;  // as Uint8Array
  var keyObj = {
    kty: 'oct',
    kid: Uint8ArrayUtils.toBase64(keyid, false),
    k: Uint8ArrayUtils.toBase64(key, false)
  };
  var jwkSet = {keys: [keyObj]};
  var license = JSON.stringify(jwkSet);
  var initData = {
    'initData': keyid,
    'initDataType': 'webm'
  };
  var licenseServerUrl = 'data:application/json;base64,' +
      window.btoa(license);
  return [{
    'keySystem': 'org.w3.clearkey',
    'licenseServerUrl': licenseServerUrl,
    'initData': initData
  }];
}
```

In v2, this has been simplified through `player.configure()`:

```js
// v2:
player.configure({
  drm: {
    clearKeys: {
      'deadbeefdeadbeefdeadbeefdeadbeef': '18675309186753091867530918675309',
      '02030507011013017019023029031037': '03050701302303204201080425098033'
    }
  }
});
```

For more on ClearKey setup, see {@tutorial drm-config}.


#### BandwidthEstimator and AbrManager

Shaka v1's `DashVideoSource` had parameters for applications to inject custom
BandwidthEstimator and AbrManager implementations.  We even recommended
injecting BandwithEstimator to get persisted estimates across playbacks:

```js
// v1:
var player = new shaka.player.Player(video);
var bandwidthEstimator = new shaka.util.EWMABandwidthEstimator();
var abrManager = new shaka.media.SimpleAbrManager();
var videoSource = new shaka.player.DashVideoSource(
    manifestUri, /* interpretContentProtection */ null, estimator, abrManager);
player.load(videoSource);
```

In v2, we rolled the BandwidthEstimator concept into AbrManager.  It is no
longer necessary to inject an instance to persist estimates across playbacks,
and custom AbrManagers are now provided via `player.configure()`:

```js
// v2:
var player = new shaka.Player(video);
var customAbrManager = new MyCustomAbrManager();
player.configure({
  abr: {
    manager: customAbrManager
  }
});
player.load(manifestUri);
```

For more on the AbrManager interface, see the docs for
{@link shakaExtern.AbrManager}.


#### Selecting tracks

Shaka v1 had separate methods for each type of tracks: `getVideoTracks()`,
`getAudioTracks()`, and `getTextTracks()`, as well as `selectVideoTrack()`,
`selectAudioTrack()`, and `selectTextTrack()`.  Tracks were selected by ID.

```js
// v1:
var videoTracks = player.getVideoTracks();
var i = /* choose an index somehow */;
player.selectVideoTrack(videoTracks[i].id);  // id, specifically video
```

In Shaka v2, all tracks are queried and selected through the same methods:
`getTracks()` and `selectTrack()`.  Tracks are selected by passing the
entire track object:

```js
// v2:
var tracks = player.getTracks();
var i = /* choose an index somehow */;
player.selectTrack(tracks[i]);  // whole track, type does not matter
```

In v1, you could show or hide text tracks with `player.enableTextTrack()`:

```js
// v1:
player.enableTextTrack(true);
```

In v2, this becomes `player.setTextTrackVisibility()`:

```js
// v2:
player.setTextTrackVisibility(true);
```

See also the {@link shakaExtern.Track} structure which is used for all track
types (video, audio, text).


#### Side-loading captions/subtitles

In Shaka v1, you could side-load subtitles that were not present in the manifest
by calling `addExternalCaptions()` on the `DashVideoSource` before `load()`:

```js
// v1:
var player = new shaka.player.Player(video);
var videoSource = new shaka.player.DashVideoSource(manifestUri);
videoSource.addExternalCaptions(textStreamUri, 'fr-CA', 'text/vtt');
player.load(videoSource);
```

In v2, this is done on with `player.addTextTrack()` after load() is complete:

```js
// v2:
var player = new shaka.Player(video);
player.load(manifestUri).then(function() {
  player.addTextTrack(textStreamUri, 'fr-CA', 'caption', 'text/vtt');
});
```


#### Playback start time

Shaka v1's `player.setPlaybackStartTime()` would let you start playback at an
arbitrary timestamp.  It had to be called before load():

```js
// v1:
player.setPlaybackStartTime(123.45);
player.load(manifestUri);
```

In v2, this is done through an optional parameter on `load()`:

```js
// v2:
player.load(manifestUri, 123.45);
```


#### Trick play

Shaka v1 had `player.setPlaybackRate()` that could be used for trick play by
emulating negative rate support in `video.playbackRate`.  If you used
v1's `setPlaybackRate()` for trick play, use v2's `player.trickPlay()`.  For
other purposes, use `video.playbackRate` directly.


#### configure()

Shaka v1 and v2 both have a `player.configure()` method.  Here is a map of
settings in v1 and their equivalents in v2 (most of which are at a different
level of the configuration hierarchy):

  - `enableAdaptation` => `abr.enabled`
  - `streamBufferSize` => `streaming.bufferingGoal`
  - `licenseRequestTimeout` => `drm.retryParameters.timeout`
  - `mpdRequestTimeout` => `manifest.retryParameters.timeout`
  - `segmentRequestTimeout` => `streaming.retryParameters.timeout`
  - `preferredLanguage` => split into `preferredAudioLanguage` and
      `preferredTextLanguage`
  - `restrictions` => (same name, see below)
  - `liveStreamEndTimeout` => (not needed in v2)
  - `disableCacheBustingEvenThoughItMayAffectBandwidthEstimation` =>
      (not needed, always cache-friendly)

The `shaka.player.Restriction` type was replaced by a simple record type.  So
instead of constructing an object, simply create an anonymous JavaScript object.
`minPixels`/`maxPixels` were added to limit total pixels. Also `minBandwidth`
and `maxBandwidth` were split into `minAudioBandwidth`, `maxAudioBandwidth`,
`minVideoBandwidth`, and `maxVideoBandwidth`, see
{@link shakaExtern.Restrictions}.

For more information on configuration in v2, see {@tutorial config},
{@tutorial network-and-buffering-config}, and {@tutorial drm-config}.


#### getStats()

Shaka v1 had `player.getStats()`.  Shaka v2 has a similar method, but it returns
a somewhat different structure.

```js
// v1:
player.getStats()

=> Object
  streamStats: StreamStats  // refers to currently selected video stream
    videoWidth: number  // pixels
    videoHeight: number  // pixels
    videoMimeType: string
    videoBandwidth: number  // bits/sec
  decodedFrames: number
  droppedFrames: number
  estimatedBandwidth: number  // bits/sec
  playTime: number  // seconds
  bufferingTime: number  // seconds
  playbackLatency: number  // seconds
  bufferingHistory: Array  // of timestamps when we started buffering
  bandwidthHistory: Array of Objects
    timestamp: number  // seconds, when bandwidth estimate was made
    value: number  // bandwidth estimate, bits/sec
  streamHistory: Array of Objects
    timestamp: number  // seconds, when video stream changed
    value: StreamStats  // information about the selected stream, video only
```

Shaka v2 does not expose playback latency or a history of bandwidth estimates.
v2's `switchHistory` is more general than v1's `streamHistory`, and covers all
stream types:

```js
// v2:
player.getStats()

=> Object
  width: number // pixels, current video track
  height: number  // pixels, current video track
  streamBandwidth: number  // bits/sec, total for all current streams
  decodedFrames: number  // same as v1
  droppedFrames: number  // same as v1
  estimatedBandwidth: number  // bits/sec, same as v1
  playTime: number  // seconds, same as v1
  bufferingTime: number  // seconds, same as v1
  switchHistory: Array of Objects  // replaces v1's streamHistory
    timestamp: number  // seconds, when the stream was selected
    id: number  // stream ID
    type: string  // 'audio', 'video', 'text'
    fromAdaptation: boolean  // distinguishes between ABR and manual choices
```

For more on stats in v2, see {@link shakaExtern.Stats}.


#### Player events

In both Shaka v1 and v2, `Player` emits events.  Here is a map of events and
their properties in v1 and their equivalents in v2:

  - `error` => `error`
    - `detail` (various types) => `detail` ({@link shaka.util.Error})
      - `type` (vague string) => `category`
          (number, unambiguous {@link shaka.util.Error.Category error category})
      - `message` (vague string) => `code`
          (number, unambiguous {@link shaka.util.Error.Code error code})
  - `bufferingStart` and `bufferingEnd` => combined into `buffering`
    - (no v1 equivalent) => `buffering`
        (boolean, true when we enter buffering state, false when we leave)
  - (no v1 equivalent) =>
      `{@link shaka.Player.TextTrackVisibilityEvent texttrackvisibility}`
  - `trackschanged` => `trackschanged`
  - `seekrangechanged` =>
      (no v2 equivalent, use `{@link player.seekRange}()` when updating the UI)
  - `adaptation` => `adaptation`
    - `contentType` (string) => (no v2 equivalent)
    - `size` (width:number, height:number) => (no v2 equivalent)
    - `bandwidth` (number) => (no v2 equivalent)

For more information on events, see the Events section of {@link shaka.Player}.


#### Browser support testing

In Shaka v1, you could check if a browser was supported or not using
`shaka.player.Player.isBrowserSupported()`:

```js
// v1:
if (!shaka.player.Player.isBrowserSupported()) {
  // Show an error and abort.
}
```

In v2, the same method exists to detect support.  For diagnostics there is a new
method that will get more detailed information about the browser.  This will
involve making a number of queries to EME which may result in user prompts,
so it is suggested this only be used for diagnostics:

```js
// v2:
if (!shaka.Player.isBrowserSupported()) {
  // Show an error and abort.
} else {
  // Only call this method if the browser is supported.
  shaka.Player.probeSupport().then(function(support) {
    // The check is asynchronous because the EME API is asynchronous.
    // The support object contains much more information about what the browser
    // offers, if you need it.  For example, if you require both Widevine and
    // WebM/VP9:
    if (!support.drm['com.widevine.alpha'] ||
        !support.media['video/webm; codecs="vp9"']) {
      // Show an error and abort.
    }
  });
}
```

For more on the support object, check out {@link shakaExtern.SupportType}.
You can also see the full `probeSupport()` report for your browser at:
{@link http://shaka-player-demo.appspot.com/support.html}


#### HttpVideoSource

There is no equivalent to v1's `HttpVideoSource`.  Shaka v2 only supports
playback via MSE.  This is much simpler and allowed us to remove many special
cases from the code.


#### Offline playback

(coming soon to Shaka v2)
