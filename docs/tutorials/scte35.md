# SCTE-35 messages

Shaka surfaces SCTE-35 messages from DASH MPD events, in-band MP4 `emsg`, HLS
`EXT-X-DATERANGE`, and MSF event timeline tracks through one API.

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
| `endTime` | When the transport signals a duration, the end of it. Otherwise equal to `startTime`, which is always the case for MSF. |
| `schemeIdUri` | The SCTE-35 scheme the transport used. |
| `id` | The transport's identifier, independent of `splice_event_id` and `segmentation_event_id`. MSF has none, so Shaka derives one from the record's index reference and payload. |
| `source` | `dash`, `hls`, `emsg`, or `msf`. |
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

MSF event timeline tracks are recognized by their `eventType` instead; see
[MSF event timelines](#msf-event-timelines).

Outer whitespace is ignored when identifying schemes, and XML namespace
prefixes are not significant.

`data` holds the binary `splice_info_section` whenever the transport carries
one, whether it arrived as raw `emsg` bytes, as base64 inside `Signal/Binary`,
or as an HLS hexadecimal attribute. Decode it with the SCTE-35 library of your
choice. `data` is null only for an XML-only `urn:scte:scte35:2013:xml` message,
which is exposed as `node` instead. A payload Shaka cannot decode into bytes is
skipped rather than reported, and never fails playback.

## In-band `emsg`

Messages carried in-band arrive as MP4 `emsg` boxes, which Shaka only
dispatches for schemes it has been told to expect. That gate applies before
SCTE-35 is recognized, so a stream whose scheme is not declared produces no
messages at all.

For DASH, declare the scheme with `InbandEventStream` in the MPD. For HLS,
there is nowhere to declare it.

In either case, setting `mediaSource.dispatchAllEmsgBoxes` to `true` lifts the
gate and dispatches every `emsg` box regardless:

```js
player.configure('mediaSource.dispatchAllEmsgBoxes', true);
```

This is required to receive SCTE-35 `emsg` in HLS, and is the fallback for a
DASH stream that omits the declaration.


## MSF event timelines

In an MSF presentation, SCTE-35 does not travel inside the media. It has a
track of its own: an **event timeline track**
([draft-ietf-moq-msf](https://datatracker.ietf.org/doc/draft-ietf-moq-msf/)
section 8), whose content is defined by
[draft-wilaw-moq-scte35-event-timeline-00](https://datatracker.ietf.org/doc/draft-wilaw-moq-scte35-event-timeline/00/).
Shaka subscribes to it as soon as the catalog lists it:

```json
{
  "name": "scte35",
  "packaging": "eventtimeline",
  "eventType": "urn:scte:scte35:2022:bin",
  "depends": ["video-timeline"]
}
```

The `eventType` says how payloads are carried:

| `eventType` | Payload |
| --- | --- |
| `urn:scte:scte35:2022:bin` | base64 `splice_info_section`, exposed as `data` |
| `urn:scte:scte35:2022:xml` | XML, exposed as `node`, or as `data` when it wraps a `Binary` |

The 2013 names (`urn:scte:scte35:2013:bin`, `urn:scte:scte35:2013:xml`), used
by the MSF draft's own catalog example, are accepted too. Event timelines of
any other type are ignored.

Each object of the track is a JSON array of records. A record carries one
index reference, which says where the message applies, and the payload:

```json
[
  { "m": 480500, "data": { "scte35_payload": "<base64 splice_info_section>" } },
  { "l": [15, 3], "data": { "scte35_payload": "<base64 splice_info_section>" } }
]
```

MSF writes the index references in upper case (`M`, `T`, `L`) and the SCTE-35
draft in lower case; Shaka accepts either. How each one is placed on the
presentation timeline:

| Index | Meaning | Placed at |
| --- | --- | --- |
| `m` | Media time, in milliseconds | That time, directly. |
| `t` | Wallclock time, in milliseconds since the epoch | The media time the media timeline gives for it. |
| `l` | MoQT Location, `[Group, Object]` | The media time the media timeline gives for it. |

A wallclock time or a Location can only be placed through a **media timeline**
(an explicit `mediatimeline` track or a `template`; see "Media timeline, DVR
and seeking" in {@tutorial moq}), and needs one to be useful:

- The event timeline's `depends` names the timeline track, as in the MSF
  example, or a media track with a `template`. With no `depends`, any media
  timeline in the presentation is used.
- A record that arrives before the media timeline can place it waits until it
  can. A wallclock time needs records whose wallclock time is known (not `0`).
- A timeline usually lists the first Object of each Group only, so a Location
  further into a Group is placed at the start of that Group: at most one Group
  early.

The first object of each Group repeats every message still accessible. Each
message is reported once, however often it is repeated. A message also stops
being tracked once a complete document no longer lists it.

A track compressed with `MSF_COMPRESSION` is decompressed (on draft-18 and
later). If the compression is not supported, Shaka unsubscribes from the
track, and playback carries on without it.
