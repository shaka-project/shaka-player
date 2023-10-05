# Shaka Player Roadmap

This doc shows all past and planned future milestones for Shaka Player, with
brief details about the goals and rough dates of each milestone.  This is not a
comprehensive list of features or fixes for each release.  For that, see
CHANGELOG.md.

The goals of future milestones are fluid until we begin that development cycle,
so the exact milestone for future features is not pre-determined.

Candidate features for future release cycles:
 - Official TypeScript defs, generated from source
   https://github.com/shaka-project/shaka-player/issues/1030
 - Background fetch for offline storage
   https://github.com/shaka-project/shaka-player/issues/879
 - Smaller, more modular binary

v4.6 - 2024 Q1
 - Content Steering
   https://github.com/shaka-project/shaka-player/issues/5704
 - Preload API
   https://github.com/shaka-project/shaka-player/issues/880
 - New DASH protocol for Low Latency.
 - ManagedMediaSource
   https://github.com/shaka-project/shaka-player/issues/5271

=====

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
