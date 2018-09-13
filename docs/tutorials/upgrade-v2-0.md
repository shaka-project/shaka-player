# Shaka Upgrade Guide, v2.0 => v2.4

This is a detailed guide for upgrading from Shaka Player v2.0 to v2.4.
Feel free to skim or to search for the class and method names you are using in
your application.


#### What's New in v2.4?

Shaka v2.4 introduces several improvements over v2.0, including:
  - HLS support (VOD, Event, and Live)
  - DASH trick mode support
  - Support for jumping gaps in the timeline
  - Asynchronous network filters
  - Additional stats and events from Player
  - Indication of critical errors vs recoverable errors
  - Allowing applications to render their own text tracks
  - Allowing applications to define their own retry logic after streaming
    failures
  - Making the default ABR manager more configurable
  - Adding channel count and bandwidth info to variant tracks
  - Xlink support in DASH
  - Stricter runtime type-checking of EME cert configuration
  - New option for offline protected content without persistent licensing
  - MPEG-2 TS content can be transmuxed to MP4 for playback on all browsers
  - Captions are not streamed until they are shown
  - Use NetworkInformation API to get initial bandwidth estimate
  - The demo app is now a Progressive Web App (PWA) and can be used offline
  - Support for CEA captions in TS content
  - Support for TTML and VTT regions
  - A video element is no longer required when `Player` is constructed
  - New `attach()` and `detach()` methods have been added to `Player` to manage
    attachment to video elements
  - Fetch is now preferred over XHR when available
  - Network requests are now abortable
  - Live stream playback can begin at a negative offset from the live edge


#### Selecting tracks

Shaka v2.0 had one method for listing tracks (`getTracks()`) and one method for
selecting tracks (`selectTrack()`).  Audio, video, and text could all be
independently selected.

```js
// v2.0:
var allTracks = player.getTracks();
var videoTracks = allTracks.filter(function(t) { t.type == 'video'; });
var i = /* choose an index somehow */;
player.selectTrack(videoTracks[i]);
```

In Shaka v2.4, audio and video tracks are combined into a variant track.  It is
not possible to select individual audio/video streams, you can only select a
specific variant as specified by the manifest.  This was necessary for us to
support HLS.  Text tracks are independent of variant tracks.

You can get the currently available tracks using `getVariantTracks()` and
`getTextTracks()`.  To switch tracks, use `selectVariantTrack()` and
`selectTextTrack()`.

```js
// v2.4:
var variantTracks = player.getVariantTracks();
var i = /* choose an index somehow */;
player.selectVariantTrack(variantTracks[i]);
```

See also the {@link shakaExtern.Track} structure which is used for all track
types (variant and text).


#### Setting and configuring ABR manager

In Shaka v2.0, a custom ABR manager could be set through:

```js
player.configure({
  abr.manager: customAbrManager
});
```

In v2.4, it's done through:

```js
player.configure({
  abrFactory: customAbrManager
});
```

The API for AbrManager has also changed.

In v2.0, default bandwidth estimate and restrictions were set through
`setDefaultEstimate()` and `setRestrictions()` methods.

In v2.4, they are set through `configure()` method which accepts a
{@link shakaExtern.AbrConfiguration} structure. The new method is more general,
and allows for the configuration of bandwidth upgrade and downgrade targets
as well.

```js
// v2.0:
abrManager.setDefaultEstimate(defaultBandwidthEstimate);
abrManager.setRestrictions(restrictions);

// v2.4:
abrManager.configure(abrConfigurations);
```

In v2.0, AbrManager had a `chooseStreams()` method for the player to prompt for
a stream selection, and a `switch()` callback to send unsolicited changes from
AbrManager to player.  In v2.4, `chooseStreams()` has been replaced with
`chooseVariant()`, and the `switch()` callback takes a variant instead of a map
of streams.

```js
// v2.0:
var map = abrManager.chooseStreams(['audio', 'video']);
console.log(map['video'], map['audio']);

MyAbrManager.prototype.makeDecision_ = function() {
  var video = this.computeBestVideo_(this.bandwidth_);
  var audio = this.computeBestAudio_(this.bandwidth_);
  var map = {
    'audio': audio,
    'video': video
  };
  this.switch_(map);
};

// v2.4:
var variant = abrManager.chooseVariant();
console.log(variant, variant.video, variant.audio);

MyAbrManager.prototype.makeDecision_ = function() {
  var variant = this.computeBestVariant_(this.bandwidth_);
  this.switch_(variant);
};
```

The v2.0 interfaces were deprecated in v2.1 and have been removed in v2.3.
Applications with custom AbrManager plugins MUST upgrade to the new API.


#### Selecting tracks and adaptation settings

In v2.0, selecting a new video or audio track would implicitly disable
adaptation.

