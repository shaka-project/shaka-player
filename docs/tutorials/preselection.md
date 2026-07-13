# DASH Preselections (Next Generation Audio)

Preselections (ISO/IEC 23009-1 clause 5.3.11) define pre-defined user
experiences that a DASH client can select.  They were introduced for Next
Generation Audio (NGA) codecs such as Dolby AC-4 or MPEG-H 3D Audio, where a
single stream can carry several experiences at once — for example a complete
main mix, a dialogue-enhanced mix, and an audio-description mix — all
multiplexed in the same media segments.

Shaka Player supports Preselections whose components resolve to a single
audio AdaptationSet (media components multiplexed at the elementary-stream
level, the common case for AC-4 and MPEG-H "fat streams").  Each Preselection
is exposed as a regular audio track, so **no new APIs are needed**: the
existing track selection APIs and the UI work unmodified.

#### How Preselections are signaled

Shaka Player understands both signaling forms defined by the spec.  The
Preselection element form looks like this:

```xml
<Period id="1">
  <AdaptationSet id="1" mimeType="video/mp4">
    ...
  </AdaptationSet>

  <!-- An AC-4 stream carrying several presentations.  The EssentialProperty
       descriptor marks it as only consumable through its Preselections. -->
  <AdaptationSet id="2" mimeType="audio/mp4" codecs="ac-4.02.01.00">
    <EssentialProperty schemeIdUri="urn:mpeg:dash:preselection:2016"/>
    <Representation id="a" bandwidth="256000">
      ...
    </Representation>
  </AdaptationSet>

  <Preselection id="10" tag="0" lang="en" preselectionComponents="2"
      codecs="ac-4.02.01.01">
    <Label>English dialogue</Label>
    <Role schemeIdUri="urn:mpeg:dash:role:2011" value="main"/>
  </Preselection>
  <Preselection id="20" tag="1" lang="en" preselectionComponents="2"
      codecs="ac-4.02.01.02">
    <Label>English dialogue enhanced</Label>
    <Role schemeIdUri="urn:mpeg:dash:role:2011" value="alternate"/>
  </Preselection>
</Period>
```

Each Preselection re-describes the experience: its `lang`, `codecs`,
`AudioChannelConfiguration`, `Label`, `Role` and `Accessibility` values
replace the ones of the AdaptationSet for that track.  With an
`EssentialProperty` descriptor the plain AdaptationSet track is hidden (it is
only consumable through its Preselections); with a `SupplementalProperty`
descriptor it is exposed alongside them.

#### Selecting a Preselection

Preselections surface through the normal audio track APIs:

```js
const tracks = player.getAudioTracks();
// e.g. [{language: 'en', label: 'English dialogue', ...},
//       {language: 'en', label: 'English dialogue enhanced', ...}]

player.selectAudioTrack(tracks[1]);
```

When the selection changes, Shaka Player clears the audio buffer and
re-fetches the segments, so the newly selected experience takes effect
immediately.

#### Rewriting segments for the selected experience

Selecting a Preselection of a fat stream does not change which bytes are
downloaded: all experiences live in the same segments, and it is the media
engine that must decode the requested one.  Since MSE offers no API to pass
the Preselection tag to the platform decoder, the segments usually need to be
rewritten so the decoder picks the right experience.  That processing is
codec-specific, so Shaka Player delegates it to the application through a
configuration callback:

```js
player.configure('mediaSource.modifyPreselectionSegmentCallback',
    (preselectionSegmentInfo) => {
      // Rewrite preselectionSegmentInfo.data here as needed.
      return preselectionSegmentInfo;
    });
```

The callback is invoked right before appending any segment of a stream that
belongs to a Preselection, and receives a
{@link shaka.extern.PreselectionSegmentInfo} object:

| Field           | Type                        | Description                              |
|-----------------|-----------------------------|------------------------------------------|
| `data`          | `BufferSource`              | The segment data about to be appended.   |
| `preselection`  | `{id: string, tag: ?string}`| The Preselection of the stream.          |
| `stream`        | `shaka.extern.Stream`       | The stream being appended.               |
| `contentType`   | `string`                    | `'audio'` or `'video'`.                  |
| `isInitSegment` | `boolean`                   | True for initialization segments.        |

The callback returns the (possibly modified) info object; by default it
returns it unmodified.  Note that `preselection.tag` is a **string**, since
it comes from the `tag` attribute of the MPD.

