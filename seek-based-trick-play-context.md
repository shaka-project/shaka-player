# Seek-Based Trick Play — Session Context

## Goal
Decouple I-frame track selection from `trickPlay()` and implement seek-based trick play using repeated `seek()` operations instead of `playbackRate` manipulation. This provides universal platform support (WebOS, Tizen) and prevents buffer-exhaustion stalls.

## Why
1. **Buffer exhaustion**: Speed-based trick play drains the buffer faster than segments can be fetched → `setBuffering(true)` forces rate to 0 → playback stalls
2. **Platform limitations**: WebOS/Tizen don't reliably support `playbackRate > 1`
3. **Coupling**: `trickPlay()` atomically changes BOTH speed AND I-frame track — impossible to use one without the other

## Architecture (Implemented)

### Core Design
- **Media element stays paused** during trick play → no buffer consumption
- **I-frame track activated independently** via existing `useTrickPlayTrackIfAvailable(true)`
- **Adaptive step sizing**: Controller measures seek-to-render latency (EMA), computes `stepSize = |rate| × smoothedLatency`
  - Low latency → small steps → many frames rendered
  - High latency → large steps → fewer frames, but **every frame renders**
- **Sequential seek pattern**: seek → wait for browser `seeked` event → next step (no blind intervals)
- **Safety timeout** (5s default): if `seeked` never fires, treats timeout as measured latency and advances

### Key Integration Point
`StreamingEngine.seeked()` — during seek-based trick play:
- Iterator is **always reset** (so fetch direction follows seek direction)
- Buffer is **only cleared when position is NOT already buffered** (rewind through fetched I-frames renders instantly)
- `stopFetchingOnPause` is **bypassed** when `isSeekBasedTrickPlayActive()` returns true

## Files Created
- `lib/media/seek_based_trick_play_controller.js` — Core controller class

## Files Modified (with what was changed)

### `lib/player.js`
- Added `goog.require('shaka.media.SeekBasedTrickPlayController')`
- Added member fields: `seekBasedTrickPlayController_`, `trickPlaySeekedHandler_`, `wasMutedBeforeSeekBasedTrickPlay_`
- Cleanup in `destroy()` (~line 1234) and `unload_()` (~line 1595)
- `getPlaybackRate()` returns seek-based rate when active
- `trickPlay()` delegates to `seekBasedTrickPlay()` when `config.streaming.seekBasedTrickPlay.enabled`
- `trickPlay(1)` with seek-based enabled calls `cancelSeekBasedTrickPlay()` (restore normal track)
- `cancelTrickPlay()` delegates to `cancelSeekBasedTrickPlay()` when active
- New methods: `seekBasedTrickPlay(rate)`, `cancelSeekBasedTrickPlay()`, `isSeekBasedTrickPlayActive()`, `getSeekBasedTrickPlayRate()`
- `onRateChange_()` early-returns when seek-based trick play active (prevents spurious native events)
- `seekBasedTrickPlay()`:
  - Pauses video, mutes audio (stashes previous mute state)
  - Activates I-frame track via `useTrickPlayTrackIfAvailable(true)`
  - Creates controller with harness (getPresentationTime, getSeekRange, getSeekInterval, getMaxSeekWaitTime, seekTo, onBoundaryReached)
  - `seekTo` harness: sets `video.currentTime` + calls `streamingEngine_.seeked()`
  - Registers `seeked` listener on video element → `controller.onSeekComplete()`
  - Always re-pauses video on every call (UI play() before trickPlay() guard)
  - Dispatches TrickPlayStarted/TrickPlayRateChanged + RateChange events
- `cancelSeekBasedTrickPlay()`:
  - Stops controller, removes seeked listener
  - Restores normal track via `useTrickPlayTrackIfAvailable(false)`
  - Restores mute state, calls `video.play()`
  - Dispatches TrickPlayStopped + RateChange events

### `lib/media/streaming_engine.js`
- `PlayerInterface` typedef: added `isSeekBasedTrickPlayActive: function():boolean`
- `seeked()` (~line 953): `isSeekTrickPlay` flag → always reset iterator during trick play; only clear buffer when NOT buffered
- `update_()` → `stopFetchingOnPause` bypass: `!this.playerInterface_.isSeekBasedTrickPlayActive()`
- PlayerInterface construction: wired `isSeekBasedTrickPlayActive: () => this.isSeekBasedTrickPlayActive()`

