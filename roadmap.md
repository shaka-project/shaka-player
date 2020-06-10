# Shaka Player Roadmap

This doc shows all past and planned future milestones for Shaka Player, with
brief details about the goals and rough dates of each milestone.  This is not a
comprehensive list of features or fixes for each release.  For that, see
CHANGELOG.md.

The goals of future milestones are fluid until we begin that development cycle,
so the exact milestone for future features is not pre-determined.

Candidate features for future release cycles
 - Low-latency live (LHLS, equivalent for DASH)
 - MediaCapabilities to make performance-based decisions
 - Codec-switching
 - Background fetch for offline storage
 - Preload API
 - Thumbnail tracks
 - Own CEA parser, use mux.js only for TS
 - Smaller, more modular binary

=====

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
