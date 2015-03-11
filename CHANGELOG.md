## 1.2.2 (2015-03-11)

Bugfixes:
  - Version 1.2.1 had multiple issues with its version numbering.  These
    are now corrected, but npm requires unique version numbers to publish.
    Version 1.2.1 has been pulled from npm.
    - https://github.com/google/shaka-player/issues/30

Features:
  - Added getAdaptationEnabled() to Player.
    - https://github.com/google/shaka-player/issues/29


## 1.2.1 (2015-03-10)

A roll-up of recent bugfixes, plus a few minor additions to the test app.
Branched from v1.2.0.

Bugfixes:
  - Try to recover from a streaming failure.
    - https://github.com/google/shaka-player/issues/28
  - Ignore spurious error events from the video tag.
  - Update docs WRT content restrictions and folder organization.
  - Fix clearkey errors in Chrome 42+.
  - Fix computation of the number of segments in MpdProcessor.
    - Only affects assets which use SegmentTemplate with a duration attribute.

Test app features:
  - Rename a confusing asset.
  - Add a button to cycle video tracks.
  - Support MPD init data overrides for all DRM schemes.


## 1.2.0 (2015-02-24)

Lots of internal refactoring and bugfixes, and a few new features.

Bugfixes:
  - Buffer eviction no longer causes hangs on seek.
    - https://github.com/google/shaka-player/issues/15
  - Adaptation no longer causes hangs on looping and seeking backward.
    - https://github.com/google/shaka-player/issues/26
  - StreamStats no longer shows null for width and height before adaptation.
    - https://github.com/google/shaka-player/issues/16
  - Content with differing start times for the audio & video streams no longer
    exhibits A/V sync issues.
    - https://github.com/google/shaka-player/issues/17
  - DrmSchemeInfo's suppressMultipleEncryptedEvents flag is now correctly
    honored regardless of the timing of events.
  - Calculations for the $Time$ placeholder in MPD SegmentTemplates has been
    corrected.
  - The test app no longer causes mixed-content errors when served over HTTPS.
  - Small mistakes in URLs and asset names in the test app have been corrected.
  - Windows checkouts now have consistent newline style.
    - https://github.com/google/shaka-player/issues/12
  - Windows build steps documented.
    - https://github.com/google/shaka-player/issues/13

Features:
  - The isTypeSupported polyfill has been removed and all EME APIs have been
    updated to the [Feb 9 2015 EME spec].
    - https://github.com/google/shaka-player/issues/2
  - Gaps and overlaps in SegmentTimeline are no longer treated as an error.
    Large gaps/overlaps will still generate a warning.
    - https://github.com/google/shaka-player/issues/24
  - HDCP-related failures are now translated into error events in Chrome 42+.
    - https://github.com/google/shaka-player/issues/14
  - The MPD Role tag is now supported as a way of indicating the main
    AdaptationSet for the purposes of language matching.
    - https://github.com/google/shaka-player/issues/20
  - More detail added to AJAX error events.
    - https://github.com/google/shaka-player/issues/18
  - The Player now dispatches buffering events.
    - https://github.com/google/shaka-player/issues/25
  - Parser support for the new v1 PSSH layout, including parsing of key IDs.
    - https://github.com/google/shaka-player/issues/19
  - The fullscreen polyfill has been updated and expanded.
  - DashVideoSource refactored to split DASH-independent functionality into the
    generic StreamVideoSource.  This should simplify the implementation of new
    video sources for non-DASH manifest formats.  (Contributions welcome.)
  - Automatic build numbering has been added, with version numbers appearing in
    the test app UI.
  - The library has been published on [npm] and [cdnjs].
  - Release version numbering follows the [semantic versioning spec].

Broken Compatibility:
  - System IDs in PSSH objects are now hex strings instead of raw strings.

[Feb 9 2015 EME spec]: http://goo.gl/5gifok
[npm]: https://www.npmjs.com/package/shaka-player
[cdnjs]: https://cdnjs.com/libraries/shaka-player
[semantic versioning spec]: http://semver.org/


## 1.1 (2015-01-14)

Maintenance release.

