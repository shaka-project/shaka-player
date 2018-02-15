# DASH Manifests

This document describes some of the pieces of a DASH manifest and how they
relate to playback.  This won't cover everything that DASH allows, but this will
cover the important concepts and hopefully will alleviate some of the confusion
many people have with DASH manifests.


## Time

When dealing with media and streaming, there are many different kinds of times
we are dealing with.  Some don't apply to all cases; for example, VOD doesn't
care about the wall-clock time.  It is important to use the correct words for
the kind of time we are dealing with to avoid confusion.  It is possible to
convert from one kind of time to another, but these all have distinct values
that need to be considered different.

### Presentation time

The time within the presentation.  This represents the amount of time that has
passed since the start of the presentation.  For VOD, this is the time since the
beginning of the video; for live, this is the time since the live stream
started.

### Media time

The time that is encoded within a media segment.  Each media segment has
information in it for what time it should be played at.  The media time is not
used by the player to determine presentation time; however, it is used by the
media player (e.g. the browser) to play the segment.  So if the segment has a
media time of 30 seconds, then the browser will put the segment at 30 seconds in
the `<video>`.

The manifest specifies values which can adjust the media time.  Both the
`presentationTimeOffset` and the `Period@start` will change the media times so
the segment appears at the correct time in the `<video>` element.

### Wall-Clock time

This represents the time as seen on a clock.  In terms of value, this is
commonly represented as seconds since the epoch.  This does **not** mean the
time that a segment will be played at.


## Presentation Timeline

The biggest concept in DASH is the presentation timeline.  This represents a
unified timeline of what content to play.  This can be thought of as the time
of a single VOD clip.  The timeline starts at 0 and describes at what time to
play each segment.  So if a media segment has a presentation time of 30 seconds,
then it will play 30 seconds after the presentation has started.

Media times from different pieces of content are adjusted so they appear at the
correct time within the timeline.  This allows concatenating different clips to
form a continuous video playback.  Different streams may exist that describe
different versions of the content to switch between (e.g. SD and HD).

In Shaka Player, we only deal with presentation time.  We map this directly
to the `<video>` element.  This means that `video.currentTime` represents the
presentation time of the content.  So if you seek to 90 seconds, we will look
up the segment that has a presentation time of 90 seconds.


## Periods

The presentation timeline is composed of one or more sequential Periods.  A
Period represents an independent piece of the timeline.  Periods cannot overlap
and should not have gaps between them (although Shaka Player supports gap
jumping). Each Period has a start time, which can be explicit through the
`start` attribute, or can be implicit by using the `duration` attribute of the
previous Period.

Content is clamped to a Period.  Any content that appears before the Period
start or after the Period end will be dropped.  If the whole segment is outside
the Period, the player will just ignore it.

Note that we implement content deleting using the MSE `appendWindowStart`.  This
has a subtle problem if we have a partial segment at the start of the Period.
When the browser drops content at the start of the Period, it will continue to
drop frames until the next keyframe.  This means that if your first segment
starts at -0.1 relative to the Period (e.g. `PTO > S@t`), then we may loose the
whole segment if there are no more keyframes in it.  See the
[coded frame processing][] algorithm for more info.

[coded frame processing]: https://w3c.github.io/media-source/#sourcebuffer-coded-frame-processing


## Calculating presentation times

```xml
<Period start="PT30S" duration="PT10S">
  <AdaptationSet>
    <Representation>
      <SegmentTemplate timescale="10" presentationTimeOffset="100"
          media="s$Number$.mp4" initialization="init.mp4">
        <SegmentTimeline>
          <S t="111" d="40" />
          <S d="10" />
          <S t="170" d="10" />
        </SegmentTimeline>
      </SegmentTemplate>
    </Representation>
  </AdaptationSet>
</Period>
```

The above example uses `SegmentTemplate` with `SegmentTimeline`, but you could
easily use the other formats, there is no difference.  In any case, there is a
list of the segments where each segment has a start and duration.

Here is the general equation used to calculate presentation times.

```js
start = 111;  // S@t
presentationTime = (start - presentationTimeOffset) / timescale + periodStart;
```

First the start time in the manifest needs to be offset by the
`presentationTimeOffset` (PTO).  The reason this exists is because the time
specified in the time attribute MUST match the media time.  The PTO will adjust
the media time too; this means if you just change the `S@t`, when we append the
media, the browser will put the segment at the wrong time since we didn't adjust
the media time correctly.

Next, both the start time and PTO are specified in timescale units, so we need
to convert that to seconds.

Lastly, times in the manifest are relative to the Period.  This means that you
need to add the Period time to get the real presentation time.  This allows you
to specify each Period independent to where the Period is within the timeline.
This is especially useful for ad-insertion.