```js
// v2.0
player.selectTrack(videoTracks[i]);
// Adaptation has been implicitly disabled.
// To explicitly re-enable:
player.configure({abr: {enabled: true}});
```

In v2.4, any change in ABR state must be made explicitly if desired.

```js
// v2.4
// To explicitly disable:
player.configure({abr: {enabled: false}});
// Now select the track, which does not change adaptation state!
player.selectVariantTrack(variantTracks[i]);
```


#### Changing languages

With Shaka v2.0, you could change languages using `configure()` and the
`preferredAudioLanguage` and `preferredTextLanguage` fields.  This would affect
both the initial choice of language and the current language during playback.

```js
// v2.0:
player.configure({ preferredAudioLanguage: 'fr-CA' });
player.load(manifestUri);  // Canadian French preferred for initial playback
player.configure({ preferredAudioLanguage: 'el' });  // switch to Greek
```

In Shaka v2.4, language selection during playback is explicit and separate from
the configuration.  Configuration only affects the next call to `load()`, and
will not change languages during playback.

To list available languages, we provide the `getAudioLanguages()` and
`getTextLanguages()` methods.  To change languages during playback, use
`selectAudioLanguage()` and `selectTextLanguage()`.

```js
// v2.4:
player.configure({ preferredAudioLanguage: 'fr-CA' });
player.load(manifestUri);  // Canadian French preferred for initial playback

player.configure({ preferredAudioLanguage: 'el' });  // Greek, does nothing now
player.selectAudioLanguage('fa');  // switch to Farsi right now

player.load(secondManifestUri);  // Greek preferred for initial playback
```

In addition to the language methods introduced in v2.1, v2.4 adds additional
methods for dealing with roles: `getAudioLanguagesAndRoles()` and
`getTextLanguagesAndRoles()`.  These return language/role combinations in an
object.  You can specify a role in an optional second argument to the language
selection methods.

```js
// v2.4:
var languagesAndRoles = player.getAudioLanguagesAndRoles();

for (var i = 0; i < languagesAndRoles.length; ++i) {
  var combo = languagesAndRoles[i];
  if (someSelector(combo)) {
    player.selectAudioLanguage(combo.language, combo.role);
    break;
  }
}
```


#### Interpretation of Segmented WebVTT Text

Segmented WebVTT text is not well-defined by any spec.  Consensus in the
community seems to be that timestamps should be relative to the segment start.

In Shaka v2.0, we offered an option called `useRelativeCueTimestamps`.  When
set, WebVTT text timestamps were interpreted as relative to the segment.  When
not set, WebVTT text timestamps were intepreted as relative to the period.

In Shaka v2.1, this option was removed.  WebVTT text timestamps are now always
interpreted as relative to the segment start time.

Non-segmented WebVTT text, MP4-embedded VTT, and TTML are not affected by this
change.

