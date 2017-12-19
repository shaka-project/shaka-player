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
