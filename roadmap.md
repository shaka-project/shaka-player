# Shaka Player Roadmap

This doc shows all past and planned future milestones for Shaka Player, with
brief details about the goals and rough dates of each milestone.  This is not a
comprehensive list of features or fixes for each release.  For that, see
CHANGELOG.md.

The goals of future milestones are fluid until we begin that development cycle,
so the exact milestone for future features is not pre-determined.

Candidate features for future release cycles:
 - Background fetch for offline storage
   https://github.com/shaka-project/shaka-player/issues/879
 - A method to stitch together clips
   https://github.com/shaka-project/shaka-player/issues/764
 - CMCD v2

v5.0
 - Conversion to Typescript (Smaller, more modular binary)
 - Remove shaka.cast APIs, have UI talk directly to generic receivers
   https://github.com/shaka-project/shaka-player/issues/4214

v4.15 - 2025 Q2
  TBD

=====

v4.14 - 2025 Q1
 - Time ID3, emsg, and metadata events to the presentation timeline
   https://github.com/shaka-project/shaka-player/issues/7556
 - New API for audio: `getAudioTracks` and `selectAudioTrack`
   https://github.com/shaka-project/shaka-player/issues/3544
 - DASH: LCEVC Dual track support

v4.13 - 2025 Q1
 - WisePlay DRM support
 - Support for multiple robustness levels in drm
 - Clearkey download support
 - Stop setting playbackRate to 0 to control buffering state when streaming.rebufferingGoal = 0
   https://github.com/shaka-project/shaka-player/issues/7602
 - Use MSE clearLiveSeekableRange and setLiveSeekableRange when available
   https://github.com/shaka-project/shaka-player/issues/3153

v4.12 - 2024 Q4
 - Performance improvements
 - HLS - Make dummy streams for tags representing muxed audio
   https://github.com/shaka-project/shaka-player/issues/5836
 - Enable AirPlay in MSE
   https://github.com/shaka-project/shaka-player/issues/5022
 - DASH compatibility with FairPlay

v4.11 - 2024 Q3
 - HLS: EXT-X-START support
 - HLS: EXT-X-I-FRAME-STREAM-INF support
 - Basic support of VAST and VMAP without IMA (playback without tracking)
 - DASH: DVB Fonts
 - TTML: IMSC1 (CMAF) image subtitle
 - Render native cues using text displayer
   https://github.com/shaka-project/shaka-player/issues/2585

v4.10 - 2024 Q3
 - HLS support for EXT-X-DATERANGE
   https://github.com/shaka-project/shaka-player/issues/3523
 - HLS interstitials
   https://github.com/shaka-project/shaka-player/issues/3364

v4.9 - 2024 Q2
 - DASH patch manifests
   https://github.com/shaka-project/shaka-player/issues/2228
 - DASH: MPD chaining
   https://github.com/shaka-project/shaka-player/issues/3926
 - Support CS on devices that don't support multiple media elements
   https://github.com/shaka-project/shaka-player/issues/2792

v4.8 - 2024 Q2
 - Preload API
   https://github.com/shaka-project/shaka-player/issues/880
 - AES-256 and AES-256-CTR (HLS)
   https://github.com/shaka-project/shaka-player/issues/6001
 - Detect maximum HW resolution automatically on some platforms
 - UI support for VR content

v4.7 - 2023 Q4
 - Common Media Server Data (CMSD)
   https://github.com/shaka-project/shaka-player/issues/5890
 - DASH: Handle mixed-codec variants
   https://github.com/shaka-project/shaka-player/issues/5961
 - Allow Media Source Recoveries
 - UI: Add double tap to forward/rewind in the video
   https://github.com/shaka-project/shaka-player/issues/3357
 - Improve npm package size
   https://github.com/shaka-project/shaka-player/issues/2172

v4.6 - 2023 Q4
 - Content Steering
   https://github.com/shaka-project/shaka-player/issues/5704
 - New DASH protocol for Low Latency.
 - ManagedMediaSource
   https://github.com/shaka-project/shaka-player/issues/5271
 - Add thumbnails support in src=
 - Remove state engine

v4.5 - 2023 Q4
 - Built-in transmuxer support for muxed content streams (audio+video)
 - Built-in transmuxer support for H265 streams
 - Remove optional mux.js dependency
 - Codec switching
   https://github.com/shaka-project/shaka-player/issues/1528
 - AES-128 in DASH.
   https://github.com/shaka-project/shaka-player/issues/5622
 - AWS Elemental MediaTailor