Bugfixes:
  - The enabled flag for text tracks is now preserved when switching tracks.
    Player.enableTextTrack() is no longer required after selectTextTrack().
    - https://github.com/google/shaka-player/issues/1
  - The documentation for Player methods enableTextTrack, setPreferredLanguage,
    and getCurrentResolution has been corrected.
    - https://github.com/google/shaka-player/issues/3
    - https://github.com/google/shaka-player/issues/4
    - https://github.com/google/shaka-player/issues/6
  - The AbrManager class is now correctly destroyed.
    - https://github.com/google/shaka-player/issues/5
  - Clearkey support for Chrome 41+ has been fixed.
    - https://github.com/google/shaka-player/issues/8
  - A new polyfill has been added to compensate for Chrome 41+'s removal of
    MediaKeys.isTypeSupported.
    - https://github.com/google/shaka-player/issues/7
  - Several unused internal methods have been removed from the codebase.
  - Fixed a failing assertion in one of the MediaKeys polyfills.
  - Fixed failing code coverage analysis and related parse errors in several
    tests.
  - Fixed support for MPDs with SegmentTemplate@duration and
    MPD@mediaPresentationDuration, but no Period@duration attribute.
    - https://github.com/google/shaka-player/issues/9

Features:
  - Tests are now checked for style.
  - Tests have been expanded to increase coverage and exercise more Player
    features:
    - playback rate
    - stats
    - language preference
    - license restrictions
    - WebM/VP9
    - error events
  - Integration tests now run much faster.
  - MediaKeys polyfills have received minor updates to improve compatibility
    with Chrome 41.
  - New sample assets and code in app.js to demonstrate how to use a PSSH from
    an MPD to override what's in the content itself.

Broken Compatibility:
  - None!


## 1.0 (2014-12-19)

First public release.

Bugfixes:
  - Text tracks are no longer ignored in MPD manifests.
  - Adaptation decisions are now quicker and more reliable.
    - (This bug was more noticeable on faster internet connections.)
  - Playback no longer gets "stuck" on certain content.
  - Playback no longer gets "stuck" after certain seek patterns.
  - Player get/select/enable methods can now be called without a video source.
  - A \<video\> tag's "videoWidth"/"videoHeight" attributes now update
    correctly on Chrome >= 40.
  - Manual adaptation while paused no longer unpauses the video.
  - Credentials can now be used on cross-domain license requests.
  - Range headers are no longer sent for all segment requests.
    - (This fixes issues with IIS.)
  - A missing declaration of getVideoPlaybackQuality() has been added.
  - The compiled code no longer pollutes the global namespace.
  - DASH manifests using \<SegmentList\> are now parsed correctly.
  - Formatting has been fixed in the "Shaka Player Development" tutorial.

Features:
  - The Player is now reusable.  You can call load() multiple times without
    calling destroy().
  - The JS linter is now included in sources, fixing compatibility issues
    between versions.
  - The test suite now includes playback integration tests.
  - The Player has been updated to support the 01 Dec 2014 draft of the EME
    specification.
  - The loader in load.js no longer makes assumptions about app.js.  You can
    now use load.js to bootstrap other applications.
  - The test app now uses less screen real estate.
  - All custom events have been documented, and a new tutorial has been added
    to demonstrate how they can be used.
  - The Player now has a support-check API to determine if the browser has all
    necessary features for playback.
  - Sample code in the tutorials is now marked up to highlight changes from the
    previous sample.
  - Code coverage in unit tests has been increased.
  - Flakiness in unit tests has been reduced.
  - DASH manifests using \<SegmentTemplate\> without a segment index or segment
    timeline are now supported.
  - The DASH "presentationTimeOffset" attribute is now supported.

Broken Compatibility:
  - ContentProtectionCallback no longer takes a "mimeType" argument.
  - DrmSchemeInfo constructor no longer takes a "mimeType" argument.
  - DrmSchemeInfo constructor's "initData" argument is now an object with
    fields instead of a Uint8Array.
  - DrmSchemeInfo now takes a "withCredentials" argument.
  - lib.js has been renamed to shaka-player.compiled.js.


## 0.1b (2014-11-21)

Private beta release.