For more information, see discussions here:
 - {@link https://github.com/google/shaka-player/issues/480}
 - {@link https://github.com/google/shaka-player/issues/726}


#### New "text" namespace

In Shaka v2.1, `TextEngine` was part of the `shaka.media` namespace.  In v2.2,
this was moved to the new `shaka.text` namespace.  Text-parsing plugins should
now be registered with {@link shaka.text.TextEngine.registerParser}.


#### Text parser plugin changes

Text parser plugins have a new interface.  The old interface was a single
function that took many parameters and handled both initialization segments and
media segments.  Initialization segments were indicated by null segment times.

```js
// v2.0
/**
 * @param {ArrayBuffer} data
 * @param {number} periodOffset
 * @param {?number} segmentStartTime
 * @param {?number} segmentEndTime
 * @param {boolean} useRelativeCueTimestamps Only used by the VTT parser
 * @return {!Array.<!TextTrackCue>}
 */
function MyTextParser(data, periodOffset, segmentStartTime, segmentEndTime) {
  if (segmentStartTime == null) {
    checkInitSegmentOrThrow(data);
    return [];
  }

  var cues = [];
  var parserState = new MyInternalParser(data);
  while (parserState.more()) {
    cues.push(new VTTCue(...));
  }
  return cues;
}
```

In Shaka v2.4, the text parser interface is now a constructor.  The interface
now has explicit methods for init segments and media segments, and parameters
related to time offsets have been grouped together into one `TimeContext`
parameter.

Also, text parser plugins now return `shaka.text.Cue` objects instead of
`VTTCue` or `TextTrackCue` objects, and take `Uint8Array` as input instead of
`ArrayBuffer`.

```js
// v2.4
/** @constructor */
function MyTextParser() {}

/** @param {!Uint8Array} data */
MyTextParser.prototype.parseInit = function(data) {
  checkInitSegmentOrThrow(data);
};


/**
 * @param {!Uint8Array} data
 * @param {shakaExtern.TextParser.TimeContext} timeContext
 * @return {!Array.<!shaka.text.Cue>}
 */
MyTextParser.prototype.parseMedia = function(data, timeContext) {
  var cues = [];
  var parserState = new MyInternalParser(data);
  while (parserState.more()) {
    cues.push(new shaka.text.Cue(...));
  }
  return cues;
};
```

All application-specific text-parsing plugins MUST to be updated.
v2.4 does not have backward compatibility on this!

The `Shaka.text.Cue` class contains the same information about a text cue as
the VTTCue class, plus extra information about text style.

For more information, see the {@link shakaExtern.TextParser.TimeContext},
{@link shaka.text.Cue} and {@link shakaExtern.TextParser} definitions in
the API docs.


#### Customizing subtitle display

Shaka v2 gave applications an opportunity to have a custom text parser, but
all the displaying was handled by the browser. Shaka v2.2 added the
possibility to have custom logic for displaying text. By default the
rendering will still be done by the {@linksource shaka.text.SimpleTextDisplayer}
class.

A custom text display factory can be specified by calling player.configure().

```js
player.configure({
  textDisplayFactory: customTextDisplayerClass
});
```

See {@linksource shakaExtern.TextDisplayer} for details.


#### Manifest parser plugin changes

Manifest parsers also have a new interface.  The old interface had a `start()`
method that took many parameters.

```js
// v2.0
/** @constructor */
function MyManifestParser() {}

/** @param {shakaExtern.ManifestConfiguration} config */
MyManifestParser.configure = function(config) {
  this.config_ = config;
};

/**
 * @param {string} uri
 * @param {!shaka.net.NetworkingEngine} networkingEngine
 * @param {function(shakaExtern.Period)} filterPeriod
 * @param {function(!shaka.util.Error)} onError
 * @param {function(!Event)} onEvent
 * @return {!Promise.<shakaExtern.Manifest>}
*/
MyManifestParser.prototype.start =
    function(networkingEngine, filterPeriod, onError, onEvent) {
  this.networkingEngine_ = networkingEngine;
  this.filterPeriod_ = filterPeriod;
  this.onError_ = onError;
  this.onEvent_ = onEvent;

  var type = shaka.net.NetworkingEngine.RequestType.MANIFEST;
  var request = shaka.net.NetworkingEngine.makeRequest(
      [uri], this.config_.retryParameters);
  return this.networkingEngine_.request(type, request).promise
      .then(function(response) {
        this.manifest_ = this.parseInternal_(response.data);
        this.updateInterval_ =
            setInterval(this.updateManifest_.bind(this), 5000);
        return this.manifest_;
      });
};

/** @return {!Promise} */
MyManifestParser.prototype.stop = function() {
  clearInterval(this.updateInterval_);
  return Promise.resolve();
};
```

In Shaka v2.1, the parameters to `start()`, which were all tied back to the
`Player` object, have been grouped into a one `PlayerInterface` parameter.
This will allow us to add features to the interface without breaking plugins.

```js
// v2.4
/**
 * @param {string} uri The URI of the manifest.
 * @param {shakaExtern.ManifestParser.PlayerInterface} playerInterface Contains
 *   the interface to the Player.
 * @return {!Promise.<shakaExtern.Manifest>}
 */
MyManifestParser.prototype.start = function(uri, playerInterface) {
  this.playerInterface_ = playerInterface;

  var type = shaka.net.NetworkingEngine.RequestType.MANIFEST;
  var request = shaka.net.NetworkingEngine.makeRequest(
      [uri], this.config_.retryParameters);
  return this.playerInterface_.networkingEngine.request(type, request).then(
      function(response) {
        this.manifest_ = this.parseInternal_(response.data);
        this.updateInterval_ =
            setInterval(this.updateManifest_.bind(this), 5000);
        return this.manifest_;
      });
};
```

Shaka v2.2 also added two new methods to the manifest parser interface:
`update()` and `onExpirationUpdated()`.

The `update()` method allows `StreamingEngine` to ask for an explicit manifest
update.  This is used, for example, to support `emsg` boxes in MP4 content,
which can be used by the stream to indicate that a manifest update is needed.

```js
// v2.4
MyManifestParser.prototype.update = function() {
  // Trigger an update now!
  this.updateManifest_();
};
```

The `onExpirationUpdated` method is optional.  It is used by `DrmEngine` to
inform the manifest parser that the expiration time of an EME session has
changed.  We use this internally in our offline support, so that we can keep
track of expiring licenses for stored content.

```js
// v2.4
MyManifestParser.prototype.onExpirationUpdated =
    function(sessionId, expiration) {
  var oldExpiration = this.database_.getExpiration(this.contentId_);
  expiration = Math.min(expiration, oldExpiration);
  this.database_.setExpiration(this.contentId_, expiration);
};
```

Shaka v2.4 changed some details of the `shaka.media.PresentationTimeline` API.
`ManifestParser` plugins that use these methods MUST be updated:

  - `setAvailabilityStart()` was renamed to `setUserSeekStart()`.
  - `notifySegments()` now takes a reference array and a boolean called
    `isFirstPeriod`, instead of a period start time and a reference array.

For more information, see the {@link shakaExtern.ManifestParser.PlayerInterface}
and {@link shakaExtern.ManifestParser} definitions in the API docs.


#### Retry after streaming failure

In v2.0, after a network error and all network retries were exhausted, streaming
would continue to retry those requests.  The only way to stop this process was
to `unload()` or `destroy()` the Player.

In v2.1.3, we introduced new retry behavior, and in v2.2, we introduced a new
configuration mechanism.  The default is as it was in v2.1.3 (retry on live, but
not VOD), and applications can now customize the behavior through a callback:

```js
player.configure({
  streaming: {
    failureCallback: function(error) {
      // Always retry, as in v2.0.0 - v2.1.2:
      player.retryStreaming();
    }
  }
});
```

The new `player.retryStreaming()` method can be used to retry after a failure.
You can base the decision on `player.isLive()`, `error.code`, or anything else.
Because you can call `retryStreaming()` at any time, you can also delay the
decision until you get feedback from the user, the browser is back online, etc.

A few more examples of possible failure callbacks:

```js
function neverRetryCallback(error) {}

function retryLiveOnFailureCallback(error) {
  if (player.isLive()) {
    player.retryStreaming();
  }
}

function retryOnSpecificHttpErrorsCallback(error) {
  if (error.code == shaka.util.Error.Code.BAD_HTTP_STATUS) {
    var statusCode = error.data[1];
    var retryCodes = [ 502, 503, 504, 520 ];
    if (retryCodes.indexOf(statusCode) >= 0) {
      player.retryStreaming();
    }
  }
}
```

If you choose to react to `error` events instead of the failure callback, you
can use `event.preventDefault()` to avoid the callback completely:

```js
player.addEventListener('error', function(event) {
  // Custom logic for error events
  if (player.isLive() &&
      event.error.code == shaka.util.Error.Code.BAD_HTTP_STATUS) {
    player.retryStreaming();
  }

  // Do not invoke the failure callback for this event
  event.preventDefault();
});
```


#### Offline storage API changes

In v2.0, the `remove()` method on `shaka.offline.Storage` took an instance of
`StoredContent` as an argument.  Now, in v2.4, it takes the `offlineUri` field
from `StoredContent` as an argument.

All applications which use offline storage MUST update to the new API.
The old argument was deprecated in v2.3 and has been removed in v2.4.

```js
// v2.0:
storage.list().then(function(storedContentList) {
  var someContent = storedContentList[someIndex];
  storage.remove(someContent);
});

// v2.4:
storage.list().then(function(storedContentList) {
  var someContent = storedContentList[someIndex];
  storage.remove(someContent.offlineUri);
});
```


#### NetworkingEngine API changes

In v2.0, the `request()` method on `shaka.net.NetworkingEngine` returned a
Promise.  Now, in v2.4, it returns an instance of
`shakaExtern.IAbortableOperation`, which contains a Promise.

All applications which make application-level requests via `NetworkingEngine`
SHOULD update to the new API.  Support for the old API will be removed in v2.5.

```js
// v2.0:
player.getNetworkingEngine().request(type, request).then((response) => {
  // ...
});

// v2.4:
let operation = player.getNetworkingEngine().request(type, request);
// Use operation.promise to get the response.
operation.promise.then((response) => {
  // ...
});
// The operation can also be aborted on some condition.
onSomeOtherCondition(() => {
  operation.abort();
});
```

Backward compatibility is provided in the v2.4 releases by adding `.then` and
`.catch` methods to the return value from `request()`.


#### Network scheme plugin API changes

In v2.4, we changed the API for network scheme plugins.

These plugins now return an instance of `shakaExtern.IAbortableOperation`.
We suggest using the utility `shaka.util.AbortableOperation` for convenience.

We also introduced an additional parameter for network scheme plugins to
identify the request type.

All applications which have application-level network scheme plugins SHOULD
update to the new API.  Support for the old API will be removed in v2.5.

```js
// v2.0
function fooPlugin(uri, request) {
  return new Promise((resolve, reject) => {
    // ...
  });
}
shaka.net.NetworkingEngine.registerScheme('foo', fooPlugin);

// v2.4
function fooPlugin(uri, request, requestType) {
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
shaka.net.NetworkingEngine.registerScheme('foo', fooPlugin);
```
