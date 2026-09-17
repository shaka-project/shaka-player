# SCTE-35 messages

Shaka exposes SCTE-35 messages through a dedicated presentation timeline.
Applications can use the same events for DASH MPD events, in-band MP4 `emsg`,
and HLS `EXT-X-DATERANGE`. Existing `timelineregionadded`, `timelineregionenter`,
`timelineregionexit`, metadata, and `emsg` events remain available.

```js
player.addEventListener('scte35added', (event) => {
  // Discover future messages, for example to prepare an ad decision.
  console.log(event.detail);
});
player.addEventListener('scte35updated', (event) => {
  // Confirmed duration or another transport representation became available.
  console.log(event.detail);
});
player.addEventListener('scte35', (event) => {
  // Playback reached or crossed the message's presentation time.
  console.log(event.detail);
});

const messages = player.getAllScte35Events();
```

## Timing and message identity

`startTime`, `duration`, and `plannedDuration` are in seconds on the player's
presentation timeline. `duration` is null when the transport has not supplied
a confirmed duration. `plannedDuration` is an estimate and never closes a splice.
Command PTS, `ptsAdjustment`, break durations, segmentation durations, and
component offsets retain their SCTE-35 units of 90 kHz ticks. They are not
substituted for transport presentation times.

A message is not necessarily an ad interval. HLS `OUT`, `IN`, and `CMD` are
individual messages. `kind` identifies these as `out`, `in`, and `cmd`;
other transports use `message`. Shaka merges HLS date range updates by playlist
and ID, including updates without `START-DATE`. An `IN` message is scheduled at
the confirmed end of the date range, rather than at the `OUT` time.

`origins` identifies the transport occurrences of a message. Each origin has a
`source` (`dash`, `hls`, or `emsg`), transport `id`, `scope`, and original
`schemeIdUri`. The scope distinguishes HLS playlists and DASH Periods and
EventStream values.
Transport IDs are independent of `spliceEventId` and `segmentationEventId`.
Repeated discoveries are deduplicated. Supported equivalent XML and binary
messages at the same presentation time share an entry and retain both origins.

Seeking across a message does not emit `scte35`. Replaying after seeking back
can emit it again. Late discoveries emit `scte35added`, without replaying a
past message. Playback notifications use the playhead observer's polling
resolution. They are not frame-accurate splice operations.

## Formats and decoding

Supported DASH schemes are:

- `urn:scte:scte35:2013:xml`
- `urn:scte:scte35:2014:xml+bin`
- `urn:scte:scte35:2013:bin`
- `urn:scte:scte35:2013:xml+bin` as a compatibility alias

Outer whitespace is ignored when identifying schemes. XML namespace prefixes
are not significant. XML `Signal/Binary` carries base64, HLS attributes carry
hexadecimal sections, and binary `emsg` carries section bytes. DASH `emsg`
must be declared in the MPD unless `mediaSource.dispatchAllEmsgBoxes` is enabled.
For HLS, enable `mediaSource.dispatchAllEmsgBoxes` to receive SCTE-35 `emsg`.

`command` normalizes `splice_insert`, `time_signal`, `splice_null`, and binary
`bandwidth_reservation`. `segmentationDescriptors` contains normalized
segmentation descriptors, including cancellation, component offsets, delivery
restrictions, and optional subsegment fields. UPID values are hexadecimal byte
strings. XML UPIDs in text, hexadecimal, and base64 forms are normalized to bytes,
including MPU format identifiers and multiple UPIDs.

`status` is `parsed`, `unsupported`, or `invalid`. Encrypted sections, unknown
commands, and unknown descriptors remain observable as unsupported messages.
Malformed sections, lengths, or CRCs are invalid. Neither fails playback.
`data` retains binary section bytes, `xml` retains the XML representation, and
`rawData` retains encoded text when available. Application events and snapshots
are copies, including their byte arrays.

## Lifecycle and extension

Messages are retained within the accessible presentation window, including
future messages. Confirmed durations can retain messages whose intervals still
overlap the window. Unknown and planned durations do not extend retention.
Preloading owns the timeline until it is transferred to playback. Destroying an
abandoned preload or unloading playback releases its messages and timers.
HLS retains correlation state for open OUT ranges until they close or a playlist
delta explicitly removes them, so IN updates can still omit `START-DATE` after
the OUT message has left the presentation window.

Manifest parser plugins call the `onScte35Event` callback with a
normalized `shaka.extern.Scte35Event`. They must resolve their transport's clock
to player presentation time first. Native HLS
playback through `src=` does not expose playlist attributes through this API.