v4.4 - 2023 Q3
 - Built-in transmuxer for common cases, no mux.js required:
   - Raw AAC, AC3, or EC3 to MP4 container
   - AAC, AC3, EC3, MP3, or H264 in TS to MP4 container
   - MP3-in-TS to raw MP3
 - Ads API improvements
 - CEA parser for TS
 - HLS support for non-sequence mode (as we had in v3)
 - Partial support for large timestamps
 - UI support for thumbnails on seek
 - Microsoft SmoothStreaming support
 - Segment prefetch
 - Low latency improvements

v4.3 - 2022 Q4
 - Support ID3 tags in mp4
   https://github.com/shaka-project/shaka-player/issues/3351
 - Lazy-load HLS playlists on adaptation
   https://github.com/shaka-project/shaka-player/issues/1936
 - HLS key rotation
   https://github.com/shaka-project/shaka-player/issues/741

v4.2 - 2022 Q3
 - Automatic ABR quality restrictions based on size
   https://github.com/shaka-project/shaka-player/issues/2333
 - HLS support for AES-128 encryption
   https://github.com/shaka-project/shaka-player/issues/850

v4.1 - 2022 Q2
 - HLS support for EXT-X-GAP
   https://github.com/shaka-project/shaka-player/issues/1308
 - Temporarily disable the active variant after `HTTP_ERROR`
   https://github.com/shaka-project/shaka-player/issues/1542

v4.0 - 2022 Q2
 - MSE support for FairPlay
   https://github.com/shaka-project/shaka-player/issues/3346
 - Support containerless formats
   https://github.com/shaka-project/shaka-player/issues/2337

v3.3 - 2022 Q1
 - Common Media Client Data (CMCD) logging support
   https://github.com/shaka-project/shaka-player/issues/3619
 - Non-linear IMA CS ads
   https://github.com/shaka-project/shaka-player/pull/3639

v3.2 - 2021 Q3
 - MediaCapabilities to make performance-based decisions
   https://github.com/shaka-project/shaka-player/issues/1391
 - Configurable key-system priority
   https://github.com/shaka-project/shaka-player/issues/3002
 - Codec order preferences
   https://github.com/shaka-project/shaka-player/issues/2179

v3.1 - 2021 Q2
 - Low-latency live (LL-HLS, LL-DASH)
   https://github.com/shaka-project/shaka-player/issues/1525
 - Own CEA parser, use mux.js only for TS
   https://github.com/shaka-project/shaka-player/issues/2648
 - Thumbnail tracks
   DASH: https://github.com/shaka-project/shaka-player/issues/559
   HLS: https://github.com/shaka-project/shaka-player/issues/2429

v3.0 - 2020 Q2
 - Code health improvements
 - Conversion to ES6
 - Isolate DASH periods to the DASH parser
 - HLS discontinuity support
 - IMA ad SDK integration
 - Ad controls in the UI
 - Concurrent Storage operations

v2.5 - 2019 Q2
 - Video controls UI API
 - FairPlay & iOS support
 - CEA captions in HLS/CMAF and DASH w/ mux.js
 - Single-file playback
 - DASH drift tolerance

v2.4 - 2018 Q2
 - TTML and VTT regions
 - CEA captions in HLS/TS
 - Attach/detach API

v2.3 - 2017 Q4
 - HLS live
 - Transmux TS w/ mux.js
 - NetworkInformation API to improve bandwidth estimates
 - ES6 transition begins

v2.2 - 2017 Q3
 - HLS event-type playlists
 - TextDisplayer interface
 - DASH xlink support

v2.1 - 2017 Q2
 - HLS VOD, clear & Widevine only, no CEA
 - DASH trick mode tracks
 - Async network filters

v2.0 - 2016 Q3
 - Multi-period DASH
 - Chromecast API
 - TTML, VTT-in-MP4, and TTML-in-MP4
 - Safari, Firefox, & Opera support
 - Plugin system (manifest parsers, network filters, text parsers)
 - DASH emsg box support
 - DASH IPR support

v1.6 - 2015 Q4
 - IE11, Edge, & PlayReady support
 - Chromecast added to demo app

v1.5 - 2015 Q3
 - Unified configuration system
 - Multiple DASH BaseURL elements for failover
 - Side-loaded text streams

v1.4 - 2015 Q3
 - Code health release
 - DASH Location element support
 - Buffering config API
 - License preprocessing API

v1.3 - 2015 Q2
 - DASH live
 - Offline playback

v1.2 - 2015 Q1
 - DASH Role element support

v1.1 - 2015 Q1
 - EME API updates

v1.0 - 2014 Q4
 - DASH VOD (MP4 & WebM)
 - VTT subtitles, rendered by the browser
 - Widevine support
