# SCTE-35 messages

Shaka surfaces SCTE-35 messages from DASH MPD events, in-band MP4 `emsg`, and
HLS `EXT-X-DATERANGE` through one API.

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
player.addEventListener('scte35enter', (event) => {
  // Playback reached the message's presentation time.
  console.log(event.detail);
});
player.addEventListener('scte35exit', (event) => {
  // Playback left it.  A message with no duration is entered and left in the
  // same poll.
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

Seeking across a message emits neither `scte35enter` nor `scte35exit`.
Replaying after seeking back can emit them again. Playback notifications use
the playhead observer's polling resolution; they are not frame-accurate splice
operations.

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
