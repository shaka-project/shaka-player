# Shaka Upgrade Guide, v2.0 => v2.1

This is a detailed guide for upgrading from Shaka Player v2.0 to v2.1.
Feel free to skim or to search for the class and method names you are using in
your application.


#### What's New in v2.1?

Shaka v2.1 introduces several improvements over v2.0, including:
  - Basic HLS support
  - DASH trick mode support
  - Support for jumping gaps in the timeline
  - Asynchronous network filters
  - Additional stats and events from Player
  - Indication of critical errors vs recoverable errors


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

In Shaka v2.1, audio and video tracks are combined into a variant track.  It is
not possible to select individual audio/video streams, you can only select a
specific variant as specified by the manifest.  This was necessary for us to
support HLS.  Text tracks are independent of variant tracks.

You can get the currently available tracks using `getVariantTracks()` and
`getTextTracks()`.  To switch tracks, use `selectVariantTrack()` and
`selectTextTrack()`.

```js
// v2.1:
var variantTracks = player.getVariantTracks();
var i = /* choose an index somehow */;
player.selectVariantTrack(variantTracks[i]);
```

The v2.0 methods `getTracks()` and `selectTrack()` are still present in v2.1,
but they are deprecated and will be removed in v2.2.  However, they are not
completely backward compatible because of the `type` field.  If you are looking
for `'video'` or `'audio'` in the `type` field, your application will need to
be updated to handle `'variant'` instead.

See also the {@link shakaExtern.Track} structure which is used for all track
types (variant and text).


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

In Shaka v2.1, language selection during playback is explicit and separate from
the configuration.  Configuration only affects the next call to `load()`, and
will not change languages during playback.

To list available languages, we provide the `getAudioLanguages()` and
`getTextLanguages()` methods.  To change languages during playback, use
`selectAudioLanguage()` and `selectTextLanguage()`.

```js
// v2.1:
player.configure({ preferredAudioLanguage: 'fr-CA' });
player.load(manifestUri);  // Canadian French preferred for initial playback

player.configure({ preferredAudioLanguage: 'el' });  // Greek, does nothing now
player.selectAudioLanguage('fa');  // switch to Farsi right now

player.load(secondManifestUri);  // Greek preferred for initial playback
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


#### Plugin interface changes

If you have taken advantage of Shaka v2's plugin APIs, you may need to update
your plugins to the new interfaces.

In v2.1, the v2.0 interfaces for text and manifest parsers are still supported,
but are deprecated.  Support will be removed in v2.2.


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
    cues.push(parserState.nextCueOrThrow(periodOffset));
  }
  return cues;
}
```

In Shaka v2.1, the text parser interface is now a constructor.  The interface
now has explicit methods for init segments and media segments, and parameters
related to time offsets have been grouped together into one `TimeContext`
parameter.

```js
// v2.1
/** @constructor */
function MyTextParser() {}

/** @param {!ArrayBuffer} data */
MyTextParser.prototype.parseInit = function(data) {
  checkInitSegmentOrThrow(data);
};

/**
 * @param {!ArrayBuffer} data
 * @param {shakaExtern.TextParser.TimeContext} timeContext
 * @return {!Array.<!TextTrackCue>}
 */
MyTextParser.prototype.parseMedia = function(data, timeContext) {
  var cues = [];
  var parserState = new MyInternalParser(data);
  while (parserState.more()) {
    cues.push(parserState.nextCueOrThrow(timeContext.periodStart));
  }
  return cues;
};
```

For more information, see the {@link shakaExtern.TextParser.TimeContext} and
{@link shakaExtern.TextParser} definitions in the API docs.


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
  return this.networkingEngine_.request(type, request).then(function(response) {
    this.manifest_ = this.parseInternal_(response.data);
    this.updateInterval_ = setInterval(this.updateManifest_.bind(this), 5000);
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
// v2.1
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
        this.updateInterval_ = setInterval(this.updateManifest_.bind(this), 5000);
        return this.manifest_;
      });
};
```

Shaka v2.1 also adds two new methods to the manifest parser interface:
`update()` and `onExpirationUpdated()`.

The `update()` method allows `StreamingEngine` to ask for an explicit manifest
update.  This is used, for example, to support `emsg` boxes in MP4 content,
which can be used by the stream to indicate that a manifest update is needed.

```js
// v2.1
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
// v2.1
MyManifestParser.prototype.onExpirationUpdated =
    function(sessionId, expiration) {
  var oldExpiration = this.database_.getExpiration(this.contentId_);
  expiration = Math.min(expiration, oldExpiration);
  this.database_.setExpiration(this.contentId_, expiration);
};
```

For more information, see the {@link shakaExtern.ManifestParser.PlayerInterface}
and {@link shakaExtern.ManifestParser} definitions in the API docs.