### `externs/shaka/player.js`
- Added `SeekBasedTrickPlayConfiguration` typedef: `{ enabled, seekInterval, maxSeekWaitTime }`
- Added `seekBasedTrickPlay` field to `StreamingConfiguration`

### `lib/util/player_configuration.js`
- Default: `seekBasedTrickPlay: { enabled: true, seekInterval: 0.25, maxSeekWaitTime: 5 }`
- NOTE: `enabled` default is `true` currently (user may want `false` as original plan stated)

### `lib/util/fake_event.js`
- Added: `TrickPlayStarted`, `TrickPlayStopped`, `TrickPlayRateChanged` to `EventName` enum

### `lib/device/tizen.js`
- `adjustConfig()`: `config.streaming.seekBasedTrickPlay.enabled = true`

### `lib/device/webos.js`
- `adjustConfig()`: `config.streaming.seekBasedTrickPlay.enabled = true`

### `shaka-player.uncompiled.js`
- Added `goog.require('shaka.media.SeekBasedTrickPlayController')`

### `demo/config.js`
- Added `addSeekBasedTrickPlaySection_()` with enabled toggle, seekInterval, maxSeekWaitTime inputs

## Controller Design (`SeekBasedTrickPlayController`)
- Implements `shaka.util.IReleasable`
- Harness typedef: `{ getPresentationTime, getSeekRange, getSeekInterval, getMaxSeekWaitTime, seekTo, onBoundaryReached }`
- Constants: `INITIAL_LATENCY_ = 0.15`, `EMA_ALPHA_ = 0.3`
- State: `rate_`, `isActive_`, `awaitingFrame_`, `seekTimestamp_`, `smoothedLatency_`, `safetyTimer_`
- `start(rate)`: sets active, resets smoothedLatency, calls `seekStep_()`
- `changeRate(rate)`: updates rate; on direction change resets latency and immediately re-seeks
- `stop()`: deactivates, cancels pending
- `onSeekComplete()`: measures latency, updates EMA, calls next `seekStep_()` immediately (no artificial delay)
- `seekStep_()`: computes adaptive step = `|rate| × smoothedLatency` (floored at seekInterval), clamps to seekRange, seeks, starts safety timer
- `onSafetyTimeout_()`: treats timeout as measured latency → adapts step size → advances

## Issues Fixed During Development
1. **I-frames not rendering**: Changed from `tickEvery` (blind interval) to sequential seek→wait→advance pattern
2. **Rate stuck at 2x/-1x**: `getPlaybackRate()` was returning 1 from `playRateController_` instead of seek-based rate → UI buttons couldn't progress through rate array
3. **Video un-paused on rate change**: UI buttons call `video.play()` before `trickPlay()` → added always-re-pause guard
4. **No RateChange event**: Dispatched synthetic `RateChange` events for UI button updates
5. **1x speed didn't cancel**: `trickPlay(1)` with seek-based enabled now calls `cancelSeekBasedTrickPlay()`
6. **Rewind fetching forward segments**: `seeked()` skipped buffer clear when position was buffered → always reset iterator during trick play, only clear buffer when NOT buffered
7. **Next stream broken**: Controller held stale closures → added release in `unload_()`
8. **Rewind sluggish**: Changed from force-clear-always to smart buffer+iterator handling; added rate-adaptive delay → then finally adaptive step sizing

## Current State (What User Has Tested)
- Fast-forward: Working well with I-frame track + adaptive step sizing
- Rewind: Was sluggish due to segment download latency — last fix used adaptive step sizing approach
- User undid the latest adaptive step sizing changes to controller, player, and streaming engine
- The FILES CURRENTLY HAVE the adaptive step sizing version (user's undo was partial — need to verify exact state on next session)

## Remaining Concerns (From Last User Message Before Context Request)
None explicitly stated — user asked for context capture after the adaptive step sizing solution was presented.

## Key Patterns to Follow
- Closure Compiler: `goog.provide`/`goog.require`, JSDoc types, ADVANCED_OPTIMIZATIONS
- Implements `shaka.util.IReleasable` interface
- Timer: `shaka.util.Timer` (not raw setInterval)
- Events: `shaka.util.FakeEvent.EventName` enum + `shaka.Player.makeEvent_()`
- Config: typedef in `externs/shaka/player.js`, defaults in `lib/util/player_configuration.js`
- Device overrides in `lib/device/*.js` `adjustConfig()` method
