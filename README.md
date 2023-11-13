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
[offline storage and playback]: https://shaka-player-demo.appspot.com/docs/api/tutorial-offline.html


## Maintained branches

See [maintained-branches.md](https://github.com/shaka-project/shaka-player/blob/main/maintained-branches.md)
for the up-to-date list of maintained branches of Shaka Player.


## Platform and browser support matrix

|Browser       |Windows   |Mac      |Linux    |Android  |iOS >= 9  |iOS >= 17.1|iPadOS >= 13|ChromeOS|Other|
|:------------:|:--------:|:-------:|:-------:|:-------:|:--------:|:---------:|:----------:|:------:|:---:|
|Chrome¹       |**Y**     |**Y**    |**Y**    |**Y**    |**Native**|**Native** |**Native**  |**Y**   | -   |
|Firefox¹      |**Y**     |**Y**    |**Y**    |untested⁵|**Native**|**Native** |**Native**  | -      | -   |
|Edge¹         |**Y**     | -       | -       | -       | -        | -         | -          | -      | -   |
|Edge Chromium |**Y**     |**Y**    |**Y**    |untested⁵|**Native**|**Native** |**Native**  | -      | -   |
|IE            | N        | -       | -       | -       | -        | -         | -          | -      | -   |
|Safari¹       | -        |**Y**    | -       | -       |**Native**|**Y**      |**Y**       | -      | -   |
|Opera¹        |untested⁵ |untested⁵|untested⁵|untested⁵|**Native**| -         | -          | -      | -   |
|Chromecast².  | -        | -       | -       | -       | -        | -         | -          | -      |**Y**|
|Tizen TV³     | -        | -       | -       | -       | -        | -         | -          | -      |**Y**|
|WebOS⁶        | -        | -       | -       | -       | -        | -         | -          | -      |**Y**|
|Xbox One      | -        | -       | -       | -       | -        | -         | -          | -      |**Y**|
|Playstation 4⁷| -        | -       | -       | -       | -        | -         | -          | -      |**Y**|
|Playstation 5⁷| -        | -       | -       | -       | -        | -         | -          | -      |**Y**|

NOTES:
 - ¹: On macOS, only Safari 9+ is supported.  On iOS, only iOS 9+ is
   supported.  Older versions will be rejected.
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


## Manifest format support matrix

|Format|Video On-Demand|Live |Event|In-Progress Recording|
|:----:|:-------------:|:---:|:---:|:-------------------:|
|DASH  |**Y**          |**Y**| -   |**Y**                |
|HLS   |**Y**          |**Y**|**Y**| -                   |
|MSS   |**Y**          | -   | -   | -                   |

You can also create a [manifest parser plugin][] to support custom manifest
formats.

[manifest parser plugin]: https://shaka-player-demo.appspot.com/docs/api/tutorial-manifest-parser.html


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

DASH features **not** supported:
 - Xlink with actuate=onRequest
 - Manifests without any segment info:
   https://github.com/shaka-project/shaka-player/issues/1088
 - Multiple trick mode tracks for the same resolution at varying framerates or
   bitrates
 - Timescales so large that timestamps cannot be represented as integers in
   JavaScript (2^53): https://github.com/shaka-project/shaka-player/issues/1667


## HLS features

**Only supported on browsers with SourceBuffer.mode=sequence support**

HLS features supported:
 - VOD, Live, and Event types
 - Low-latency streaming with partial segments, preload hints, delta updates and
   blocking playlist reload
 - Discontinuity
 - ISO-BMFF / MP4 / CMAF support
 - MPEG-2 TS support
 - WebVTT and TTML
 - CEA-608/708 captions
 - Encrypted content with PlayReady and Widevine
 - Encrypted content with FairPlay (Safari on macOS and iOS 9+ only)
 - Key rotation
 - Raw AAC, MP3, AC-3 and EC-3 (without an MP4 container)
 - I-frame-only playlists with mjpg codec for thumbnails
 - #EXT-X-IMAGE-STREAM-INF for thumbnails


## MPEG-5 Part2 LCEVC Support

**Only supported on browsers with Media Source Extensions SourceBuffer support**

 - MPEG-5 Part2 LCEVC decoding support (decoding provided by [lcevc_dec.js][], must be
   separately included)

 - Integration documentation : [docs](docs/design/lcevc-integration.md)

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

|Browser   |Widevine  |PlayReady|FairPlay |ClearKey⁶ |
|:--------:|:--------:|:-------:|:-------:|:--------:|
|Chrome¹   |**Y**     | -       | -       |**Y**     |
|Firefox²  |**Y**     | -       | -       |**Y**     |
|Edge³     | -        |**Y**    | -       | -        |
|Edge Chromium|**Y**     |**Y**    | -       |**Y**     |
|Safari    | -        | -       |**Y**    | -        |
|Opera     |untested⁵ | -       | -       |untested⁵ |
|Chromecast|**Y**     |**Y**    | -       |untested⁵ |
|Tizen TV  |**Y**     |**Y**    | -       |untested⁵ |
|WebOS⁷    |untested⁷ |untested⁷| -       |untested⁷ |
|Xbox One  | -        |**Y**    | -       | -        |
|Playstation 4⁷| -        |untested⁷| -       |untested⁷ |
|Playstation 5⁷| -        |untested⁷| -       |untested⁷ |

Other DRM systems should work out of the box if they are interoperable and
compliant to the EME spec.

NOTES:
 - ¹: Only official Chrome builds contain the Widevine CDM.  Chromium built from
   source does not support DRM.
 - ²: DRM must be enabled by the user.  The first time a Firefox user visits a
   site with encrypted media, the user will be prompted to enable DRM.
 - ³: PlayReady in Edge does not seem to work on a VM or over Remote Desktop.
 - ⁵: These are expected to work, but are not actively tested by the Shaka
   Player team.
 - ⁶: ClearKey is a useful tool for debugging, and does not provide actual
   content security.
 - ⁷: These are expected to work, but are community-supported and untested by
   us.

|Manifest  |Widevine  |PlayReady|FairPlay |ClearKey  |
|:--------:|:--------:|:-------:|:-------:|:--------:|
|DASH      |**Y**     |**Y**    | -       |**Y**     |
|HLS       |**Y**     |**Y**    |**Y** ¹  | -        |
|MSS       | -        |**Y**    | -       | -        |

NOTES:
 - ¹: By default, FairPlay is handled using Apple's native HLS player, when on
   Safari. We do support FairPlay through MSE/EME, however. See the
   `streaming.useNativeHlsOnSafari` configuration value.


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
[text display plugin]: https://nightly-dot-shaka-player-demo.appspot.com/docs/api/shaka.extern.TextDisplayer.html
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


## Content Steering support
Shaka Player supports Content Steering (v1) in DASH.

Content Steering features supported:
- TTL, if missing, the default value is 300 seconds.
- RELOAD-URI, if missing we use the url provided in the manifest as fallback.
- PATHWAY-PRIORITY only HOST replacement

Content Steering features **not** supported:
- PATHWAY-CLONES other replacements than HOST.


## Documentation & Important Links ##

 * [Demo](https://shaka-player-demo.appspot.com)([sources](demo/))
 * [API documentation](https://shaka-player-demo.appspot.com/docs/api/index.html)
 * [Tutorials](https://shaka-player-demo.appspot.com/docs/api/tutorial-welcome.html)
 * [Hosted builds on Google Hosted Libraries](https://developers.google.com/speed/libraries/#shaka-player)
 * [Hosted builds on jsDelivr](https://www.jsdelivr.com/package/npm/shaka-player)
 * [Development roadmap](roadmap.md)
 * [Announcement list](https://groups.google.com/forum/#!forum/shaka-player-users)
     ([join](docs/announcement-list-join-group.png) for infrequent
      announcements and surveys)
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
