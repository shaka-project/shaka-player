# Shaka Upgrade Guide, v2.1 => v2.2

This is a detailed guide for upgrading from Shaka Player v2.1 to v2.2.
Feel free to skim or to search for the class and method names you are using in
your application.


#### What's New in v2.2?

Shaka v2.2 introduces several improvements over v2.1, including:
  - Allowing applications to render their own text tracks
  - Allowing applications to define their own retry logic after streaming
    failures
  - Making the default ABR manager more configurable
  - Adding channel count and bandwidth info to variant tracks
  - Xlink support in DASH
  - Stricter runtime type-checking of EME cert configuration
  - New option for offline protected content without persistent licensing


#### New "text" namespace

In Shaka v2.1, `TextEngine` was part of the `shaka.media` namespace.  In v2.2,
this was moved to the new `shaka.text` namespace.  Text-parsing plugins should
now be registered with {@link shaka.text.TextEngine.registerParser}.


#### Customizing subtitle display

Shaka v2 gave applications an opportunity to have a custom text parser, but
all the displaying was handled by the browser. Shaka v2.2 adds the
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


#### Text parser API changes

The text-parsing plugin API has changed. Plugins now return `shaka.text.Cue`
objects instead of VTTCue or TextTrackCue objects like in v2.1.

```js
// v2.1
/**
 * @param {!ArrayBuffer} data
 * @param {shakaExtern.TextParser.TimeContext} timeContext
 * @return {!Array.<!TextTrackCue>}
 */
MyTextParser.prototype.parseMedia = function(data, timeContext) {
  var cues = [];
  var parserState = new MyInternalParser(data);
  while (parserState.more()) {
    cues.push(new VTTCue(...));
  }
  return cues;
};

// v2.2
/**
 * @param {!ArrayBuffer} data
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

All application-specific text-parsing plugins MUST to be updated,
v2.2 does not have backward compatibility on this!
Shaka.text.Cue class contains the same information about a text cue as
VTTCue class plus extra information about text style.

See {@link shaka.text.Cue} for details.


#### Setting and configuring ABR manager

In Shaka v2.1, a custom ABR manager could be set through:

```js
player.configure({
  abr.manager: customAbrManager
});
```

In v2.2, it's done through:

```js
player.configure({
  abrFactory: customAbrManager
});
```

The API for AbrManager also changed.

In v2.1, default bandwidth estimate and restrictions were set through
`setDefaultEstimate()` and `setRestrictions()` methods.

In v2.2, they are set through `configure()` method which accepts a
{@link shakaExtern.AbrConfiguration} structure. The new method is more general,
and allows for the configuration of bandwidth upgrade and downgrade targets
as well.

```js
// v2.1:
abrManager.setDefaultEstimate(defaultBandwidthEstimate);
abrManager.setRestrictions(restrictions);

// v2.2:
abrManager.configure(abrConfigurations);
```

In v2.1, AbrManager had a `chooseStreams()` method for the player to prompt for
a stream selection, and a `switch()` callback to send unsolicited changes from
AbrManager to player.  In v2.2, `chooseStreams()` has been replaced with
`chooseVariant()`, and the `switch()` callback takes a variant instead of a map
of streams.

```js
// v2.1:
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

// v2.2:
var variant = abrManager.chooseVariant();
console.log(variant, variant.video, variant.audio);

MyAbrManager.prototype.makeDecision_ = function() {
  var variant = this.computeBestVariant_(this.bandwidth_);
  this.switch_(variant);
};
```

In v2.2, the v2.1 interfaces are still supported, but are deprecated.  Support
will be removed in v2.3.


#### Switch history changes

In v2.1 `shakaExtern.Stats` had a member `shakaExtern.StreamChoice` structure
named switchHistory that had a type field containing the changed stream's
type ('audio', 'video' or 'text').

In 2.2 shakaExtern.StreamChoice was renamed shakaExtern.TrackChoice to
reflect that it contains information about the changed track rather than
stream. The type field now represents the changed track's type:
'variant' or 'text'. It also now contains track's bandwidth. Similarly, the
id field is now a track id instead of stream id.

```js
// v2.1:
/*
 * @typedef {{
 *   timestamp: number,
 *   id: number, // stream id
 *    type: string, // 'audio'/'video'/'text'
 *    fromAdaptation: boolean
 * }}
 */
shakaExtern.StreamChoice;

// v2.2:
/*
 * @typedef {{
 *   timestamp: number,
 *   id: number, // track id
 *    type: string, // 'variant'/'text'
 *    fromAdaptation: boolean,
 *    bandwidth: ?number
 * }}
 */
shakaExtern.TrackChoice;
```


#### Retry after streaming failure

In v2.0, after a network error and all network retries were exhausted, streaming
would continue to retry those requests.  The only way to stop this process was
to `unload()` or `destroy()` the Player.

This was changed in v2.1.3, when the behavior became infinite retries for live
and zero retries for VOD.  The infinite retries for live could be disabled like
so:

```js
player.configure({
  streaming: {
    infiniteRetriesForLiveStreams: false
  }
});
```

There was no way to retry for failures in VOD streams.

In v2.2, we introduced new retry behavior.  The default is as it was in v2.1.3,
but applications can now customize the behavior through a callback:

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
    if (retryCodes.indexOf(statusCode >= 0)) {
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
