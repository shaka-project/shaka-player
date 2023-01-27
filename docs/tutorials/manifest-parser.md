# Manifest Parser Plugins

## Overview

This tutorial shows how to make a basic manifest parser plugin.  This allows an
app to define a custom manifest format and still use Shaka Player to handle the
streaming and track switching.

The function of a manifest parser is to take a URL that was passed to `load()`
and give us back a manifest object.  The parser should fetch the URL, parse the
manifest, and convert it to our format.

```js
function MyManifestParser() {
  this.curId_ = 0;
  this.config_ = null;
}

MyManifestParser.prototype.configure = function(config) {
  this.config_ = config;
};

MyManifestParser.prototype.start = async function(uri, playerInterface) {
  const type = shaka.net.NetworkingEngine.RequestType.MANIFEST;
  const request = {
    uris: [uri],
    method: 'GET',
    retryParameters: this.config_.retryParameters
  };
  const response =
      await playerInterface.networkingEngine.request(type, request).promise;
  return this.loadManifest_(response.data);
};

MyManifestParser.prototype.stop = function() {
  return Promise.resolve();
};


shaka.media.ManifestParser.registerParserByExtension('json', MyManifestParser);
shaka.media.ManifestParser.registerParserByMime(
    'application/json', MyManifestParser);
```

First, this defines a constructor called `MyManifestParser`.  This is called by
the `Player` to create new parser instances.  A new instance is created for
*each* load.  This should setup any initial state that is needed.

#### configure

This method is called right after creating the object and when the configuration
changes.  This is passed a {@link shaka.extern.ManifestConfiguration} object
from the Player.

#### start

This method is called to load the manifest.  This is called with a string URI
that is passed to `load()` and a
{@link shaka.extern.ManifestParser.PlayerInterface} object.  The interface
object contains a number of fields that are used to interact with the Player.
This includes the `NetworkingEngine` instance to make network requests.  This
also includes callback methods that allow the parser to raise Player events and
filter the variants.  This method should return a Promise that will resolve with
the parsed manifest.

#### stop

This method is called as part of `player.unload()`.  This method should stop any
background timers and free any state.  It is invalid to use the config object or
anything from the Player interface given to `start` after this is called.  We
don't reuse parser instances, so we will *not* call `start()` again after this
is called.  This should return a Promise that resolves when this object is
destroyed.

#### registration

At the end of the file, you should register the parser with the library.  This
will allow it to be used by the `Player`.  There are two methods:
`registerParserByExtension` and `registerParserByMime`.  They both add parsers
to a registry of manifest parsers.  When the Player gets a URI, it will
determine which parser to use.  It will first try based on the file extension,
then it will make a HEAD request to the URI to get back a MIME type.

If you wish to unregister a parser, you can do so with
{@link shaka.media.ManifestParser.unregisterParserByMime}.  Parsers registered
by extension cannot be unregistered at this time.


## Variants and Streams

The audio and video content of our Manifest structure is stored, on the highest
level, in an array of Variants.  A Variant represents an audio+video pair.
The array holds all possible pairs the Player can choose from.
While playing, we will give these to the app (through `getVariantTracks`) and
will switch between them (if ABR is enabled).

A stream represents a collection of media data segments.  The segments are all
the same type (audio/video/text) and all from the same version of the media
(e.g. English vs Spanish or 720p vs 1080p). A Stream object holds metadata that
describes what the stream contains as well as how to get the segments.  Only one
stream of each type will be playing at once.

Multiple Variants can hold the same streams.  For example, both the 720p and the
1080p variant can refer to the same audio stream.  In this case, both Variant
objects must refer to the **same object**.  It is not enough to use the same
stream ID; it must be the same object.


## Periods

While some manifest formats, such as MPEG-DASH, have the concept of a period,
our internal manifest structure (as of Shaka Player v3.0) does not organize
streams based on periods.  If you are writing a manifest parser for such a
format, you will need to generate Variants yourself, combining together periods
and their component streams as needed.  The resulting
{@link shaka.extern.Stream} objects should each span the entire presentation.

All media times in the manifest are relative to the presentation, *not* the
Period.  This means that you must account for period start times in your segment
references.  (This changed in Shaka Player v3.0.)


## PresentationTimeline

{@link shaka.media.PresentationTimeline}

