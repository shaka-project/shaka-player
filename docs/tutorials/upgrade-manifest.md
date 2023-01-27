# Shaka Player Manifest Upgrade Guide (v3.0)

v3.0 introduced many changes to the `shaka.extern.Manifest` structure.
This is a detailed guide for upgrading `ManifestParser` plugins or applications
using `Player.getManifest()` to extract information about content.  Any
application with a custom `ManifestParser` or which uses `Player.getManifest()`
MUST be upgraded for compatibility with v3.0.


#### Registration

In addition to registering new parsers or overriding existing ones with
{@link shaka.media.ManifestParser.registerParserByMime}, you can now also
unregister them with {@link shaka.media.ManifestParser.unregisterParserByMime}.


#### Manifest and Period-flattening

The {@link shaka.extern.Manifest} structure has changed.  The concept of
"Periods", based closely on DASH, has been removed.  Many individual parts of
the manifest structure have changed to make this possible.  In this section, we
will give a high-level view of the changes.  In the sections below, you will
find details on the changes to the various parts of the `Manifest` structure and
the `ManifestParser` plugin interfaces.

If you have a custom `ManifestParser` plugin that parses multi-Period DASH
content, you will need to consider how `<Representation>`s connect across
`<Period>`s.  Each {@link shaka.extern.Stream} now comprises the entire
presentation, and {@link shaka.media.SegmentReference} timestamps are no longer
Period-relative.

If you have a custom `ManifestParser` plugin that parses other formats, or if
your application reads the `Manifest` structure, you will just need to move a
few fields and make some relatively minor API updates as detailed below.

In v2.5, `Manifest` objects contained `Period`s, and each `Period` contained
fields named `variants` and `textStreams`.  These fields are now part of the
top-level `Manifest` structure, and the `Stream` objects that make them up now
span all DASH Periods.  `ManifestParser` plugins MUST be updated to move these
fields, and applications which read the `Manifest` object MUST be updated to
look for them in the new location.


#### Filtering

