# Shaka Player Upgrade Guide

If you are upgrading from **v1 or v2**, these releases are no longer supported,
and upgrade guides are no longer maintained.  You can use these old upgrades
guides to upgrade in stages:

 - {@link https://v2-4-7-dot-shaka-player-demo.appspot.com/docs/api/tutorial-upgrade.html Upgrade to v2.4}
 - {@link https://v2-5-23-dot-shaka-player-demo.appspot.com/docs/api/tutorial-upgrade-v2-4.html Upgrade v2.4 => v2.5}
 - {@link https://v3-0-15-dot-shaka-player-demo.appspot.com/docs/api/tutorial-upgrade-v2-5.html Upgrade v2.5 => v3.0}

Since v3.0, Shaka Player has been following semantic versioning.  (The
IE11 deprecation announced before v3.0 happened in v3.1, which technically
breaks semantic versioning guarantees.  It is the only intentional exception.)

Upgrading from any v3 release to a newer v3 release should be backward
compatible.  The same is true of all major version numbers (v4 => v4, etc).

Here is a summary of breaking changes that might require upgrades to your
application:


## v3.1

  - New dependencies:
    - TextDecoder/TextEncoder platform support or polyfill required (affects
      Xbox One, but not evergreen browsers); we suggest the polyfill
      [https://github.com/anonyco/FastestSmallestTextEncoderDecoder](fastestsmallesttextencoderdecoder/EncoderDecoderTogether.min.js)
      Fallback included by default in v4.2

  - Support removed:
    - IE11 support removed


## v4.0

  - Support removed:
    - Older TVs and set-top boxes that do not support MediaSource sequence mode
      can no longer play HLS content (since we now use sequence mode for that)
    - Support for iOS 12 and Safari 12 has been removed

  - Configuration changes:
    - `manifest.dash.defaultPresentationDelay` has been replaced by
      `manifest.defaultPresentationDelay` (deprecated in v3.0.0)
    - Configuration of factories should be plain factory functions, not
      constructors; these will not be invoked with `new` (deprecated in v3.1.0)
    - `drm.initDataTransform` now defaults to a no-op
    - `streaming.smallGapLimit` and `streaming.jumpLargeGaps` have been removed;
      all gaps will now be jumped
    - `manifest.hls.useFullSegmentsForStartTime` has been removed; this setting
      is no longer necessary, as we no longer fetch segments for start times in
      the HLS parser

  - Player API changes:
    - `shaka.Player.prototype.addTextTrack()` has been replaced by
      `addTextTrackAsync()`, which returns a `Promise` (deprecated in v3.1.0)

  - UI API changes:
    - `shaka.ui.TrackLabelFormat` has been renamed to
      `shaka.ui.Overlay.TrackLabelFormat` (deprecated in v3.1.0)
    - `shaka.ui.FailReasonCode` has been renamed to
      `shaka.ui.Overlay.FailReasonCode` (deprecated in v3.1.0)

  - Offline API changes:
    - `shaka.offline.Storage.prototype.store()` returns `AbortableOperation`
      instead of `Promise`; callers should change `.then()` to
      `.promise.then()` and `await rv` to `await rv.promise` (deprecated in
      v3.0.0)
    - `shaka.offline.Storage.prototype.getStoreInProgress()` has been removed;
      concurrent operations are supported since v3, so callers don't need to
      check this (deprecated in v3.0.0)

  - Utility API changes:
    - `shaka.util.Uint8ArrayUtils.equal` has been replaced by
      `shaka.util.BufferUtils.equal`, which can handle multiple types of
      buffers (deprecated in v3.0.0)

  - Manifest API changes:
    - `shaka.media.SegmentIndex.prototype.destroy()` has been replaced by
      `release()`, which is synchronous (deprecated in v3.0.0)
    - `shaka.media.SegmentIterator.prototype.seek()`, which mutates the
      iterator, has been replaced by
      `shaka.media.SegmentIndex.getIteratorForTime()` (deprecated in v3.1.0)
    - `shaka.media.SegmentIndex.prototype.merge()` has become private; use
      `mergeAndEvict()` instead (deprecated in v3.2.0)

  - Plugin changes:
    - `AbrManager` plugins must implement the `playbackRateChanged()` method
      (deprecated in v3.0.0)
    - `shaka.extern.Cue.prototype.spacer` has been replaced by the more
      clearly-named `lineBreak` (deprecated in v3.1.0)
    - `IUIElement` plugins must have a `release()` method (not `destroy()`)
      (deprecated in v3.0.0)

## v5.0 (unreleased)

  - Configuration changes:
    - `streaming.forceTransmuxTS` has been renamed to `streaming.forceTransmux`
      (deprecated in v4.3.0)

  - Plugin changes:
    - `Transmuxer` plugins now has three new parameters in `transmux()` method.
