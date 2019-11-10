# Shaka Player v2 Offline Design

last update: 2016-05-24

by: [joeyparrish@google.com](mailto:joeyparrish@google.com)


## Overview

Offline storage in Shaka Player v2 will be represented by an instance of
`shaka.offline.Storage`.  The API for offline storage will not be on
`shaka.Player` so that offline capabilities can be trivially omitted from the
build.  Internal classes used to implement offline storage/playback will live in
the `shaka.offline` namespace.  Everything in the `shaka.offline` namespace will
be listed in `build/types/offline` for quick exclusion of the feature.

`Storage` will store streams for offline playback, allow selection of which
tracks to store, provide progress information while storing streams, allow the
listing of stored content, and allow the removal of stored content.  To reduce
the number of parameters in the `store()` method, we will offer a `configure()`
interface to set callbacks.  We will also provide a default track-selection
callback to make it easier to get started.

Backward compatibility with stored content from v1 is an explicit non-goal.  If
it turns out that there is a need in the community to migrate stored content
from v1 to v2, a simple migration utility can be written later.


#### `Storage` API sketch

```js
new shaka.offline.Storage(player)

shaka.offline.Storage.support => boolean

// NOTE: Not connected to player.configure().
shaka.offline.Storage.prototype.configure({
  trackSelectionCallback: function(allTracks) {
    // The default callback selects:
    //   1. highest bandwidth video track with height <= 480,
    //   2. middle bandwidth audio track with best audio pref language match,
    //   3. all text tracks with any text pref language match.
    // Return an array of selected Tracks.
  },
  progressCallback: function(storedContent, percentComplete) {}
});

// Store content and metadata.
shaka.offline.Storage.prototype.store(manifestUri, appMetadata, manifestParser) => Promise.<StoredContent>

// Remove stored content and metadata.
shaka.offline.Storage.prototype.remove(storedContent) => Promise

// List stored content.
shaka.offline.Storage.prototype.list() => Promise.<Array.<StoredContent>>

StoredContent:
  offlineUri: string  // at which the stored content can be accessed
  originalManifestUri: string  // the original manifest URI of the content we stored
  duration: number  // length of the stored content in seconds
  size: number  // size of the stored content in bytes
  tracks: !Array.<shaka.extern.Track>  // the tracks we stored
  appMetadata: object  // arbitrary format, provided by the application to store()
```


#### Implementation

Like v1, v2 will use IndexedDB for storage.

In v1, applications were required to persist the list of stored content and any
app metadata in window.localStorage.  In v2, we will provide an API to list
stored content and we will store app metadata along-side the content.

In v1, progress was inaccurate.  It was calculated in terms of segments, even
though segment sizes are very different between audio and video.  In v2,
progress can be calculated in terms of bytes, which will provide a more accurate
percentage.  If the index does not have byte ranges for segments, presumed
segment sizes can be calculated based on average bitrate and duration.  This
will be accurate enough on average to provide a smooth progress bar.  (Smooth
relative to v1.)  Actual bytes transferred will be tracked in the
`StoredContent` structure.

In v1, segments were combined into larger chunks to reduce the overhead of
reading from the disk.  This was premature optimization, as we had no data to
suggest this was necessary.  In v2, all segments will be stored in their
original form.

`store()` will transfer segment types (audio, video) in parallel, since some
CDNs limit download rate based on the bandwidth requirements of the stream.

`Storage` will have to load a manifest using the correct parser, filter the
tracks as `Player` does, and invoke a callback to select streams.  This should
involve a factoring of the load and filtering logic of `Player`, perhaps into
`ManifestParser` or `PlayerUtil`.  These methods will not be exported.  A
`Player` instance is required to instantiate a `Storage`, and `Storage` will get
manifest configuration from that instance.

`Storage` will also need to use `DrmEngine` directly to persist licenses and get
the session IDs.  The session IDs will be stored in the database as part of the
content.  Removing a piece of content should result in any associated persistent
sessions being released.

A scheme plugin will register itself with `NetworkingEngine` to implement the
`offline` scheme.  Manifest URIs will be of the form `offline:123`, where `123`
is an automatically-assigned ID representing the stored content.  Segment URIs
will be of the form `offline:123/7/99`, where `7` is an auto-ID for the track
and `99` is an auto-ID for the segment.

The scheme handler will handle `HEAD` requests and return a `Content-Type`
header with the value `application/x-offline-manifest`.  This type will be
registered with `ManifestParser` in order to "parse the manifest" (load it from
the database).

To include offline support info in `Player.probeSupport()` but still make it
possible to exclude offline from the build, `Player.probeSupport()` will now
have a plugin interface. `Storage` will register its `support()` method with
`Player` under the key `offline`.  Overall library support is not contingent on
the `basic` support of any of the plugins, including offline.  Support plugins
are synchronous, for simplicity.

It's okay if the app selects multiple streams of a type.  For text, this may be
necessary, for example, to store subtitles for all languages.  For audio it may
be necessary as well, for similar reasons.  For video it makes little sense, but
we won't restrict it.  Apps can make whatever decision they want about tracks to
store, but we should document best practice.

We could also issue a warning if multiple tracks of same type, kind, and
language are selected, since offline adaptation is currently an uncommon
scenario and may indicate a mistake on the part of the app developer.  For
example, this would trigger on two video with different bitrate or size, or two
audio of same language but different bitrate, or two text of same language and
kind.

`Storage` will need good unit and integration tests.  Integration tests should
store a stream created by `StreamGenerator` and verify that the `StoredContent`
structure is correct.  A test should also load the stored data and verify that
it matches the generated segments.

We should use a subset of IndexedDB supported by IE/Edge.  Note the "partial
support" link on [caniuse].  Since the unsupported features seem to be about
key-based arrays and compound indexes, we should be able to easily avoid those.
Integration tests should help ensure that we are doing this correctly.

Also note [caniuse]'s mention of bugs in Safari's IndexedDB implementation,
detailed in [this blog post].  It is not clear yet if the Safari bugs are on iOS
only or also on desktop.  We may be forced to blacklist offline support as we
did with Safari 8 in `MediaSourceEngine.support()`.  If the bugs have been fixed
in Safari 9 or don't affect desktop, we should be fine.  If the bugs do affect
Safari 9 desktop, we could consider working around them.  The workaround seems
to be to avoid autoincrement and to constructing string IDs for each object
which are unique across all object stores.

[caniuse]: http://caniuse.com/#feat=indexeddb
[this blog post]: https://www.raymondcamden.com/2014/09/25/IndexedDB-on-iOS-8-Broken-Bad/


#### Error conditions

Errors during `store()`:
  - No IndexedDB support
  - No persistent license support
  - Out of storage space
  - Can't store a live stream
  - Any error that could occur during player.load()

Errors while loading content:
  - Content not found
  - Persistent license cannot be loaded (may have been cleared by browser)
  - Any error that could occur during player.load()
