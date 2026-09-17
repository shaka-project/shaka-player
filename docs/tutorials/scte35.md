# SCTE-35 messages

Shaka surfaces SCTE-35 messages from DASH MPD events, in-band MP4 `emsg`, and
HLS `EXT-X-DATERANGE` through one API, so an application does not need to know
which transport carried a message.

Shaka does not interpret the message. It tells you *where* a message came from
and *when* it applies, and hands you the payload untouched, so you can decode
only the parts your application cares about. Existing `timelineregionadded`,
`timelineregionenter`, `timelineregionexit`, metadata, and `emsg` events remain
available and unchanged.

```js
player.addEventListener('scte35added', (event) => {
  // A message was discovered, possibly well before its presentation time.
  console.log(event.detail);
});
player.addEventListener('scte35', (event) => {
  // Playback reached the message's presentation time.
  console.log(event.detail);
});

const messages = player.getAllScte35Events();
```

## The message

| Field | Meaning |
| --- | --- |
| `startTime` | Presentation time, in seconds, that the message applies to. |
| `endTime` | When the transport signals a duration, the end of it. Otherwise equal to `startTime`. |
| `schemeIdUri` | The SCTE-35 scheme the transport used. |
| `id` | The transport's identifier, independent of `splice_event_id` and `segmentation_event_id`. |
| `source` | `dash`, `hls`, or `emsg`. |
| `kind` | `out`, `in`, or `cmd` for HLS; the empty string otherwise. |
| `data` | The complete `splice_info_section`, or null. |
| `node` | The original XML, for XML-only messages, or null. |

A message is not an ad interval. HLS `OUT`, `IN`, and `CMD` are individual
messages: an `IN` is reported at the end of the date range it closes, not at
the `OUT` time. A message discovered through more than one transport is
reported once per transport; use `source` to tell them apart.

Seeking across a message does not emit `scte35`. Replaying after seeking back
can emit it again. Playback notifications use the playhead observer's polling
resolution; they are not frame-accurate splice operations.

## Formats

Supported schemes are:

- `urn:scte:scte35:2013:xml`
- `urn:scte:scte35:2014:xml+bin`
- `urn:scte:scte35:2013:bin`
- `urn:scte:scte35:2013:xml+bin` as a compatibility alias

Outer whitespace is ignored when identifying schemes, and XML namespace
prefixes are not significant.

`data` holds the binary `splice_info_section` whenever the transport carries
one, whether it arrived as raw `emsg` bytes, as base64 inside `Signal/Binary`,
or as an HLS hexadecimal attribute. Decode it with the SCTE-35 library of your
choice. `data` is null only for an XML-only `urn:scte:scte35:2013:xml` message,
which is exposed as `node` instead. A payload Shaka cannot decode into bytes is
skipped rather than reported, and never fails playback.

DASH `emsg` must be declared in the MPD unless
`mediaSource.dispatchAllEmsgBoxes` is enabled. For HLS, enable
`mediaSource.dispatchAllEmsgBoxes` to receive SCTE-35 `emsg`.

## Lifecycle

Messages are retained while they are within the accessible presentation window,
including messages still in the future. Preloading owns the timeline until it
is transferred to playback; destroying an abandoned preload or unloading
playback releases its messages.

Manifest parser plugins call the `onScte35Event` callback with a
`shaka.extern.Scte35Event`, having already resolved their transport's clock to
player presentation time. Native HLS playback through `src=` does not expose
playlist attributes through this API.