Because the audio buffer is cleared when the track changes, the segments of
the newly selected Preselection flow through this callback again — the
callback always sees the currently active Preselection and needs no extra
synchronization with the UI.

#### AC-4 example with Dolby ALPS

For Dolby AC-4, Dolby provides [alps-web][], an open-source library that
rewrites the AC-4 table of contents in ISOBMFF segments so the decoder
selects a given presentation.  Install it with:

```sh
npm install --save @dolbylaboratories/alps
```

A complete integration, with the type conversions needed between the two
libraries called out explicitly:

```js
import {Alps} from '@dolbylaboratories/alps';

const alps = new Alps();

player.configure('mediaSource.modifyPreselectionSegmentCallback',
    (preselectionSegmentInfo) => {
      // ALPS only understands AC-4; ignore other Preselection streams.
      const codecs = preselectionSegmentInfo.stream.codecs || '';
      if (!codecs.toLowerCase().startsWith('ac-4')) {
        return preselectionSegmentInfo;
      }

      // Type note: Shaka Player exposes the Preselection tag as a string
      // (?string), because it comes from an MPD attribute.  ALPS identifies
      // AC-4 presentations by number, so convert it.  -1 selects the default
      // presentation if the tag is missing or not numeric.
      let presentationId = parseInt(preselectionSegmentInfo.preselection.tag, 10);
      if (Number.isNaN(presentationId)) {
        presentationId = -1;
      }

      // Type note: Alps.processIsoBmffSegment() takes an ArrayBuffer and
      // modifies it in place (its return value is only metadata), while
      // preselectionSegmentInfo.data is a BufferSource — usually a
      // Uint8Array view.  toArrayBuffer() unwraps the view when it spans the
      // whole underlying buffer and copies it otherwise, so always append
      // the ArrayBuffer that ALPS actually processed.
      const buffer = shaka.util.BufferUtils.toArrayBuffer(
          preselectionSegmentInfo.data);

      // ALPS detects init vs. media segments on its own, so every segment
      // can be processed the same way.  Passing the presentation ID on each
      // call keeps the integration stateless (it takes precedence over
      // Alps.setActivePresentationId()).
      alps.processIsoBmffSegment(buffer, /* streamId= */ null,
          presentationId);

      preselectionSegmentInfo.data = buffer;
      return preselectionSegmentInfo;
    });
```

To recap the type compatibility between the two APIs:

| Shaka Player                     | ALPS                                | Conversion                          |
|----------------------------------|-------------------------------------|-------------------------------------|
| `preselection.tag` (`?string`)   | `presentationId` (`number`)         | `parseInt(tag, 10)`, `-1` fallback |
| `data` (`BufferSource`)          | `segmentBuffer` (`ArrayBuffer`)     | `shaka.util.BufferUtils.toArrayBuffer()` |
| callback is synchronous          | `processIsoBmffSegment()` is synchronous | none needed                    |

The MPD `tag` attribute of each Preselection must match the AC-4
`presentation_id` carried in the bitstream (see ETSI TS 103 190-2); that is
what links the track the user selected to the presentation ALPS activates.

If you want to double-check the MPD signaling against the bitstream, ALPS
can also report the presentations it found in the init segment:

```js
alps.setPresentationsChangedEventHandler((event) => {
  // Presentation ids here are numbers, e.g. [{id: 0, ...}, {id: 1, ...}].
  console.log('AC-4 presentations:', alps.getPresentations(event.streamId));
});
```

#### Notes and limitations

- Playback still requires platform support for the audio codec.  Most
  desktop browsers cannot decode AC-4 or MPEG-H; on such devices the
  Preselection tracks are filtered out with the rest of the unsupported
  variants.  This feature is aimed at devices with NGA decoders (smart TVs,
  set-top boxes, etc.).
- For multi-period content where the AC-4 configuration changes between
  periods, ALPS can track each period separately through the `streamId`
  parameter of `processIsoBmffSegment()` and `clearStream()`; with a single
  configuration, `null` (as above) is enough.
- Preselections whose components span multiple AdaptationSets (Preselections
  with several ids in `@preselectionComponents`), or that reference
  ContentComponents, are not supported yet and are ignored.  AdaptationSets
  marked as only consumable through such Preselections are ignored as well.
- Preselection information survives offline storage: downloads keep the
  `preselection` association, and the callback runs for offline playback
  too.

[alps-web]: https://github.com/DolbyLaboratories/alps-web
