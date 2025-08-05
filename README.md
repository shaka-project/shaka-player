# ![Shaka Player](docs/shaka-player-logo.png)

Shaka Player is an open-source JavaScript library for adaptive media.  It plays
adaptive media formats (such as [DASH][], [HLS][] and [MSS][]) in a browser,
without using plugins or Flash.  Instead, Shaka Player uses the open web
standards [MediaSource Extensions][] and [Encrypted Media Extensions][].

Shaka Player also supports [offline storage and playback][] of media using
[IndexedDB][].  Content can be stored on any browser.  Storage of licenses
depends on browser support.

Our main goal is to make it as easy as possible to stream adaptive bitrate
video and audio using modern browser technologies. We try to keep the library
light, simple, and free from third-party dependencies. Everything you need to
build and deploy is in the sources.

For details on what's coming next, see our [development roadmap](roadmap.md).

[DASH]: http://dashif.org/
[HLS]: https://developer.apple.com/streaming/
[MSS]: https://learn.microsoft.com/en-us/iis/media/smooth-streaming/smooth-streaming-transport-protocol
[MediaSource Extensions]: https://www.w3.org/TR/media-source/
[Encrypted Media Extensions]: https://www.w3.org/TR/encrypted-media/
[IndexedDB]: https://www.w3.org/TR/IndexedDB-2/
[offline storage and playback]: https://shaka-project.github.io/shaka-player/docs/api/tutorial-offline.html


## Maintained branches