So in the above example, the first segment starts playing at
`(111 - 100) / 10 + 30`, or 31.1 seconds.  The first segment has a duration of
`S@d / timescale` seconds so the second segment will start at 35.1 seconds.
There is a gap before the third segment, and it will start at
`(170 - 100) / 10 + 30` or 37 seconds.

![timeline example](dash-timeline.svg)

### Choosing values for presentationTimeOffset (PTO)

You want to set `S@t` to exactly the same value as the media time.  If that
doesn't result in a presentation time you want, you should use PTO or Period
start to change that.  If there is a single Period, you can have Period start be
0 and just use PTO to adjust the segment to be at the right time; in
multi-Period content you'll need to adjust it so that the segments within the
Period start at 0.

Be sure to use the same value for PTO for all streams.  It may be tempting to
just use the first `S@t` value for PTO, but that won't work.  If you use
different values, it will result in audio/video de-sync since they have been
adjusted by different amounts.  It is better to pick a specific value and set
each stream to the same value (make sure to account for timescale).

Also when choosing between two values for PTO, it is suggested to use the
smaller value.  If you use the bigger one, then the Period-relative time of the
other stream will be negative.  See note in the Periods section above.


## Live

It is important to note that live works almost exactly the same as VOD.  Live
still has the same timeline and same presentation times.  For live content,
the presentation time of 0 represents when the live stream started.  This is
given in the manifest as `availabilityStartTime`.  So when we start playing a
live stream, we will calculate the difference between `now` and the start time
and that gives us the current presentation time to play at.

Important: You shouldn't map presentation times to wall-clock times.  If a
media segment has a presentation time of 5 minutes and an AST of 9:00, that
doesn't mean the segment will be played at 9:05; the app can pause the video
which will delay when it is played.  All it means is that is when it was
recorded.

Also note that it is common to use Unix timestamps for the media timestamps in
live content.  Then setting the AST to the epoch means the segments appear at
the correct time.  This is valid, but not required.  Just like VOD content, the
media time doesn't matter so long as the adjusted presentation time puts the
segment at the correct position.

### Live edge

When playing live content, we need to determine what the current time is.  The
live edge is the latest edge of the live playback, in presentation time.  As we
are playing, the live edge moves forward with the current wall-clock time.

To calculate the live edge, we look at the `availabilityStartTime` (AST) to
determine the wall-clock time that the stream started.  The current wall-clock
time is equivalent to `now - AST` in presentation time; however, the server is
still recording that segment, so we can't play it yet.  So we back the live edge
up by the segment size.  So the live edge is `now - AST - maxSegmentSize`.

```js
const ast = 1518717600;  // availabilityStartTime="2018-02-15T18:00:00Z"
const now = 1518718680;  // (Date.now() / 1000) -> 2018-02-15T18:18:00Z
const maxSegmentSize = 10;  // seconds

const liveEdge = now - ast - maxSegmentSize;  // 1070

video.currentTime = liveEdge;  // Start playing at live edge.
// We'll start playing segments with a *presentation time* around 1070.
```

But even then, manifest updates and network delays can cause us to stall if we
try to play at the live edge.  So we will actually delay where we will play at
so we don't stall.  The time we adjust by can be specified in the manifest using
the `MPD@suggestedPresentationDelay` attribute.  This specifies the delay to
give the live stream to allow for smooth playback.  If it isn't specified, we
will give a reasonable default value.

### Segment availability

DASH has a concept of availability.  This defines which segments can be
downloaded from the server.  So long as a segment is available, the segment MUST
exist on the server to be downloaded.  The availability of a segment is
determined by the `MPD@timeShiftBufferDepth` attribute.  This specifies a
moving window of availability around the live edge.  So if the TSBD attribute
is 10 minutes, that means that you can play the most recent 10 minutes of a
live stream; or specifically, the seekable range of presentation times is
between the live edge and 10 minutes before that.

A manifest may list more or fewer segments than the availability window.  If it
lists more, the extra segments may already be unavailable when the manifest is
downloaded; if the manifest lists less segments, then we may not be able to fill
the whole availability window.  Note that the player is allowed to remember the
segments even if they are no longer listed.  So if an updated manifest no longer
includes some segments, they are still available to be downloaded until they
fall outside the availability window.

### Clock sync

Since both the live edge and the availability window calculations involve the
current wall-clock time, both the server and the client need to have
synchronized clocks.  This is done in DASH by using the `UTCTiming` element;
this specifies how to get an accurate clock time on the server so the client can
alter the client clock to match.

This means that DASH manifests are sensitive to drift and clock-sync issues.  It
is very common for live manifests to have clock problems, so if your live
manifest doesn't play, it is likely because of clock sync.  This is so common
that Shaka Player will be changing to determine the live edge using the list of
segments.  You can follow progress in [#999][].  But note that DASH requires
accurate clock times, so even after that feature is added, your manifest may
not play in other DASH players.

[#999]: https://github.com/google/shaka-player/issues/999