The {@link shaka.extern.ManifestParser.PlayerInterface} structure has changed.
Instead of `filterNewPeriod` and `filterAllPeriods`, there is now a single
callback: {@link shaka.extern.ManifestParser.PlayerInterface#filter}.  This
should be invoked any time new text streams or variants are added to the
manifest.  `ManifestParser` plugins MUST be updated to use the new callback.
Keep in mind that the new `filter` method is asynchronous, and thus it should
probably be used in conjunction with `.then()` or `await`.

```js
// v2.5:
// Call this after the initial parsing
this.playerInterface_.filterAllPeriods(periods);

// Call this after any new periods are added
this.playerInterface_.filterNewPeriod(someNewPeriod);

// v3.0:
// Call this after the initial parsing or after any new streams are added
await this.playerInterface_.filter(manifest);
```


#### Embedded Captions

There is another new method inside the player interface,
`makeTextStreamsForClosedCaptions`.
This method must be called on the manifest initially, and after each time new
content is added, in order for embedded captions, such as CEA 608 captions,
to work.

```js
this.playerInterface_.makeTextStreamsForClosedCaptions(manifest);
```


#### PresentationTimeline

The API for {@link shaka.media.PresentationTimeline} has changed.
`ManifestParser` plugins that use these methods MUST be updated:

  - {@link shaka.media.PresentationTimeline#notifySegments} now takes a
    reference array only, instead of a reference array and a Period start time
    or boolean flag.

```js
// v2.4:
timeline.notifySegments(segmentList, /* periodStart= */ 0);

// v2.5:
timeline.notifySegments(segmentList, /* isFirstPeriod= */ true);

// v3.0:
timeline.notifySegments(segmentList);
```


#### DrmInfo

The {@link shaka.extern.DrmInfo} structure has changed.  The `keyIds` field is
now a `Set` of `string`s instead of an `Array`.  `ManifestParser` plugins MUST
be updated to return the correct type, and applications which read this part of
the `Manifest` structure MUST be updated to interact with `Set` instead of an
`Array`.


#### Variant

The {@link shaka.extern.Variant} structure has changed.  The `drmInfos` field
has moved to {@link shaka.extern.Stream}.  `ManifestParser` plugins MUST be
updated to output this field on the correct object.


#### Stream

The {@link shaka.extern.Stream} structure has changed.

The `drmInfos` field that used to appear in {@link shaka.extern.Variant} has
been moved here.  `ManifestParser` plugins MUST be updated to output this field
on the correct object.

The `findSegmentPosition` and `getSegmentReference` callbacks have been replaced
with `segmentIndex`, an instance of {@link shaka.media.SegmentIndex}.
`ManifestParser` plugins MUST be updated to output a `segmentIndex` instead of
these callbacks.  (In many cases, you may have been basing these callbacks on a
`SegmentIndex` object's `find` and `get` methods already.)

The `initSegmentReference` and `presentationTimeOffset` fields are no longer
part of `Stream`.  This information has moved to
{@link shaka.media.SegmentReference}.  `ManifestParser` plugins MUST be updated
accordingly.  See the section on `SegmentReference` for details.

The `keyId` field, a string, has been replaced with the `keyIds` field, a `Set`
of `string`s.  `ManifestParser` plugins MUST be updated to output the new field.


#### InitSegmentReference

The {@link shaka.media.InitSegmentReference} API has changed.  The `createUris`
methods has been removed, as it was redundant.  Applications with custom
`ManifestParser` plugins and applications which read `InitSegmentReference`s
MUST be updated to use `getUris` instead.


#### SegmentReference

The {@link shaka.media.SegmentReference} API has changed.  Applications with
custom `ManifestParser` plugins and applications which read `SegmentReference`s
MUST be updated to account for all changes below.

The `createUris` methods has also been removed, as it was redundant.  Use
`getUris` instead.

`SegmentReference` objects no longer have any internal concept of "position".
The `getPosition` method has been removed, and the constructor no longer takes a
position parameter.

`SegmentReference` timestamps are no longer relative to the Period.  Instead,
they are presentation timestamps.  For example, if the Period starts at 100 and
the segment begins at time 5 within that Period, `startTime` will now be 105.

`SegmentReference` objects now contain their `InitSegmentReference`.  This
allows the segments within a `Stream` to change init segments mid-stream, which
is used both for multi-Period DASH and for HLS discontinuities.  If two segments
have the same initialization segment, their `SegmentReference`s MUST have the
same `InitSegmentReference` object at the same memory address.
`StreamingEngine` will compare `InitSegmentReference` objects to determine when
a new init segment must be fetched, and this will NOT be a deep comparison of
the contents of the object.

`SegmentReference` objects now contain an append window.  This is used to trim
content in `MediaSource`.  For multi-Period content, this is the start and end
of the Period from which the segment comes.  For other content, the start is
usually 0 and the end is usually `Infinity`.

`SegmentReference` objects now contain a timestamp offset.  `MediaSource` adds
this value to the timestamps in the media segment when it is parsed by the
browser.  This should be the value which aligns the media timestamps (in the
segment) to the presentation timestamps (in the `SegmentReference`).  This is
related to the `presentationTimeOffset` from v2.5 and earlier.
`timestampOffset` should be the period start time minus the
`presentationTimeOffset`.  (In v2.5, this is how `MediaSource`'s
`timestampOffset` field was calculated.  Now, we pass the `timestampOffset`
field from the `SegmentReference` directly to `MediaSource`.)

```js
// v2.5
const period = {
  startTime: 100,
  /* ... */
};
const initSegmentReference = /* ... */;
const stream = {
  /* ... */
  initSegmentReference,
  presentationTimeOffset: 20,
};
const ref = new shaka.media.SegmentReference(
    /* position= */ 0,
    /* startTime= */ 0,
    /* endTime= */ 10,
    /* uris= */ () => [uri],
    /* startByte= */ 0,
    /* endByte= */ null);

// v3.0
const ref = new shaka.media.SegmentReference(
    /* startTime= */ 100,  // <-- period start 100 + period-relative timestamp 0
    /* endTime= */ 110,
    /* uris= */ () => [uri],
    /* startByte= */ 0,
    /* endByte= */ null,
    initSegmentReference,
    /* timestampOffset= */ 80,  // <-- period start 100 - PTO 20
    /* appendWindowStart= */ 100,  // <-- period start
    /* appendWindowEnd= */ Infinity);  // <-- for the last period in live stream
```


#### SegmentIndex

The {@link shaka.media.SegmentIndex} API has changed.  Applications with custom
`ManifestParser` plugins and applications which read `SegmentIndex`es MUST be
updated to account for all changes below.

The asynchronous `destroy` method has been replaced with the synchronous
`release` method.  Applications which destroy `SegmentIndex` objects SHOULD be
updated to call `release` instead.  Backward compatibility will be removed in
v4.0.

The `find` method still returns a position which can be passed to `get`, but
this position is no longer part of the underlying `SegmentReference` object.
(See changes to `SegmentReference` in the section above.)  The value returned
from `find` is now abstract.  This should be completely compatible with v2.5,
but the value can no longer be tied to a `SegmentReference`.

The `merge` method has been simplified.  It was already documented to only
support extending the reference array without replacing anything or interleaving
new references into the old ones.  Now it is actually a true statement about the
implementation.  If your custom `ManifestParser` plugin was relying on the old
merge behavior rather than its documentation, you MUST update your plugin.

The `evict` method now takes a presentation timestamp.  See related changes in
the `SegmentReference` section above.

The `fit` method now takes a window start and end time instead of a period
duration.  See related changes in the `SegmentReference` section above.

The `updateEvery` method has been added.  This allows `ManifestParser` plugins
to schedule callbacks to calculate additional `SegmentReference`s to be appended
to the reference array.  This is useful, for example, in generating references
for `<SegmentTemplate>` content in DASH.

The static `forSingleSegment` method has been added.  It will generate a
`SegmentIndex` for a single segment based on a start time, duration, and URIs.
This is useful for `ManifestParser` plugins creating non-segmented text
`Stream`s.

Finally, `SegmentIndex` now implements the `Iterable` protocol.  This means
applications can now iterate through the index or convert it to an Array.  For
example:

```js
for (const reference of stream.segmentIndex) {
  // ...
}

// OR

const listOfReferences = Array.from(stream.segmentIndex);

// OR

const firstReference = Array.from(stream.segmentIndex)[0];
```

This could be useful to applications which read the contents of a `Manifest`.
