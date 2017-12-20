# Shaka Upgrade Guide, v2.2 => v2.3

This is a detailed guide for upgrading from Shaka Player v2.2 to v2.3.
Feel free to skim or to search for the class and method names you are using in
your application.


#### What's New in v2.3?

Shaka v2.3 introduces several improvements over v2.2, including:
  - Support for HLS live streams
  - Support for HLS VOD streams that do not start at t=0
  - MPEG-2 TS content can be transmuxed to MP4 for playback on all browsers
  - Captions are not streamed until they are shown
  - Use NetworkInformation API to get initial bandwidth estimate
  - The demo app is now a Progressive Web App (PWA) and can be used offline


#### HLS start time configuration

For VOD HLS content which does not start at t=0, v2.2 had a configuration called
`manifest.hls.defaultTimeOffset` which applications could use to inform us of
the correct start time for content.

This has been removed in v2.3.  The start time of HLS content can now be
automatically extracted from the segments themselves.  No configuration is
necessary.


#### Text parser API changes

The text-parsing plugin API has changed. Plugins now take a `Uint8Array` instead
of an `ArrayBuffer` like in v2.2. This allowed us to optimize and prevent buffer
copies.

```js
// v2.2
/**
 * @param {!ArrayBuffer} data
 * @param {shakaExtern.TextParser.TimeContext} timeContext
 * @return {!Array.<!shaka.text.Cue>}
 */
MyTextParser.prototype.parseMedia = function(data, timeContext) {};

// v2.3
/**
 * @param {!Uint8Array} data
 * @param {shakaExtern.TextParser.TimeContext} timeContext
 * @return {!Array.<!shaka.text.Cue>}
 */
MyTextParser.prototype.parseMedia = function(data, timeContext) {};
```

All application-specific text-parsing plugins MUST to be updated.
v2.3 does not have backward compatibility for this!

See {@link shakaExtern.TextParser.prototype.parseInit} and
{@link shakaExtern.TextParser.prototype.parseMedia} for details.


#### Offline storage API changes

In v2.2, the `remove()` method on `shaka.offline.Storage` took an instance of
`StoredContent` as an argument.  Now, in v2.3, it takes a the `offlineUri` field
from `StoredContent` as an argument.

All applications which use offline storage SHOULD update to the new API.
Support for the old argument will be removed in v2.4.

```js
// v2.2:
storage.list().then(function(storedContentList) {
  var someContent = storedContentList[someIndex];
  storage.remove(someContent);
});

// v2.3:
storage.list().then(function(storedContentList) {
  var someContent = storedContentList[someIndex];
  storage.remove(someContent.offlineUri);
});
```


#### Retry after streaming failure

In v2.1.3, we introduced a new config called
`streaming.infiniteRetriesForLiveStreams` to control retry behavior for live
streams.  In v2.2, we added a more flexible callback mechanism to specify retry
behavior for all kinds of streams.

```js
// v2.1
player.configure({
  streaming: {
    infiniteRetriesForLiveStreams: true  // the default
  }
});

// v2.3
player.configure({
  streaming: {
    failureCallback: function(error) {
      // Always retry live streams:
      if (player.isLive()) player.retryStreaming();
    }
  }
});


// v2.1
player.configure({
  streaming: {
    infiniteRetriesForLiveStreams: false  // do not retry live
  }
});

// v2.3
player.configure({
  streaming: {
    failureCallback: function(error) {
      // Do nothing, and we will stop trying to stream the content.
    }
  }
});
```

The `streaming.infiniteRetriesForLiveStreams` config was deprecated in v2.2 and
removed in v2.3.


The `player.retryStreaming()` method can be used to retry after a failure.
You can base the decision on `player.isLive()`, `error.code`, or anything else.
Because you can call `retryStreaming()` at any time, you can also delay the
decision until you get feedback from the user, the browser is back online, etc.

A few more examples of possible failure callbacks:

```js
function neverRetryCallback(error) {}

function alwaysRetryCallback(error) {
  player.retryStreaming();
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


#### Language and role selection

In addition to the language methods introduced in v2.1, v2.3 adds additional
methods for dealing with roles: `getAudioLanguagesAndRoles()` and
`getTextLanguagesAndRoles()`.  These return language/role combinations in an
object.  You can specify a role in an optional second argument to the language
selection methods.

```js
// v2.3:
var languagesAndRoles = player.getAudioLanguagesAndRoles();

for (var i = 0; i < languagesAndRoles.length; ++i) {
  var combo = languagesAndRoles[i];
  if (someSelector(combo)) {
    player.selectAudioLanguage(combo.language, combo.role);
    break;
  }
}
```