The segment index doesn't need to handle segment availability for live
content.  All the segment index needs to do is return the segment references.
The `presentationTimeline` in the manifest will be used to handle availability.
All times in the timeline are in seconds; 0 represents when the live stream
started.

An availability window defines a moving time window in which a segment can be
downloaded.  This is defined by a segment availability duration that indicates
the number of seconds that a segment will remain available.  So if the
availability duration is 60 seconds, then the last 60 seconds of content is
available.

The same timeline class handles on-demand content, too.  The availability window
starts at 0 and ends at the duration of the media.


## Media Segments

A Stream contains a number of segment references contained in a segment index.
A segment reference contains important metadata about the segment: the start
and end times, the URL, and optionally a byte range into that URL.  A segment
reference is created using the {@link shaka.media.SegmentReference} constructor.

Rather than storing the references in a raw array, the manifest parser stores
them in a {@link shaka.media.SegmentIndex} object.  This object is allowed to
be null before createSegmentIndex() is called, and thus defer the translation of
abstract segment descriptions (such as DASH's `SegmentTemplate`) into concrete
ones until necessary.

Media segment times are all in terms of the presentation timeline.  So if the
content was originally multi-period, the period start time must be accounted for
in the reference's `timestampOffset` field.

First we ask for the index that corresponds with a start time.  Then on update,
we increment the index and ask for segments in order. The value of the index
doesn't matter, but indices must be sequential integers.

#### createSegmentIndex():Promise

This is called first before any other method.  This allows an index to be
fetched over the network, if needed.  This method should return a Promise that
will resolve when the segment index is ready.  This is only ever called once.

#### segmentIndex

This is *not* a function, but a {@link shaka.media.SegmentIndex} tracking all
available segments.


## shaka.media.SegmentIndex

To help in handling segment references, there is a
{@link shaka.media.SegmentIndex} type.  This is given an array of references.
It handles merging new segments, and expanding the list of segments for live
streams.

```js
const references = refs.map(function(r) {
  // Should return an array of possible URI choices; this is used for failover
  // in the event of network error.  This is a function to defer calculations.
  const getUris = function() { return [r.uri]; };

  return new shaka.media.SegmentReference(
      r.start, r.end, getUris,
      /* startByte */ 0,
      /* endByte */ null,
      initSegmentReference,
      /* timestampOffset */ 0,
      /* appendWindowStart */ 0,
      /* appendWindowEnd */ Infinity);
});

const index = new shaka.media.SegmentIndex(references);
```

To merge updates and remove old references to reduce the memory footprint,
simply create a new array of segments and call `mergeAndEvict`.  Any
existing segments will be updated, new segments will be added, and old
unavailable references will be removed.

To expand the list of references on a timer, as is done for DASH's
SegmentTemplate, call `index.updateEvery` with a callback that evicts old
references and returns an array of new references.

```js
index.updateEvery(updateIntervalSeconds, () => {
  // Evict old references
  index.evict(windowStartTime);

  // Generate new references to append to the end of the index
  const references = [];
  // ...
  return references;
});
```

If the callback returns null, the update timer for this index will be stopped.
(NOTE: This method was introduced in v3.0.0, but the interpretation of the
callback's return changed in v3.0.8 to fix a bug in our DASH SegmentTemplate
support.  We apologize for any inconvenience.)


## Manifest Updates

In order to support Live content, the manifest may need to be updated.  In the
`start()` method, the manifest parser should start its own timers (e.g.
`setInterval`) to update the manifest.  Then it should re-parse the manifest
periodically.  To add new segments to the streams, simply add them to the
segment index.  Because the original manifest object is modified in-place,
adding them to the index will allow the Player to use them.

After adding new content, you should call the `filter` method on the player
interface.  This removes any streams that were added that are incompatible with
the platform.  Keep in mind that this is an asynchronous method, and thus you
will need to use it in conjunction with `.then()` or `await`.
You should also call the `makeTextStreamsForClosedCaptions` method on the
player interface, which is required for embedded captions (for example, CEA
608) to work; it makes dummy text streams to represent these tracks.


## Full Manifest Parser Example

```js
MyManifestParser.prototype.loadManifest_ = function(data) {
  // |data| is the response data from load(); but in this example, we ignore it.

  // The arguments are only used for live.
  const timeline = new shaka.media.PresentationTimeline(null, 0);
  timeline.setDuration(3600);  // seconds

  return {
    presentationTimeline: timeline,
    minBufferTime: 5,  // seconds
    offlineSessionIds: [],
    variants: [
      this.loadVariant_(true, true),
      this.loadVariant_(true, false)
    ],
    textStreams: [
      this.loadStream_('text'),
      this.loadStream_('text')
    ]
  };
};

MyManifestParser.prototype.loadVariant_ = function(hasVideo, hasAudio) {
  console.assert(hasVideo || hasAudio);

  return {
    id:        this.curId_++,  // globally unique ID
    language:  'en',
    primary:   false,
    audio:     hasAudio ? this.loadStream_('audio') : null,
    video:     hasVideo ? this.loadStream_('video') : null,
    bandwidth: 8000,  // bits/sec, audio+video combined
    allowedByApplication: true,  // always initially true
    allowedByKeySystem:   true   // always initially true
  };
};

MyManifestParser.prototype.loadStream_ = function(type) {
  const getUris = function() { return ['https://example.com/init']; };
  const initSegmentReference = new shaka.media.InitSegmentReference(getUris,
      /* startByte= */ 0, /* endByte= */ null);

  const index = new shaka.media.SegmentIndex([
    // Times are in seconds, relative to the presentation
    this.loadReference_(0, 0, 10, initSegmentReference),
    this.loadReference_(1, 10, 20, initSegmentReference),
    this.loadReference_(2, 20, 30, initSegmentReference),
  ]);

  const id = this.curId_++;
  return {
    id: id,  // globally unique ID
    originalId: id, // original ID from manifest, if any
    createSegmentIndex:     function() { return Promise.resolve(); },
    segmentIndex:           index,
    mimeType: type == 'video' ?
        'video/webm' : (type == 'audio' ? 'audio/webm' : 'text/vtt'),
    codecs:    type == 'video' ? 'vp9' : (type == 'audio' ? 'vorbis' : ''),
    frameRate: type == 'video' ? 24 : undefined,
    pixelAspectRatio: type == 'video' ? 4 / 3 : undefined,
    bandwidth: 4000,  // bits/sec
    width:     type == 'video' ? 640 : undefined,
    height:    type == 'video' ? 480 : undefined,
    kind:      type == 'text' ? 'subtitles' : undefined,
    channelsCount: type == 'audio' ? 2 : undefined,
    encrypted: false,
    drmInfos:  [],
    keyIds:    new Set(),
    language:  'en',
    label:     'my_stream',
    type:      type,
    primary:   false,
    trickModeVideo: null,
    emsgSchemeIdUris: null,
    roles:     []
    channelsCount: type == 'audio' ? 6 : null,
    audioSamplingRate: type == 'audio' ? 44100 : null,
    closedCaptions: new Map(),
  };
};

MyManifestParser.prototype.loadReference_ =
    function(position, start, end, initSegmentReference) {
  const getUris = function() { return ['https://example.com/ref_' + position]; };
  return new shaka.media.SegmentReference(
      start, end, getUris,
      /* startByte */ 0,
      /* endByte */ null,
      initSegmentReference,
      /* timestampOffset */ 0,
      /* appendWindowStart */ 0,
      /* appendWindowEnd */ Infinity);
};
```


## Encrypted Content

If your content is encrypted, there are a few changes to the manifest you need
to do.  First, for each Stream that contains encrypted content, you need to set
`stream.encrypted` to true and put the key IDs that the stream is encrypted with
in the `stream.keyIds` set.  Filling out the `keyIds` is technically optional,
but it allows the player to choose streams more intelligently based on which
keys are available.  If `keyIds` is not filled out, missing keys may cause
playback to stall.

You must also set `stream.drmInfos` to an array of {@link shaka.extern.DrmInfo}
objects.  All the fields (except the key-system name) can be set to the default
and will be replaced by settings from the Player configuration.  If the
`drmInfos` array is empty, the content is expected to be clear.

If you set `drmInfo.initData` to a non-empty array, we will use that to
initialize EME.  We will override any encryption info in the media (e.g.
`pssh` boxes in MP4).  If you don't set this field (and it isn't set in the
app config), then we will initialize EME based on the encryption info in the
media.
