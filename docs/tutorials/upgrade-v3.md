# Shaka Upgrade Guide, v3

This is a detailed guide for upgrading from any older version of Shaka Player v3
to the current version.

Shaka Player has been keeping strictly with semantic versioning since v3.0.0, so
upgrades from any older v3 to the current v3 release should be backward
compatible.  Any minor exceptions or nuances will be noted here.


#### What's New?

v3.1:
  - Ads APIs and UI leveraging Google IMA SDK (included separately by app)
  - Low-latency HLS support
  - Built-in CEA 608/708 decoder (mux.js no longer needed for this)
  - Thumbnail track support
  - UI overflow menu items now available as control panel buttons
  - Network stall detection
  - HDR & spatial audio metadata
  - PlayReady support in HLS
  - WebVTT styling and embedded tag support
  - SubViewer (SBV), SubStation Alpha (SSA), LyRiCs (LRC), and SubRip (SRT)
    subtitle format support
  - Forced subtitles
  - Side-loaded subtitles in src= playback mode
  - Custom seekbar UI plugin
  - AirPlay support in UI


#### New Requirements

v3.1:
  - TextDecoder/TextEncoder platform support or polyfill required
    - Affects Xbox One
    - We suggest [https://github.com/anonyco/FastestSmallestTextEncoderDecoder](fastestsmallesttextencoderdecoder/EncoderDecoderTogether.min.js)
  - IE11 support dropped (announced before v3.0)