See [maintained-branches.md](https://github.com/shaka-project/shaka-player/blob/main/maintained-branches.md)
for the up-to-date list of maintained branches of Shaka Player.


## Platform and browser support matrix

|Browser       |Windows   |Mac      |Linux    |Android  |iOS >= 9  |iOS >= 17.1|iPadOS >= 13|ChromeOS|Other|
|:------------:|:--------:|:-------:|:-------:|:-------:|:--------:|:---------:|:----------:|:------:|:---:|
|Chrome        |**Y**     |**Y**    |**Y**    |**Y**    |**Native**|**Native** |**Native**  |**Y**   | -   |
|Firefox       |**Y**     |**Y**    |**Y**    |untested⁵|**Native**|**Native** |**Native**  | -      | -   |
|Edge          |**Y**     | -       | -       | -       | -        | -         | -          | -      | -   |
|Edge Chromium |**Y**     |**Y**    |**Y**    |untested⁵|**Native**|**Native** |**Native**  | -      | -   |
|IE            | N        | -       | -       | -       | -        | -         | -          | -      | -   |
|Safari        | -        |**Y**    | -       | -       |**Native**|**Y**      |**Y**       | -      | -   |
|Opera         |**Y**     |**Y**    |**Y**    |untested⁵|**Native**| -         | -          | -      | -   |
|Chromecast²   | -        | -       | -       | -       | -        | -         | -          | -      |**Y**|
|Tizen TV³     | -        | -       | -       | -       | -        | -         | -          | -      |**Y**|
|WebOS⁶        | -        | -       | -       | -       | -        | -         | -          | -      |**Y**|
|Hisense⁷      | -        | -       | -       | -       | -        | -         | -          | -      |**Y**|
|Vizio⁷        | -        | -       | -       | -       | -        | -         | -          | -      |**Y**|
|Xbox One      | -        | -       | -       | -       | -        | -         | -          | -      |**Y**|
|Playstation 4⁷| -        | -       | -       | -       | -        | -         | -          | -      |**Y**|
|Playstation 5⁷| -        | -       | -       | -       | -        | -         | -          | -      |**Y**|

NOTES:
 - ²: The latest stable Chromecast firmware is tested. Both sender and receiver
   can be implemented with Shaka Player.
 - ³: Tizen 2017 model is actively tested and supported by the Shaka Player
   team. Tizen 2016 model is community-supported and untested by us.
 - ⁵: These are expected to work, but are not actively tested by the Shaka
   Player team.
 - ⁶: These are expected to work, but are community-supported and untested by
   us.
     - Official support for LG WebOS TV:
       https://github.com/shaka-project/shaka-player/issues/1330
 - ⁷: These are expected to work, but are community-supported and untested by
   us.

NOTES for iOS and iPadOS:
 - We support iOS 9+ through Apple's native HLS player.  We provide the same
   top-level API, but we just set the video's `src` element to the manifest/media.
   So we are dependent on the browser supporting the manifests.
 - Since iPadOS 13 [MediaSource Extensions][] is supported
 - Since iPadOS 17 and iOS 17.1 [ManagedMediaSource Extensions][] is supported

[ManagedMediaSource Extensions]: https://www.w3.org/TR/media-source-2/#dom-managedmediasource

## Manifest format support matrix

|Format|Video On-Demand|Live |Event|In-Progress Recording|
|:----:|:-------------:|:---:|:---:|:-------------------:|
|DASH  |**Y**          |**Y**| -   |**Y**                |
|HLS   |**Y**          |**Y**|**Y**| -                   |
|MSS   |**Y**          | -   | -   | -                   |

You can also create a [manifest parser plugin][] to support custom manifest
formats.

[manifest parser plugin]: https://shaka-project.github.io/shaka-player/docs/api/tutorial-manifest-parser.html


## DASH features

DASH features supported:
 - VOD, Live, and In-Progress Recordings (dynamic VOD content)
 - MPD@timeShiftBufferDepth for seeking backward in Live streams
 - Multi-period content (static and dynamic)
 - Xlink elements (actuate=onLoad only, resolve-to-zero, fallback content)
 - All forms of segment index info: SegmentBase@indexRange, SegmentTimeline,
   SegmentTemplate@duration, SegmentTemplate@index, SegmentList
 - Multi-codec/multi-container manifests (we will negotiate support with the
   browser and choose the best ones)
 - Encrypted content (including custom ContentProtection schemas, PSSH in the
   manifest)
 - Key rotation
 - Trick mode tracks
 - WebVTT and TTML
 - CEA-608/708 captions
 - Multi-codec variants (on platforms with changeType support)
 - MPD chaining
 - MPD Patch updates for SegmentTemplate with $Number$, SegmentTimeline with
   $Number$ and SegmentTimeline with $Time$

DASH features **not** supported:
 - Xlink with actuate=onRequest
 - Manifests without any segment info:
   https://github.com/shaka-project/shaka-player/issues/1088
 - Multiple trick mode tracks for the same resolution at varying framerates or
   bitrates
 - Timescales so large that timestamps cannot be represented as integers in
   JavaScript (2^53): https://github.com/shaka-project/shaka-player/issues/1667
 - Modifying elements with an @schemeIdUri attribute via MPD Patch
 - Xlink dereferencing with MPD Patch


## HLS features

HLS features supported:
 - VOD, Live, and Event types
 - Low-latency streaming with partial segments, preload hints, delta updates and
   blocking playlist reload
 - Discontinuity
 - ISO-BMFF / MP4 / CMAF support
 - MPEG-2 TS support
 - WebVTT and TTML
 - CEA-608/708 captions
 - Encrypted content with PlayReady, Widevine and WisePlay
 - Encrypted content with FairPlay (Safari on macOS and iOS only)
 - AES-128, AES-256 and AES-256-CTR support on browsers with Web Crypto API support
 - SAMPLE-AES and SAMPLE-AES-CTR (identity) support on browsers with ClearKey support
 - Key rotation
 - Raw AAC, MP3, AC-3 and EC-3 (without an MP4 container)
 - I-frame-only playlists (for trick play and thumbnails)
 - #EXT-X-IMAGE-STREAM-INF for thumbnails
 - Interstitials
 - Container change during the playback (eg: MP4 to TS, or AAC to TS)

HLS features **not** supported:
 - X-SNAP attribute in interstitials

<details>
<summary>
<h3>Supported HLS tags</h3>
</summary>

For details on the HLS format and these tags' meanings, see https://datatracker.ietf.org/doc/html/draft-pantos-hls-rfc8216bis

<h4> Multivariant Playlist tags</h4>

- `#EXT-X-STREAM-INF:<attribute-list>`
  `<URI>`
- `#EXT-X-MEDIA:<attribute-list>`
- `#EXT-X-IMAGE-STREAM-INF:<attribute-list>`
- `#EXT-X-I-FRAME-STREAM-INF:<attribute-list>`
- `#EXT-X-SESSION-DATA:<attribute-list>`
- `#EXT-X-SESSION-KEY:<attribute-list>` EME Key-System selection and preloading
- `#EXT-X-START:TIME-OFFSET=<n>`
- `#EXT-X-CONTENT-STEERING:<attribute-list>` Content Steering
- `#EXT-X-DEFINE:<attribute-list>` Variable Substitution (`NAME,VALUE,QUERYPARAM` attributes)

<h4>Media Playlist tags</h4>

- `#EXTM3U`
- `#EXTINF:<duration>,[<title>]`
- `#EXT-X-PLAYLIST-TYPE:<type`
- `#EXT-X-ENDLIST`
- `#EXT-X-MEDIA-SEQUENCE=<n>`
- `#EXT-X-TARGETDURATION=<n>`
- `#EXT-X-DISCONTINUITY`
- `#EXT-X-DISCONTINUITY-SEQUENCE=<n>`
- `#EXT-X-BYTERANGE=<n>[@<o>]`
- `#EXT-X-MAP:<attribute-list>`
- `#EXT-X-KEY:<attribute-list>` (`KEYFORMAT="identity",METHOD=SAMPLE-AES` is only supports with MP4 segments)
- `#EXT-X-PROGRAM-DATE-TIME:<attribute-list>`
- `#EXT-X-START:TIME-OFFSET=<n>`
- `#EXT-X-SERVER-CONTROL:<attribute-list>`
- `#EXT-X-PART-INF:PART-TARGET=<n>`
- `#EXT-X-PART:<attribute-list>`
- `#EXT-X-SKIP:<attribute-list>` Delta Playlists
- `#EXT-X-DATERANGE:<attribute-list>` Metadata
- `#EXT-X-DEFINE:<attribute-list>` Variable Import and Substitution (`NAME,VALUE,IMPORT,QUERYPARAM` attributes)
- `#EXT-X-GAP`
- `#EXT-X-PRELOAD-HINT:<attribute-list>`
- `#EXT-X-BITRATE`

</details>


## MPEG-5 Part2 LCEVC Support

**Only supported on browsers with Media Source Extensions SourceBuffer support**

 - MPEG-5 Part2 LCEVC decoding support (decoding provided by [lcevc_dec.js][], must be
   separately included)

 - Integration documentation : [docs](docs/design/current/lcevc-integration.md)

 - More on [MPEG-5 Part2 LCEVC][]

[lcevc_dec.js]: https://www.npmjs.com/package/lcevc_dec.js
[MPEG-5 Part2 LCEVC]: https://www.lcevc.org


## MSS features

MSS features supported:
 - VOD
 - AAC and H.264
 - Encrypted content (PlayReady)
 - TTML/DFXP
 - Only supported with [codem-isoboxer][]

MSS features **not** supported:
 - Live

[codem-isoboxer]: https://github.com/Dash-Industry-Forum/codem-isoboxer

## DRM support matrix

|Browser       |Widevine  |PlayReady|FairPlay |WisePlay |ClearKey⁶ |
|:------------:|:--------:|:-------:|:-------:|:-------:|:--------:|
|Chrome¹       |**Y**     | -       | -       | -       |**Y**     |
|Firefox²      |**Y**     | -       | -       | -       |**Y**     |
|Edge³         | -        |**Y**    | -       | -       | -        |
|Edge Chromium |**Y**     |**Y**    | -       | -       |**Y**     |
|Safari        | -        | -       |**Y**    | -       | -        |
|Opera         |**Y**     | -       | -       | -       |**Y**     |
|Chromecast    |**Y**     |**Y**    | -       | -       |**Y**     |
|Tizen TV      |**Y**     |**Y**    | -       | -       |**Y**     |
|WebOS⁷        |untested⁷ |untested⁷| -       | -       |untested⁷ |
|Hisense⁷      |untested⁷ |untested⁷| -       | -       |untested⁷ |
|Vizio⁷        |untested⁷ |untested⁷| -       | -       |untested⁷ |
|Xbox One      | -        |**Y**    | -       | -       | -        |
|Playstation 4⁷| -        |untested⁷| -       | -       |untested⁷ |
|Playstation 5⁷| -        |untested⁷| -       | -       |untested⁷ |
|Huawei⁷       | -        | -       | -       |untested⁷|untested⁷ |

Other DRM systems should work out of the box if they are interoperable and
compliant to the EME spec.

NOTES:
 - ¹: Only official Chrome builds contain the Widevine CDM.  Chromium built from
   source does not support DRM.
 - ²: DRM must be enabled by the user.  The first time a Firefox user visits a
   site with encrypted media, the user will be prompted to enable DRM.
 - ³: PlayReady in Edge does not seem to work on a VM or over Remote Desktop.
 - ⁶: ClearKey is a useful tool for debugging, and does not provide actual
   content security.
 - ⁷: These are expected to work, but are community-supported and untested by
   us.

|Manifest  |Widevine  |PlayReady|FairPlay |WisePlay |ClearKey  |
|:--------:|:--------:|:-------:|:-------:|:-------:|:--------:|
|DASH      |**Y**     |**Y**    |**Y**    |**Y**    |**Y**     |
|HLS       |**Y**     |**Y**    |**Y** ¹  |**Y**    |**Y**     |
|MSS       | -        |**Y**    | -       | -       | -        |

NOTES:
 - ¹: By default, FairPlay is handled using Apple's native HLS player, when on
   Safari. We do support FairPlay through MSE/EME, however. See the
   `streaming.useNativeHlsForFairPlay` configuration value.


## Media container and subtitle support

Shaka Player supports:
  - ISO-BMFF / CMAF / MP4
    - Depends on browser support for the container via MediaSource
    - Can parse "sidx" box for DASH's SegmentBase@indexRange and
      SegmentTemplate@index
    - Can find and parse "tfdt" box to find segment start time in HLS
    - For MSS, [codem-isoboxer][] v0.3.7+ is required
  - WebM
    - Depends on browser support for the container via MediaSource
    - Can parse [cueing data][] elements for DASH's SegmentBase@indexRange and
      SegmentTemplate@index
    - Not supported in HLS
  - MPEG-2 TS
    - Can be played on any browser which supports MP4
    - Can find and parse timestamps to find segment start time in HLS
  - WebVTT
    - Supported in both text form and embedded in MP4
  - TTML
    - Supported in both XML form and embedded in MP4
  - CEA-608
    - Supported embedded in MP4 and TS
  - CEA-708
    - Supported embedded in MP4 and TS
  - Raw AAC
    - Supported in raw AAC container and transmuxing to AAC in MP4 container
      (depends on browser support via MediaSource).
  - Raw MP3
    - Supported in raw MP3 container and transmuxing to MP3 in MP4 container
      (depends on browser support via MediaSource).
  - Raw AC-3
    - Supported in raw AC-3 container and transmuxing to AC-3 in MP4 container
      (depends on browser support via MediaSource).
  - Raw EC-3
    - Supported in raw EC-3 container and transmuxing to EC-3 in MP4 container
      (depends on browser support via MediaSource).
  - SubRip (SRT)
    - UTF-8 encoding only
  - LyRiCs (LRC)
    - UTF-8 encoding only
  - SubStation Alpha (SSA, ASS)
    - UTF-8 encoding only
  - SubViewer (SBV)
    - UTF-8 encoding only

Subtitles are rendered by the browser by default. Applications can create a
[text display plugin][] for customer rendering to go beyond browser-supported
attributes.

[cueing data]: https://www.webmproject.org/docs/container/#cueing-data
[text display plugin]: https://shaka-project.github.io/shaka-player/docs/api/shaka.extern.TextDisplayer.html
<!-- TODO: replace with a link to a TextDisplayer tutorial -->


## Transmuxer support

Shaka Player supports:
  - Raw AAC to AAC in MP4
  - Raw MP3 to MP3 in MP4
  - Raw AC-3 to AC-3 in MP4
  - Raw EC-3 to EC-3 in MP4
  - AAC in MPEG-2 TS to AAC in MP4
  - AC-3 in MPEG-2 TS to AC-3 in MP4
  - EC-3 in MPEG-2 TS to EC-3 in MP4
  - MP3 in MPEG-2 TS to MP3 in MP4
  - MP3 in MPEG-2 TS to raw MP3
  - Opus in MPEG-2 TS to MP3 in MP4
  - H.264 in MPEG-2 TS to H.264 in MP4
  - H.265 in MPEG-2 TS to H.265 in MP4
  - Muxed content in MPEG-2 TS with the previous codecs


## Thumbnails support

Shaka Player supports:
  - Internal DASH thumbnails. Using DASH-IF IOP Image Adaptation Set
  - Internal HLS thumbnails. Using HLS Image Media Playlist
  - Internal HLS thumbnails. Using I-frame-only playlists with mjpg codec
  - External WebVTT with images/sprites (only for VoD)


## Monetization with Ads

Shaka Player supports:
- IMA SDK for Client-Side Ad Insertion
- IMA DAI SDK for Server-Side Ad Insertion
- AWS MediaTailor for Client-Side
- AWS MediaTailor for Server-Side
- AWS MediaTailor overlays
- HLS interstitials
- DASH Media Presentation Insertion (MPD alternate)
- Custom Interstitials
- Basic support of VAST and VMAP without IMA (playback without tracking)


## Content Steering support
Shaka Player supports Content Steering (v1) in DASH and HLS.

Content Steering features supported:
- TTL, if missing, the default value is 300 seconds.
- RELOAD-URI, if missing we use the url provided in the manifest as fallback.
- PATHWAY-PRIORITY only HOST replacement

Content Steering features **not** supported:
- PATHWAY-CLONES other replacements than HOST.


## VR support
Shaka Player supports VR when:
- Content is automatically treated as VR if it fits the following criteria:
  - HLS or DASH manifest
  - fMP4 segments
  - Init segment contains `prji` and `hfov` boxes
- Or, if it is manually enabled via the UI config.

VR modes supported:
- Equirectangular projection with 360 degrees of horizontal field of view.
- Half equirectangular projection with 180 degrees of horizontal field of view.
- Cubemap projection with 360 degrees of horizontal field of view.


NOTES:
  - VR is only supported for clear streams or HLS-AES stream. DRM prevents
    access to the video pixels for transformation.


## Builds

Shaka currently provides the following versions:
- Complete build with UI (`shaka-player.ui.js`)
- Complete build without UI (`shaka-player.compiled.js`)
- DASH build without UI, Cast and Offline (`shaka-player.dash.js`)
- HLS build without UI, Cast and Offline (`shaka-player.hls.js`)


## Documentation & Important Links ##

 * [Demo](https://shaka-player-demo.appspot.com)([sources](demo/))
 * [Nightly Demo](https://shaka-project.github.io/shaka-player/)
 * [Demo index](https://index-dot-shaka-player-demo.appspot.com)
 * [API documentation](https://shaka-project.github.io/shaka-player/docs/api/index.html)
 * [Tutorials](https://shaka-project.github.io/shaka-player/docs/api/tutorial-welcome.html)
 * [Hosted builds on Google Hosted Libraries](https://developers.google.com/speed/libraries/#shaka-player)
 * [Hosted builds on jsDelivr](https://www.jsdelivr.com/package/npm/shaka-player)
 * [Development roadmap](roadmap.md)
 * Subscribe to releases by following
     [instructions from this blog](https://www.jessesquires.com/blog/2020/07/30/github-tip-watching-releases/)


## FAQ ##

For general help and before filing any bugs, please read the
[FAQ](docs/tutorials/faq.md).


## Contributing ##

If you have improvements or fixes, we would love to have your contributions.
Please read [CONTRIBUTING.md](CONTRIBUTING.md)
for more information on the process we would like contributors to follow.


## Framework Integrations ##

The Shaka team doesn't have the bandwidth and experience to provide guidance and
support for integrating Shaka Player with specific frameworks, but some of our
users have successfully done so and created tutorials to help other beginners.

Shaka + ReactJS Library
- https://github.com/winoffrg/limeplay

Shaka + ReactJS integrations:
- https://github.com/matvp91/shaka-player-react
- https://github.com/amit08255/shaka-player-react-with-ui-config

Shaka + Next.js integration:
- https://github.com/amit08255/shaka-player-react-with-ui-config/tree/master/nextjs-shaka-player

Shaka + Vue.js integrations:
- https://github.com/davidjamesherzog/shaka-player-vuejs

Shaka + Nuxt.js integration:
- https://github.com/davidjamesherzog/shaka-player-nuxtjs

Shaka + video.js integration:
- https://github.com/davidjamesherzog/videojs-shaka

Shaka + Angular integration:
- https://github.com/PatrickKalkman/shaka-player-angular

If you have published Shaka Integration code/tutorials, please feel free to submit PRs
to add them to this list, we will gladly approve!
