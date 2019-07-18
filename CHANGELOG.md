## 2.5.4 (2019-07-19)

Bugfixes:
  - Default to transparent SMPTE-TT subtitle background
    - https://github.com/google/shaka-player/pull/2033
  - Fix seek bar on iOS
    - https://github.com/google/shaka-player/issues/1918
    - https://github.com/google/shaka-player/pull/2036
  - Allow whitespace in TTML subtitles
    - https://github.com/google/shaka-player/issues/2028
    - https://github.com/google/shaka-player/pull/2030
  - Fix play button positioning on IE 11
    - https://github.com/google/shaka-player/issues/2026
  - Match UI style with Chrome's native controls
  - Stop constant spurious time updates in UI
  - Fix volume slider jumping around while casting
    - https://github.com/google/shaka-player/issues/1913
  - Fix missing seek bar in short VOD clips
    - https://github.com/google/shaka-player/issues/2018
  - Fix demo app in Firefox private mode
    - https://github.com/google/shaka-player/issues/1926
  - Ignore case in MIME type checks
    - https://github.com/google/shaka-player/issues/1991
  - Fix problems with casting
    - https://github.com/google/shaka-player/issues/1948

New Features:
  - Add command-line arg to change the test timeout.


## 2.5.3 (2019-07-03)

Bugfixes:
  - Fix DASH bug when ignoring minBufferTime
    - https://github.com/google/shaka-player/issues/2015
  - Avoid changing variant when switching text lang
    - https://github.com/google/shaka-player/issues/2010
  - Work around platform bug when seeking to end
    - https://github.com/google/shaka-player/issues/1967
  - Allow apps to extend shaka.ui.Element
    - https://github.com/google/shaka-player/issues/2011
  - Fix bug when adding text streams while not streaming text
    - https://github.com/google/shaka-player/issues/1938
  - Fix edge case when switching text in multi-Period content
    - https://github.com/google/shaka-player/issues/1774
  - Fix playback rate bug on IE11
  - Make fast forwarding work when video is paused
    - https://github.com/google/shaka-player/issues/1801
  - Fix stack overflow in StringUtils on some platforms
    - https://github.com/google/shaka-player/issues/1985
    - https://github.com/google/shaka-player/issues/1994
  - Fix reading customData from standard Cast LOAD message
    - https://github.com/google/shaka-player/issues/1989

Docs:
  - Fix constant name in UI tutorials
    - https://github.com/google/shaka-player/issues/2005
  - Update build output name in docs
    - https://github.com/google/shaka-player/issues/1929

New Features:
  - Use trick play for fast forward when browser doesn't support high
    playbackRate
    - https://github.com/google/shaka-player/issues/1957


## 2.5.2 (2019-06-10)

Bugfixes:
  - Avoid event listener leaks in the UI
    - https://github.com/google/shaka-player/issues/1924
  - Fix style errors in TextDisplayer
    - https://github.com/google/shaka-player/issues/1852
    - https://github.com/google/shaka-player/issues/1955
  - Show spinner when buffering even if other controls are hidden
    - https://github.com/google/shaka-player/issues/1921
  - Don't recreate controls object on configure() calls
    - https://github.com/google/shaka-player/issues/1948
  - Fix UI compilation on Windows
    - https://github.com/google/shaka-player/issues/1965

New Features:
  - Add originalUri as a property on shaka.extern.Response
    - https://github.com/google/shaka-player/issues/1971
    - https://github.com/google/shaka-player/pull/1972

Demo App:
  - Fix close button styling in compiled mode
  - Fix config settings applied before playback begins
    - https://github.com/google/shaka-player/issues/1976
  - Change the style of the download/delete button
  - Fix demo error display for large errors
  - Improve cvox error check
  - Switch to using tippy.js for tooltips

Docs:
  - Add a public roadmap document
    - https://github.com/google/shaka-player/blob/master/roadmap.md


## 2.5.1 (2019-05-20)

New Features:
  - Inline external CSS for quicker load
    - You no longer need to include Material Design Icons font in your app
  - Use clean-css plugin in less.js to minify CSS

Bugfixes:
  - Deprecate ui.getPlayer for controls.getPlayer
    - https://github.com/google/shaka-player/issues/1941
  - Fix switching text displayer mid-playback
  - Improve french translations
    - https://github.com/google/shaka-player/pull/1944
  - Improve logic for aborting network requests
  - Fix initial bandwidth estimate on Chrome
  - Upgrade mux.js and use minified version
  - Fix exception on network retry
    - https://github.com/google/shaka-player/issues/1930
  - Fix API-based UI setup with default config
  - Allow two-argument configure() calls for UI and offline
  - Add missing export on ui.Overlay.getConfiguration
  - Various improvements in test reliability
  - Various fixes for compatibility with newer compiler versions

Demo App:
  - Fix asset card highlight on reload
  - Fix reconnection to cast sessions on reload
    - https://github.com/google/shaka-player/issues/1948
  - Fix handling of error events
  - Fix centering of asset card titles
  - Move download button to the corner of asset cards
  - Add WebP variants for asset icons to reduce size by 88%
  - Optimize app load time by pre-connecting to external origins
  - Defer creating tab contents until shown
  - Make name field in custom assets more permissive
  - Add link to support page in footer
  - Allow demo to load custom assets from hash
  - Do not disable controls on startup
  - Added missing config values
  - Catch certificate errors in demo
    - https://github.com/google/shaka-player/issues/1914
  - Let demo load even if storage fails to load
    - https://github.com/google/shaka-player/issues/1925
  - Re-load current asset if page reloads
  - Fix unsupported button tooltips


## 2.5.0 (2019-05-08)

**The UI is now out of beta!  Use shaka-player.ui.js and see the UI tutorials.**

Core Bugfixes:
  - Fix missing variants in HLS
    - https://github.com/google/shaka-player/issues/1908
  - Ignore manifest-provided license servers if application-provided servers
    are configured
    - https://github.com/google/shaka-player/issues/1905
  - Fix range header regression that broke IIS compatibility
  - Fix initial display of captions based on language preferences
    - https://github.com/google/shaka-player/issues/1879
  - Ignore duplicate codecs in HLS
    - https://github.com/google/shaka-player/issues/1817
  - Reject AES-128 HLS content with meaningful error
    - https://github.com/google/shaka-player/issues/1838
  - Fix React Native createObjectURL polyfill incompatibility
    - https://github.com/google/shaka-player/issues/1842
    - https://github.com/google/shaka-player/pull/1845
  - Dolby Vision fixes for Chromecast
    - https://github.com/google/shaka-player/pull/1844
  - Fix redundant initialization of MediaSource
    - https://github.com/google/shaka-player/issues/1570
  - Fix stalls on WebOS
    - https://github.com/google/shaka-player/issues/1704
    - https://github.com/google/shaka-player/pull/1820
  - Fix missing require for SimpleTextDisplayer
    - https://github.com/google/shaka-player/issues/1819
  - Fix broken version definition in compiled build
    - https://github.com/google/shaka-player/issues/1816
  - Fix video reloading on audio language change
    - https://github.com/google/shaka-player/issues/1714

UI Bugfixes:
  - Fix missing resolution menu in UI after playing audio-only content
  - Fix pointer cursor on UI spacer
  - Do not show PIP button if not allowed
  - Fix hiding captions in UI text displayer
    - https://github.com/google/shaka-player/issues/1893
  - Fix UI text displayer positioning on IE
  - Make live stream timecode accessible to screen readers in the UI
    - https://github.com/google/shaka-player/issues/1861
  - Fix ARIA pressed state for button in text selection menu
  - Show picture-in-picture btn only when the content has video
    - https://github.com/google/shaka-player/issues/1849
  - Fix multiline captions in UI text displayer
  - Fix display of cast button in UI
    - https://github.com/google/shaka-player/issues/1803
  - Fix conflict between PiP and fullscreen
  - Fix cast receiver styling

New Core Features:
  - Abort requests when network downgrading
    - https://github.com/google/shaka-player/issues/1051
  - Add FairPlay support
    - https://github.com/google/shaka-player/issues/382
  - Add native HLS support on iOS and Safari
    - https://github.com/google/shaka-player/issues/997
  - Support src= for single-file playback
    - https://github.com/google/shaka-player/issues/816
    - https://github.com/google/shaka-player/pull/1888
    - https://github.com/google/shaka-player/pull/1898
  - Add 'manifestparsed' event for early access to manifest contents
  - Add 'abrstatuschanged' event to help manage UI state
  - Make manifest redirections sticky for updates
    - https://github.com/google/shaka-player/issues/1367
    - https://github.com/google/shaka-player/pull/1880
  - Track time in "pause" state in stats
    - https://github.com/google/shaka-player/pull/1855
  - Make Stall Detector Configurable
    - https://github.com/google/shaka-player/issues/1839

New UI Features:
  - Add support for UI reconfiguration and layout changes
    - https://github.com/google/shaka-player/issues/1674
  - Add support for custom UI buttons
    - https://github.com/google/shaka-player/issues/1673
  - Add partial support for SMPTE-TT subtitles in UI text displayer
    - https://github.com/google/shaka-player/issues/840
    - https://github.com/google/shaka-player/pull/1859
  - Add PiP support in Safari
    - https://github.com/google/shaka-player/pull/1902


Demo App:
  - Complete redesign of the demo app!
  - Load non-built-in localizations from the server at runtime
    - https://github.com/google/shaka-player/issues/1688
  - Ignore spurious errors from ChromeVox
    - https://github.com/google/shaka-player/issues/1862
  - Don't handle non-app resources in service worker
    - https://github.com/google/shaka-player/issues/1256
    - https://github.com/google/shaka-player/issues/1392

Docs:
  - Document UI events
    - https://github.com/google/shaka-player/issues/1870
  - Update Manifest Parser documentation
  - Clarify track selection callback in offline tutorial
  - Fix jsdoc and markdown formatting of links
  - Add link for Shaka Player Embedded
    - https://github.com/google/shaka-player/issues/1846


## 2.5.0-beta3 (2019-02-20)

New Features:
  - Introduction of Shaka Player UI library! (beta)
    - Load dist/shaka-player.ui.js
    - See tutorial in docs/tutorials/ui.md
  - Add option to disable drift-tolerance feature for certain live streams
    - https://github.com/google/shaka-player/issues/1729
  - Upgrade mux.js to the latest (5.1.0)
  - Support HLS playlists without URI in EXT-X-MEDIA
    - https://github.com/google/shaka-player/pull/1732
  - Add safeSeekOffset to StreamingConfiguration
    - https://github.com/google/shaka-player/issues/1723
    - https://github.com/google/shaka-player/pull/1726
  - Add PlayReady license URL parsing (ms:laurl)
    - https://github.com/google/shaka-player/issues/484
    - https://github.com/google/shaka-player/pull/1644
  - Add support for HLS tags with both value and attributes
    - https://github.com/google/shaka-player/issues/1808
    - https://github.com/google/shaka-player/pull/1810

Bugfixes:
  - Fixed various typos in comments and docs
    - https://github.com/google/shaka-player/pull/1797
    - https://github.com/google/shaka-player/pull/1805
  - Fix CEA timestamps with presentationTimeOffset
  - Fix config-based clock sync for IPR content
  - Fix cast serialization of Uint8Array types
    - https://github.com/google/shaka-player/issues/1716
  - Fix event dispatch when text tracks change
  - Don't include video roles in audio-language-role pairs
    - https://github.com/google/shaka-player/issues/1731
  - Fix MediaSource failures with certain language settings
    - https://github.com/google/shaka-player/issues/1696
  - Fix build paths on Windows
    - https://github.com/google/shaka-player/issues/1700

Docs:
  - Update docs to mention ignoreMinBufferTime
    - https://github.com/google/shaka-player/issues/1547
    - https://github.com/google/shaka-player/issues/1666
  - Document restrictions on large timescales
    - https://github.com/google/shaka-player/issues/1667
  - Various small docs improvements


## 2.4.7 (2019-02-19)

Bugfixes:
  - Reject opus content on Tizen
    - https://github.com/google/shaka-player/issues/1751
  - Fix seekable range on HLS content with non-zero start time
    - https://github.com/google/shaka-player/issues/1602


## 2.4.6 (2019-01-22)

Bugfixes:
  - Fix HLS without URI attribute
    - https://github.com/google/shaka-player/issues/1086
    - https://github.com/google/shaka-player/issues/1730
    - https://github.com/google/shaka-player/pull/1732
  - Handle prereleases of npm and node in build scripts
    - https://github.com/google/shaka-player/issues/1758
  - Fix windows path handling in build scripts
    - https://github.com/google/shaka-player/issues/1759
  - Fix cast receiver errors in getStats
    - https://github.com/google/shaka-player/issues/1760
  - Fix spurious teardown exception on smart TVs
    - https://github.com/google/shaka-player/issues/1728
  - Loosen gap thresholds on Chromecast
    - https://github.com/google/shaka-player/issues/1720
  - Fix support for Safari 12
  - Fix support for relative Location URLs in DASH
    - https://github.com/google/shaka-player/issues/1668
  - Fix compliance issues in IE11 EME polyfill
    - https://github.com/google/shaka-player/issues/1689
  - Fix PlayReady playback on Tizen
    - https://github.com/google/shaka-player/issues/1712
  - Fix chopped playback in MS Edge
    - https://github.com/google/shaka-player/issues/1597
  - Fix assertions when EME sessions expire
    - https://github.com/google/shaka-player/issues/1599
  - Fix relative URIs in HLS
    - https://github.com/google/shaka-player/issues/1664
  - Fix compilation error
    - https://github.com/google/shaka-player/issues/1658
    - https://github.com/google/shaka-player/pull/1660

New Features:
  - Add extended error code for failed license request
    - https://github.com/google/shaka-player/issues/1689

Demo App:
  - Disable offline storage on some assets
    - https://github.com/google/shaka-player/issues/1768
  - Update DASH-IF livesim URLs
    - https://github.com/google/shaka-player/pull/1736


## 2.5.0-beta2 (2018-11-09)

Contains everything in v2.4.5, plus...

Bugfixes:
  - Fix Chromecast receiver id in the demo, broken since v2.5.0-beta
    - https://github.com/google/shaka-player/issues/1656
  - Fix multi-period playback issues introduced in v2.5.0-beta
    - https://github.com/google/shaka-player/issues/1601
  - Fix seekable range with non-zero start
    - https://github.com/google/shaka-player/issues/1602
  - Misc Storage and demo fixes
  - Fix support for restriction changes after playback
    - https://github.com/google/shaka-player/issues/1533
  - Fix TextEngine buffered range calculations
    - https://github.com/google/shaka-player/issues/1562

New Features:
  - Add support for CEA captions in DASH
    - https://github.com/google/shaka-player/issues/1404
  - Set server certificate before Store and Delete
    - https://github.com/google/shaka-player/issues/1623
    - https://github.com/google/shaka-player/pull/1639
  - Allow deferring deleting offline sessions.
    - https://github.com/google/shaka-player/issues/1326
  - Added progress events for Fetch plugin.
    - https://github.com/google/shaka-player/issues/1504
  - Add config field to ignore manifest minBufferTime #1547
    - https://github.com/google/shaka-player/issues/1547
    - https://github.com/google/shaka-player/pull/1581
  - Add support for 'individualization-request' messages in EME
    - https://github.com/google/shaka-player/issues/1565

Docs:
  - Update Language Normalization Documentation


## 2.4.5 (2018-11-09)

Bugfixes:
  - Fix erasure of the database with storage.deleteAll()
  - Fix MediaSource tear down race
  - Fix exception when destroying MediaSourceEngine twice
  - Fix gap jumping test failures on IE/Edge/Tizen
  - Fix stalls on Tizen TV
  - Fix display of external subtitles
    - https://github.com/google/shaka-player/issues/1596
  - Fix test failures on Safari
  - Fix filtering of HLS audio-only content
  - Preserve bandwidth estimate between loads
    - https://github.com/google/shaka-player/issues/1366
  - Retry streaming when we get back online
    - https://github.com/google/shaka-player/issues/1427
  - Fix Storage test contamination
  - Fix advanced DRM settings pollution across key systems
    - https://github.com/google/shaka-player/issues/1524
  - Fix TextEngine buffered range calculations
    - https://github.com/google/shaka-player/issues/1562

New Features:
  - Optimize processXlinks
    - https://github.com/google/shaka-player/issues/1640
  - Add support for Python3 in build scripts
  - Allow new Periods to add EME init data
    - https://github.com/google/shaka-player/issues/1360
  - Add namespace-aware parsing to TTML parser
    - https://github.com/google/shaka-player/issues/1585
  - An external Promise polyfill is no longer required!

Demo App:
  - Show logs prominently in noinput mode
    - https://github.com/google/shaka-player/issues/1610
  - Disable uncompiled mode on browsers without async
  - Restore using Enter key to load asset

Docs:
  - Fix tracks sorting in Offline tutorial sample code
    - https://github.com/google/shaka-player/issues/1608
    - https://github.com/google/shaka-player/pull/1609
  - Add a note about blank receiver IDs
  - Rename 'video' to 'mediaElem' to make it clear that audio elements work, too
    - https://github.com/google/shaka-player/issues/1555

Un-Features:
  - Un-ship VTTRegion support, which is currently broken in Chrome and does more
    harm than good
    - https://github.com/google/shaka-player/issues/1584


## 2.5.0-beta (2018-08-24)

New Features:
  - Drift is now tolerated in DASH live streams
    - https://github.com/google/shaka-player/issues/999
  - Storage can be initialized without Player
    - https://github.com/google/shaka-player/issues/1297
  - DASH Representation IDs are now exposed in a new field in Track
  - A safe margin parameter was added for clearing the buffer
    - https://github.com/google/shaka-player/pull/1154
  - Added 'retry' event to networking engine
    - https://github.com/google/shaka-player/issues/1529
  - Emsg not referenced in MPD will now be ignored
    - https://github.com/google/shaka-player/issues/1548
  - Extra data given for RESTRICTIONS_CANNOT_BE_MET
    - https://github.com/google/shaka-player/issues/1368
  - A mime type option was added to Player.load
  - Added Widevine SAMPLE-AES support in HLS
    - https://github.com/google/shaka-player/issues/1515
  - The |manifestUri| method on Player was changed to |assetUri|
  - Added new request type TIMING for clock sync requests
    - https://github.com/google/shaka-player/issues/1488
    - https://github.com/google/shaka-player/pull/1489

Deprecated:
  - Passing a ManifestParser factory to Player.load is deprecated and support
    will be removed in v2.6. Instead, please register any custom parsers with a
    MIME type, and pass a MIME type instead.  MIME types can also be used to
    force the selection of any built-in manifest parsers.
  - The |manifestUri| method on Player was changed to |assetUri|. The old method
    is deprecated and will be removed in v2.6.


## 2.4.4 (2018-08-23)

Bugfixes:
  - Fix spurious restrictions errors
    - https://github.com/google/shaka-player/issues/1541
  - Don't error when skipping mp4 boxes with bad size
    - https://github.com/google/shaka-player/issues/1535
  - Refactor HttpFetchPlugin to clarify error outcomes
    - https://github.com/google/shaka-player/issues/1519
    - https://github.com/google/shaka-player/pull/1532
  - Avoid assertions about $Time$ when it is not used
  - Stop proxying drmInfo() to reduce cast message sizes
  - Fix compiler renaming in ParsedBox
    - https://github.com/google/shaka-player/issues/1522

Docs:
  - Fixed docs for availabilityWindowOverride
    - https://github.com/google/shaka-player/issues/1530


## 2.4.3 (2018-08-06)

New Features:
  - Add availabilityWindowOverride configuration
    - https://github.com/google/shaka-player/issues/1177
    - https://github.com/google/shaka-player/issues/1307

Bugfixes:
  - Fix repeated download of the same segment in live DASH
    - https://github.com/google/shaka-player/issues/1464
    - https://github.com/google/shaka-player/issues/1486
  - Don't clear buffer with a small gap between playhead and buffer start
    - https://github.com/google/shaka-player/issues/1459
  - Allow CDATA in text nodes.
    - https://github.com/google/shaka-player/issues/1508
  - Skip text AdaptationSets with no segment info
    - https://github.com/google/shaka-player/issues/1484
  - Add error code for side-loaded text with live streams

Demo app:
  - Clarify persistent license error messages

Docs:
  - Update docs for RESTRICTIONS_CANNOT_BE_MET


## 2.3.10 and 2.4.2 (2018-06-29)

Bugfixes:
  - Fix ignored configuration when input is partially invalid (v2.4.2 only)
    - https://github.com/google/shaka-player/issues/1470
  - Silence DRM engine errors for unencrypted assets
    - https://github.com/google/shaka-player/issues/1479
  - Fix infinite seeking with HLS on V1 Chromecasts
    - https://github.com/google/shaka-player/issues/1411
  - Fix module wrapper to work with CommonJS, AMD, ES modules, as well as
    Closure and Electron
    - https://github.com/google/shaka-player/issues/1463
  - Fix TextEngine buffered range calculations

Demo App:
  - Fix custom encrypted assets in the demo app

Docs:
  - Fix generated documentation problems (v2.4.2 only)
  - Move CEA-608/708 to list of supported HLS features (v2.4.2 only)
    - https://github.com/google/shaka-player/pull/1465


## 2.3.9 and 2.4.1 (2018-06-13)

Bugfixes:
  - Default to a maximum of 360p for ABR when saveData == true
    - https://github.com/google/shaka-player/issues/855
  - Make AbrManager restrictions "soft" so they do not fail playback
  - Patch Closure Compiler to fix polyfill+wrapper
    - https://github.com/google/shaka-player/issues/1455
  - Fix assertion spam when merging a period into itself
    - https://github.com/google/shaka-player/issues/1448
  - Upgrade WebDriver module to new W3C protocol, fixes WD tests on Firefox & IE
  - Work around potential hang in transmuxer with multiplexed TS content.
    - https://github.com/google/shaka-player/issues/1449

Demo app:
  - Support clearkey license-servers in the demo UI

Misc:
  - Fix nodejs import (still not a supported environment, but does not throw)
    - https://github.com/google/shaka-player/issues/1445
    - https://github.com/google/shaka-player/pull/1446


## 2.4.0 (2018-05-24)

New features:
  - Support for TTML and VTT regions
    - https://github.com/google/shaka-player/issues/1188
  - Support for CEA captions in TS content
    - https://github.com/google/shaka-player/issues/276
  - A video element is no longer required when `Player` is constructed
    - https://github.com/google/shaka-player/issues/1087
  - New `attach()` and `detach()` methods have been added to `Player` to manage
    attachment to video elements
    - https://github.com/google/shaka-player/issues/1087
  - Allow apps to specify a preferred audio channel count
    - https://github.com/google/shaka-player/issues/1013
  - Live stream playback can begin at a negative offset from the live edge
    - https://github.com/google/shaka-player/issues/1178
  - Add new configure() syntax for easily setting single fields
    - https://github.com/google/shaka-player/issues/763
  - player.configure() returns false if player configuration is invalid
  - Fetch is now preferred over XHR when available
    - https://github.com/google/shaka-player/issues/829
  - Request type now appears in shaka.util.Error data for HTTP errors
    - https://github.com/google/shaka-player/issues/1253

Broken compatibility:
  - A third-party Promise polyfill is now required for IE 11 support
    - https://github.com/lahmatiy/es6-promise-polyfill
    - https://github.com/google/shaka-player/issues/1260
  - Text parser plugins now take a nullable segmentStart in TextContext.  All
    application-specific text-parsing plugins MUST be updated.
  - Text-parsing plugins that produce region information must do so with the new
    CueRegion class.  Any application-specific text-parsing plugins that produce
    region information MUST be updated.
  - TextDisplayer plugins that handle region information must do so with the new
    CueRegion interface.  Any application-specific TextDisplayer plugins that
    handle region information MUST be updated.
  - The API for PresentationTimeline has changed.  Manifest parser plugins that
    use certain PresentationTimeline methods MUST be updated:
    - `setAvailabilityStart()` was renamed to `setUserSeekStart()`.
    - `notifySegments()` now takes a reference array and a boolean called
      `isFirstPeriod`, instead of a period start time and a reference array.

Deprecated:
  - NetworkingEngine.request() now returns an instance of IAbortableOperation
    instead of Promise.  Applications which make application-level requests
    SHOULD update to use the new interface.
    - The old interface will be removed in v2.5.
  - Network scheme plugins now return an instance of IAbortableOperation instead
    of Promise.  Application-specific network scheme plugins SHOULD update to
    the new interface.
    - The old interface will be removed in v2.5.

Demo app:
  - Improve support for custom assets and license servers in demo app URI

Misc:
  - We have started transitioning the code to ES6 and the new JS style guide
    - https://google.github.io/styleguide/jsguide.html


## 2.3.8 (2018-05-23)

Bugfixes:
  - Fix non-default namespace names in DASH
    - https://github.com/google/shaka-player/issues/1438
  - Fix use after destroy() in CastProxy
    - https://github.com/google/shaka-player/issues/1423
  - Fix text track visibility state
    - https://github.com/google/shaka-player/issues/1412
  - Remove licenses when wiping offline storage
    - https://github.com/google/shaka-player/issues/1277
  - Restore backward compatibility for v2.2.x offline storage
    - https://github.com/google/shaka-player/issues/1248

Demo app:
  - Update DASH-IF Big Buck Bunny asset

Docs:
  - Fix typos and formatting
  - Build docs as part of build/all.py
    - https://github.com/google/shaka-player/issues/1421


## 2.3.7 (2018-04-24)

Bugfixes:
  - Fixed manifest update frequency calculations
    - https://github.com/google/shaka-player/issues/1399
  - Fixed repeated seeking during HLS live streaming on Chromecast
    - https://github.com/google/shaka-player/issues/1411

Demo app:
  - Fixed updating of the app URL on Android when pasting into the custom asset
    field
    - https://github.com/google/shaka-player/issues/1079
  - Added Axinom live test assets
    - https://github.com/google/shaka-player/pull/1409


## 2.3.6 (2018-04-11)

Bugfixes:
  - Handle HLS segments tags that occur before playlist tags
    - https://github.com/google/shaka-player/issues/1382
  - Avoid telling AbrManager about key-system-restricted streams, to simplify
    building AbrManager plugins.
  - Fixed exported enum definition for network plugin priorities
  - Fixed ES5 strict mode compatibility in our module wrapper
    - https://github.com/google/shaka-player/pull/1398

Demo app:
  - Fixed playback of VDMS assets by updating the license request details
    - https://github.com/google/shaka-player/pull/1388


## 2.3.5 (2018-03-29)

New features:
  - Do not buffer audio far ahead of video
    - https://github.com/google/shaka-player/issues/964

Bugfixes:
  - Fixed early seeking (immediately upon load)
    - https://github.com/google/shaka-player/issues/1298
  - Fixed repeated seeking in HLS live (also affects DASH with
    timeShiftBufferDepth of zero)
    - https://github.com/google/shaka-player/issues/1331
  - Fixed VTT+MP4 parsing with respect to TRUN box
    - https://github.com/google/shaka-player/issues/1266
  - Fixed hang in StreamingEngine when playing at the left edge of the seek
    range on slow embedded devices
  - Work around slow DASH parsing on embedded devices

Demo app:
  - Fixed CSS for display on Chromecast and other TV devices
  - Added "startTime" URL parameter for debugging purposes


## 2.3.4 (2018-03-22)

New features:
  - Support for non-standard DASH SegmentTemplate strings using formats other
    than "d" (such as "x" and "o").
    - https://github.com/Dash-Industry-Forum/DASH-IF-IOP/issues/177

Bugfixes:
  - Fixed rapid seeking in zero-width seek ranges, such as in HLS live
    - https://github.com/google/shaka-player/issues/1331
  - Fixed use of native controls for text display
    - https://github.com/google/shaka-player/issues/1332
  - Fixed parsing of multiple 'emsg' boxes
    - https://github.com/google/shaka-player/issues/1340

Demo app:
  - Added an "unload" button to the demo app
  - Fixed enabling of TS assets in the demo app
    - https://github.com/google/shaka-player/issues/1214

Docs:
  - Added a doc describing DASH manifests
    - https://github.com/google/shaka-player/issues/1233
  - Fixed documentation of CONTENT_UNSUPPORTED_BY_BROWSER error
    - https://github.com/google/shaka-player/issues/1349
  - Updated architecture diagrams
    - https://github.com/google/shaka-player/issues/1197


## 2.3.3 (2018-03-01)

New features:
  - Warn if parsing the date from UTCTiming fails
    - https://github.com/google/shaka-player/issues/1317
    - https://github.com/google/shaka-player/pull/1318
  - Backpropagate language selections on track change
    - https://github.com/google/shaka-player/issues/1299

Bugfixes:
  - Fix MP4+VTT in HLS
    - https://github.com/google/shaka-player/issues/1270
  - Fix track selection during "streaming" event
    - https://github.com/google/shaka-player/issues/1119
  - Work around MSE rounding errors in Edge
    - https://github.com/google/shaka-player/issues/1281
    - Edge bug: https://bit.ly/2ttKiBU
  - Fix IE stuck buffering at the end after replay
    - https://github.com/google/shaka-player/issues/979
  - Fix catastrophic backtracking in TTML text parser
    - https://github.com/google/shaka-player/issues/1312
  - Fix infinite loop when jumping very small gaps
    - https://github.com/google/shaka-player/issues/1309
  - Fix seek range for live content with less than a full availability window
    - https://github.com/google/shaka-player/issues/1224
  - Remove misleading logging in DrmEngine#fillInDrmInfoDefaults
    - https://github.com/google/shaka-player/pull/1288
    - https://github.com/google/shaka-player/issues/1284
  - Fix old text cues displayed after loading new text stream
    - https://github.com/google/shaka-player/issues/1293
  - Fix truncated HLS duration with short text streams
    - https://github.com/google/shaka-player/issues/1271
  - Fix DASH SegmentTemplate w/ duration
    - https://github.com/google/shaka-player/issues/1232

Docs:
  - Fix out-of-date docs for error 6014 EXPIRED
    - https://github.com/google/shaka-player/issues/1319
  - Simplify prerequisite installation on Linux
    - https://github.com/google/shaka-player/issues/1175
  - Simplify the debugging tutorial
  - Fix various typos
    - https://github.com/google/shaka-player/pull/1272
    - https://github.com/google/shaka-player/pull/1274


## 2.3.2 (2018-02-01)

New features:
  - Add Storage.deleteAll() to clear storage when database upgrades fail
    - https://github.com/google/shaka-player/issues/1230
    - https://github.com/google/shaka-player/issues/1248
  - Make DASH default presentation delay configurable
    - https://github.com/google/shaka-player/issues/1234
    - https://github.com/google/shaka-player/pull/1235

Bugfixes:
  - Fix stall during eviction with small bufferBehind values
    - https://github.com/google/shaka-player/issues/1123
  - Fix deletion of offline licenses for demo content
    - https://github.com/google/shaka-player/issues/1229
  - Fix compiler renaming in Player language APIs
    - https://github.com/google/shaka-player/issues/1258
  - Rename Timeline events to include the "Event" suffix
    - https://github.com/google/shaka-player/pull/1267

Docs:
  - Fix incorrect year in the change log
    - https://github.com/google/shaka-player/pull/1263
  - Fix some bad annotations found while upgrading jsdoc
    - https://github.com/google/shaka-player/issues/1259


## 2.3.1 (2018-01-22)

New features:
  - All features released in 2.2.10, plus...
  - DRM content is now implied by DRM config, fixes some ad insertion cases
    - https://github.com/google/shaka-player/pull/1217
    - https://github.com/google/shaka-player/issues/1094
  - Add support for mp4a.40.34 mp3 in HLS
    - https://github.com/google/shaka-player/issues/1210
  - Allow ES6 syntax
  - Replaced deprecated gjslint with eslint

Bugfixes:
  - All fixes released in 2.2.10, plus...
  - Handle MPEGTS timestamp rollover issues, including WebVTT HLS
    - https://github.com/google/shaka-player/issues/1191
  - Fix MP4 timescale assumptions in HLS
    - https://github.com/google/shaka-player/issues/1191
  - Update muxjs to use new keepOriginalTimestamps option
    - https://github.com/google/shaka-player/issues/1194
  - Avoids line-length limits when building on Windows
    - https://github.com/google/shaka-player/issues/1228
  - Force JS files to use unix newlines on Windows
    - https://github.com/google/shaka-player/issues/1228
  - Fix selection of text streams with no role
    - https://github.com/google/shaka-player/issues/1212

Docs:
  - All fixes released in 2.2.10, plus...
  - Fix upgrade guide links


## 2.2.10 (2018-01-22)

New features:
  - Update Widevine HLS parsing support for SAMPLE-AES-CTR
    - https://github.com/google/shaka-player/issues/1227

Bugfixes:
  - Fix display of duration in Chrome cast dialog
    - https://github.com/google/shaka-player/issues/1174
  - Compensate for rounding errors in multi-period manifests
  - Delay gap-jumping until after seeking is complete
    - https://github.com/google/shaka-player/issues/1061
  - Fix SegmentTemplate w/ duration for live
    - https://github.com/google/shaka-player/issues/1204

Docs:
  - Add FAQ entry for file:// requests in Electron
    - https://github.com/google/shaka-player/issues/1222
  - Fixed typos and extraneous tags
  - Added missing @exportDoc annotations
    - https://github.com/google/shaka-player/pull/1208


## 2.3.0 (2017-12-22)

New features:
  - Support for HLS live streams
    - https://github.com/google/shaka-player/issues/740
  - Support for HLS VOD streams that do not start at t=0
    - https://github.com/google/shaka-player/issues/1011
    - Previously supported through configuration, now automatic
  - MPEG-2 TS content can be transmuxed to MP4 for playback on all browsers
    - https://github.com/google/shaka-player/issues/887
    - Requires apps to load https://github.com/videojs/mux.js/
  - Do not stream captions until they are shown
    - https://github.com/google/shaka-player/issues/1058
  - Use NetworkInformation API to get initial bandwidth estimate
    - https://github.com/google/shaka-player/issues/994
    - https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation
  - Added a method to list language/role combinations
    - https://github.com/google/shaka-player/issues/967

Demo app:
  - The demo app is now a Progressive Web App (PWA) and can be used offline
    - https://github.com/google/shaka-player/issues/876
    - https://developers.google.com/web/progressive-web-apps/
  - Lighthouse: improved page load latency, text contrast ratio, UI performance
    - https://github.com/google/shaka-player/issues/905
    - https://developers.google.com/web/tools/lighthouse/
  - Roles can now be selected in the demo app
    - https://github.com/google/shaka-player/issues/967
  - Added quick links to change between compiled, debug, and uncompiled builds

Bugfixes:
  - Fixed interpretation of EXT-X-START in HLS
    - https://github.com/google/shaka-player/issues/1011
  - Fixed URI extension parsing in HLS
    - https://github.com/google/shaka-player/issues/1085
  - Offline storage API can now download multiple items in parallel
    - https://github.com/google/shaka-player/issues/1047

Docs:
  - FAQ, architecture diagrams, and tutorials have all been updated.
    - https://github.com/google/shaka-player/issues/1183

Broken compatibility:
  - Text parser plugins now take a Uint8Array, not an ArrayBuffer.  All
    application-specific text-parsing plugins MUST be updated.
    - https://github.com/google/shaka-player/issues/1022

Deprecated:
  - The AbrManager configuration interfaces and plugin APIs which were
    deprecated in v2.2 have now been removed.  Applications with custom
    AbrManager implementations MUST be upgraded to the v2.2 API now.
  - The plugin interface for text parsers which was deprecated in v2.1 has now
    been removed.
  - The `remove()` method on `shaka.offline.Storage` now takes a URI instead of
    a `StoredContent` instance.  Applications which use offline storage SHOULD
    update to the new API.  Support for the old argument will be removed in
    v2.4.
  - The `streaming.infiniteRetriesForLiveStreams` config was removed.
    Applications using this feature MUST use the `streaming.failureCallback`
    config and the method `player.retryStreaming()` instead.


## 2.2.9 (2017-12-22)

Bugfixes:
  - Fix excessive memory usage during storage
    - https://github.com/google/shaka-player/issues/1167
  - Fix offline storage with temporary license
    - https://github.com/google/shaka-player/issues/1159
  - Fix exception while casting
    - https://github.com/google/shaka-player/issues/1128
  - Reduced bandwidth of cast messaging
    - https://github.com/google/shaka-player/issues/1128
  - Fix exception when destroying TextDisplayer
    - https://github.com/google/shaka-player/issues/1187
  - Fix presentationTimeOffset in SegmentTemplate
    - https://github.com/google/shaka-player/issues/1164
  - Fix inconsistencies in text visibility across playbacks
    - https://github.com/google/shaka-player/issues/1185
  - Work around bad header formatting in IE 11
    - https://github.com/google/shaka-player/issues/1172
  - Fix Chromecast PlayReady playback
    - https://github.com/google/shaka-player/issues/1070
  - Fix subtitle display with VTTRegion enabled in Chrome
    - https://github.com/google/shaka-player/issues/1188


## 2.2.8 (2017-12-06)

Bugfixes:
  - Do not allow seeking/startup at duration (bump back by 1s)
    - https://github.com/google/shaka-player/issues/1014
  - Don't wait for sessions to close on DrmEngine.destroy
    - https://github.com/google/shaka-player/issues/1093
    - https://github.com/google/shaka-player/pull/1168
  - Do not clear buffers on configuration changes unless required
    - https://github.com/google/shaka-player/issues/1138
  - Ignore unsupported STYLE blocks in WebVTT
    - https://github.com/google/shaka-player/issues/1104
  - Fix a null exception in CastReceiver.destroy


Demo app:
  - Fix "ended" video control state on IE
    - https://github.com/google/shaka-player/issues/979
  - Fix updates to demo app URL hash on Edge & IE 11
    - https://github.com/google/shaka-player/issues/1111
  - Fix demo app page-load race on IE 11


## 2.2.7 (2017-11-28)

Bugfixes:
  - Allow playhead to recover from drift
    - https://github.com/google/shaka-player/issues/1105
  - Fix exception and race which prevented cast status updates
    - https://github.com/google/shaka-player/issues/1128
  - Fix live broadcast startup issues
    - https://github.com/google/shaka-player/issues/1150
  - Fix mis-detection of live streams as IPR
    - https://github.com/google/shaka-player/issues/1148
  - Fix buffering of live streams while paused
    - https://github.com/google/shaka-player/issues/1121

Demo app:
  - Add multi-DRM assets from VDMS
    - https://github.com/google/shaka-player/issues/780
    - https://github.com/google/shaka-player/pull/781
  - Add certificate URI field in the custom asset section
    - https://github.com/google/shaka-player/issues/1135
    - https://github.com/google/shaka-player/pull/1136
  - Fix broken HLS asset
    - https://github.com/google/shaka-player/issues/1137
  - Update Widevine proxy URI

Docs:
  - Refactor main README.md
  - Fix build/README.md typo
    - https://github.com/google/shaka-player/pull/1139
  - Fix typo in config tutorial
    - https://github.com/google/shaka-player/pull/1124


## 2.2.6 (2017-11-14)

Bugfixes:
  - Cancel network retries when the Player is destroyed
    - https://github.com/google/shaka-player/issues/1084
  - Do not overwrite media from an earlier period when new period is shifted
    - https://github.com/google/shaka-player/issues/1098
  - Do not assume same timescale in manifest and media
    - https://github.com/google/shaka-player/issues/1098
  - Do not fail assertions when media references are shifted outside the period
    - https://github.com/google/shaka-player/issues/1098
  - Fix custom builds which exclude text parsing plugins
    - https://github.com/google/shaka-player/issues/1115

Demo app:
  - Rename demo "Autoplay" in demo UI to "Auto-load on page refresh"
    - https://github.com/google/shaka-player/issues/1114


## 2.2.5 (2017-11-02)

New features:
  - Add streaming event to allow reconfiguration before streaming starts
    - https://github.com/google/shaka-player/issues/1043
  - Add method to get the parsed manifest structure
    - https://github.com/google/shaka-player/issues/1074
  - Log about deprecated APIs, even in a compiled build with other logs disabled

Bugfixes:
  - Fix interpretation of DASH presentationTimeOffset in SegmentBase
    - https://github.com/google/shaka-player/issues/1099


## 2.1.9 (2017-11-02)

Bugfixes:
  - Fix interpretation of DASH presentationTimeOffset in SegmentBase
    - https://github.com/google/shaka-player/issues/1099


## 2.2.4 (2017-10-23)

Bugfixes:
  - Don't enforce seek range while paused in live streams (stays paused)
    - https://github.com/google/shaka-player/issues/982
  - Fix start time in live streams
    - https://github.com/google/shaka-player/issues/1069
  - Fix handling & transmission of errors from cast receiver to sender
    - https://github.com/google/shaka-player/issues/1065

Docs:
  - Added a tutorial for the offline storage and playback APIs
    - https://github.com/google/shaka-player/issues/1037


## 2.2.3 (2017-10-17)

New features:
  - Publish an event when the CDM accepts a license
    - https://github.com/google/shaka-player/issues/1035
    - https://github.com/google/shaka-player/pull/1049
  - Added assertions and logging to the debug build
  - Added a debugging method on Player to get buffered ranges

Bugfixes:
  - Fixed race between gap-jumping and seeking
    - https://github.com/google/shaka-player/issues/1061
  - Fixed startTime == 0 in player.load()
    - https://github.com/google/shaka-player/issues/1069
  - Avoid clearing buffer on configure unless restrictions change
    - https://github.com/google/shaka-player/issues/1009
  - Fixed exceptions in the cast receiver demo
    - https://github.com/google/shaka-player/issues/1064
  - Various fixes for concurrent use of CastProxy and related APIs
    - https://github.com/google/shaka-player/issues/768
  - Polyfilled various MediaSource issues on Safari 11
    - https://github.com/google/shaka-player/issues/1048
  - Reject TS content on Safari due to MediaSource bugs
    - https://github.com/google/shaka-player/issues/743
  - Fixed stuck progress bar on cast receiver demo
    - https://github.com/google/shaka-player/issues/1064

Demo app:
  - Rotating mobile devices triggers fullscreen mode
    - https://github.com/google/shaka-player/issues/883
  - Added robustness suggestions for Widevine
    - https://github.com/google/shaka-player/pull/1008

Docs:
  - Fixed docs with regard to shaka.text namespace
    - https://github.com/google/shaka-player/issues/1046


## 2.2.2 (2017-09-27)

New features:
  - Support for MP4+TTML text streams with multiple MDAT boxes
    - https://github.com/google/shaka-player/issues/1028

Bugfixes:
  - Fixed playback hangs in certain content due to rounding error
    - https://github.com/google/shaka-player/issues/979
  - Fixed exception when TextTrack mode is set to "disabled"
    - https://github.com/google/shaka-player/issues/990
  - Fixed subtitle failures in Safari
    - https://github.com/google/shaka-player/issues/991
    - https://github.com/google/shaka-player/issues/1012
  - Fixed renaming issues in compiled builds
  - Fixed exceptions on Tizen 2016
    - https://github.com/google/shaka-player/issues/1022
    - https://github.com/google/shaka-player/issues/935
  - Fixed TTML region parsing
    - https://github.com/google/shaka-player/issues/1020

Demo app:
  - Auto-select offline copy of an asset after storing it offline
    - https://github.com/google/shaka-player/issues/996
    - https://github.com/google/shaka-player/pull/1001
  - Removed YouTube-sourced assets, which were very outdated
    - https://github.com/google/shaka-player/issues/1015
  - Added "Shaka Player History" live stream

Docs:
  - Added CORS explanation to the docs
    - https://github.com/google/shaka-player/issues/1018


## 2.2.1 (2017-09-01)

New features:
  - Support MP4+TTML in HLS
    - https://github.com/google/shaka-player/issues/986

Bugfixes:
  - Fixed display of old text cues after loading new content
    - https://github.com/google/shaka-player/issues/984
  - Fixed text cue alignment in compiled mode
    - https://github.com/google/shaka-player/issues/987
  - Fixed exception triggered when storing offline content
    - https://github.com/google/shaka-player/issues/988
  - Fixed cast state when multiple cast senders exist at once
    - https://github.com/google/shaka-player/issues/768
  - Fixed several Cast UI issues
  - Fixed (harmless) assertion failures on Cast receivers

Demo app:
  - Demo UI on mobile now shows help text on store/delete button
    - https://github.com/google/shaka-player/pull/995

Docs:
  - Document lack of IE support on Windows 7
    - https://github.com/google/shaka-player/pull/993


## 2.2.0 (2017-08-23)

New features:
  - Add support for EVENT type playlists in HLS
    - https://github.com/google/shaka-player/issues/740
  - Add new option for offline protected content without persistent licensing
    - https://github.com/google/shaka-player/issues/873
  - Allow applications to render their own text tracks
    - https://github.com/google/shaka-player/issues/796
  - Allow applications to control streaming retry behavior
    - https://github.com/google/shaka-player/issues/960
  - Add support for additional TTML styles
    - https://github.com/google/shaka-player/issues/923
    - https://github.com/google/shaka-player/issues/927
  - Add channel count information for both DASH & HLS
    - https://github.com/google/shaka-player/issues/424
    - https://github.com/google/shaka-player/issues/826
  - Add basic xlink support in DASH (actuate=onLoad only)
    - https://github.com/google/shaka-player/issues/587
    - https://github.com/google/shaka-player/issues/788
  - Add API to limit playable/seekable range for VOD content.
    - https://github.com/google/shaka-player/issues/246
  - Add new error code for container/codec support issues
    - https://github.com/google/shaka-player/issues/868
  - The default ABR manager is much more configurable
    - https://github.com/google/shaka-player/issues/744
  - Add stream bandwidth info to variant tracks
    - https://github.com/google/shaka-player/issues/834
  - Add player.isAudioOnly()
    - https://github.com/google/shaka-player/issues/942
  - Expose presentation start time through player
    - https://github.com/google/shaka-player/issues/957
  - Add bandwidth info to switch history
  - Improved Chromecast media queries
  - Stricter runtime type-checking of EME cert configuration
    - https://github.com/google/shaka-player/issues/784

Bugfixes:
  - Fix flakiness in offline-related tests
    - https://github.com/google/shaka-player/issues/903

Demo app:
  - Added robustness fields to the UI
    - https://github.com/google/shaka-player/issues/889

Docs:
  - Updated upgrade guide for v2.2
    - https://github.com/google/shaka-player/issues/930

Broken compatibility:
  - The text-parsing plugin API has changed.  Plugins now return shaka.text.Cue
    objects instead of VTTCue or TextTrackCue objects.  All application-specific
    text-parsing plugins MUST be updated.
    - https://github.com/google/shaka-player/issues/796

Deprecated:
  - The configuration for a custom ABR manager has changed.  Applications with
    custom AbrManager implementations SHOULD now configure abrFactory instead of
    abr.manager.
    - https://github.com/google/shaka-player/issues/744
    - The old interface will be removed in v2.3.
  - The config API for AbrManager has changed.  setDefaultEstimate() and
    setRestrictions() have been replaced with configure().  Applications with
    custom AbrManager implementations SHOULD implement the new configure()
    method.
    - https://github.com/google/shaka-player/issues/744
    - The old interface will be removed in v2.3.
  - The choice API for AbrManager has changed.  chooseStreams() has been
    replaced with chooseVariants(), and the switch callback now takes a variant.
    - https://github.com/google/shaka-player/issues/954
    - The old interface will be removed in v2.3.
  - The getTracks() and selectTrack() methods which were deprecated in v2.1 have
    now been removed.


## 2.1.8 (2017-08-23)

Bugfixes:
  - Add player.isAudioOnly() to fix flash of audio-only icon when casting
    - https://github.com/google/shaka-player/issues/969
  - Fix cast proxying of isAudioOnly and getMediaElement


## 2.1.7 (2017-08-14)

Bugfixes:
  - Fixed "Invalid argument" exceptions for subtitles in IE & Edge
  - Fixed buffering at the end of the stream for some content in IE & Edge
    - https://github.com/google/shaka-player/issues/913
  - Fixed seeking with native controls in Edge
    - https://github.com/google/shaka-player/issues/951
  - Fixed role selection to clear audio buffer right away
    - https://github.com/google/shaka-player/issues/948

Docs:
  - Fixed a bug in the upgrade guide for selecting tracks and disabling ABR
    - https://github.com/google/shaka-player/issues/962


## 2.1.6 (2017-08-09)

New features:
  - Add vp9, opus, and flac mp4 to probeSupport
    - https://github.com/google/shaka-player/issues/944

Bugfixes:
  - Never adapt across roles or languages
    - https://github.com/google/shaka-player/issues/918
    - https://github.com/google/shaka-player/issues/947
  - Fix parsing byterange attribute in HlsParser
    - https://github.com/google/shaka-player/issues/925
  - Fix incorrect segment position after update in some DASH live streams
    - https://github.com/google/shaka-player/pull/838
  - Fix support for live streams with no seek range
    - https://github.com/google/shaka-player/issues/916
  - Fix display order of cues with identical ranges
    - https://github.com/google/shaka-player/issues/848
  - Fix missing cues in WVTT MP4s using default sample duration
    - https://github.com/google/shaka-player/issues/919
  - Accept non-integer settings in VTT
    - https://github.com/google/shaka-player/issues/919
  - Tolerate bandwidth of 0 or missing bandwidth
    - https://github.com/google/shaka-player/issues/938
    - https://github.com/google/shaka-player/issues/940
  - Fix multiple pipeline flushes on some platforms
  - Make it safe to install polyfills twice
    - https://github.com/google/shaka-player/issues/941

Demo app:
  - Fix compiled mode in the demo app.  Does not affect the library.
    Removed defaultConfig_ reference in demo.
    - https://github.com/google/shaka-player/issues/929
  - Update license URI for PlayReady test asset
    - https://github.com/google/shaka-player/pull/953
    - https://github.com/google/shaka-player/issues/945


## 2.1.5 (2017-07-17)

New features:
  - Add more information to video errors in Chrome

Bugfixes:
  - Fix key status problems on IE11 and Tizen TVs
    - https://github.com/google/shaka-player/issues/884
    - https://github.com/google/shaka-player/issues/890
  - Fix period switching when streams are not yet available
    - https://github.com/google/shaka-player/issues/839
  - Filter out audio-only HLS variants that can't be switched to
    - https://github.com/google/shaka-player/issues/824
    - https://github.com/google/shaka-player/issues/861
  - Fix parsing of Microsoft-packaged HLS content
  - Fix rounding issues with multi-Period content
    - https://github.com/google/shaka-player/issues/882
    - https://github.com/google/shaka-player/issues/909
    - https://github.com/google/shaka-player/issues/911
  - Fix exceptions thrown in some cases when switching text tracks
    - https://github.com/google/shaka-player/issues/910
  - Fix DASH date parsing when timezone is missing
    - https://github.com/google/shaka-player/issues/901
  - Fix persistent storage detection on IE11 and Tizen TVs
  - Fix test issues on Tizen
    - https://github.com/google/shaka-player/issues/893
  - Fix version detection when compiling from the NPM package
    - https://github.com/google/shaka-player/issues/871
  - Work around lack of key statuses on Tizen
    - https://github.com/google/shaka-player/issues/891
    - https://github.com/google/shaka-player/issues/894

Demo app:
  - Fix missing fullscreen button on IE11
    - https://github.com/google/shaka-player/issues/787
  - Added configuration for gap jumping

Docs:
  - Document HTTPS requirement for EME
    - https://github.com/google/shaka-player/issues/867
    - https://github.com/google/shaka-player/issues/928
  - Update tutorials
    - https://github.com/google/shaka-player/issues/862
  - Add FAQ entry on EME robustness
    - https://github.com/google/shaka-player/issues/866
  - Update HLS FAQ
  - Document that we test on Tizen TV now


## 2.1.4 (2017-06-16)

New features:
  - Allow role to be specified in selectAudioLanguage and selectTextLanguage
    - https://github.com/google/shaka-player/issues/767

Bugfixes:
  - Fix changing languages close to a period boundary
    - https://github.com/google/shaka-player/issues/797
  - Fix hang in load() when there are pending failures
    - https://github.com/google/shaka-player/issues/782
  - Fix DASH parser ignoring certain text streams
    - https://github.com/google/shaka-player/issues/875
  - Fix exceptions when side-loading text tracks
    - https://github.com/google/shaka-player/issues/821
  - Fix PlayReady support on Chromecast
    - https://github.com/google/shaka-player/issues/852
  - Fix version number issues during publication on NPM
    - https://github.com/google/shaka-player/issues/869
  - Fix pollution from npm on Windows
    - https://github.com/google/shaka-player/issues/776
  - Fix support for npm v5
    - https://github.com/google/shaka-player/issues/854

Demo app:
  - Fix control visibility in fullscreen mode on mobile phones
    - https://github.com/google/shaka-player/issues/663

Docs:
  - Updated welcome docs
  - Updated list of supported platforms
    - https://github.com/google/shaka-player/issues/863
  - Updated FAQ
    - https://github.com/google/shaka-player/issues/864
    - https://github.com/google/shaka-player/issues/865


## 2.1.3 (2017-06-06)

New features:
  - Limit network retries for VOD, only retry forever on live
    - https://github.com/google/shaka-player/issues/762
    - https://github.com/google/shaka-player/issues/830
    - https://github.com/google/shaka-player/pull/842
  - Add stream IDs in getStats().switchHistory
    - https://github.com/google/shaka-player/issues/785
    - https://github.com/google/shaka-player/issues/823
    - https://github.com/google/shaka-player/pull/846
  - Add label attribute to tracks
    - https://github.com/google/shaka-player/issues/825
    - https://github.com/google/shaka-player/pull/811
    - https://github.com/google/shaka-player/pull/831
  - Expose role attributes on tracks
    - https://github.com/google/shaka-player/issues/767
  - Silence confusing browser-generated errors related to play()
    - https://github.com/google/shaka-player/issues/836

Bugfixes:
  - Fix offline storage in compiled mode
  - Choose lowest-bandwidth codecs when multiple are possible
    - https://github.com/google/shaka-player/issues/841
  - Fix PlayReady on IE and Edge
    - https://github.com/google/shaka-player/issues/837
  - Fix rounding errors on IE11
    - https://github.com/google/shaka-player/pull/832
  - Clean up demo app loader
  - Fix PlayReady test failures


## 2.1.2 (2017-05-23)

New features:
  - Make educated guesses about missing HLS info (CODECS no longer required)
    - https://github.com/google/shaka-player/issues/805
  - Add support for PlayReady on Chromecast and Tizen
    - https://github.com/google/shaka-player/issues/814
    - https://github.com/google/shaka-player/pull/815

Bugfixes:
  - Fix flakiness in RESTRICTIONS\_CANNOT\_BE\_MET errors
  - Make isBrowserSupported more strict about MediaSource
  - Fix detection of audio-only assets in the demo
    - https://github.com/google/shaka-player/issues/794
  - Fix exports and generated externs that were broken in v2.1.0 and v2.1.1
  - Speed up deletion of offline content
    - https://github.com/google/shaka-player/issues/756

Docs:
  - Fix docs on subtitles and captions
    - https://github.com/google/shaka-player/issues/808
  - Add notes on adaptation to upgrade guide


## 2.0.9 (2017-05-10)

Backported bugfixes from v2.1.x:
  - Fix offline download stalls on Android
    - https://github.com/google/shaka-player/issues/747
  - Fix track restriction based on key status
    - https://github.com/google/shaka-player/issues/761
  - Fix exception in fullscreen polyfill on IE 11
    - https://github.com/google/shaka-player/pull/777
  - Fix exception when reconfiguring serverCertificate
    - https://github.com/google/shaka-player/issues/784


## 2.1.1 (2017-05-10)

New features:
  - Separate audio and video codec in Track
    - https://github.com/google/shaka-player/issues/758
  - Make segment request to establish HLS media MIME type
    - https://github.com/google/shaka-player/issues/769

Bugfixes:
  - Fix exception in fullscreen polyfill on IE 11
    - https://github.com/google/shaka-player/pull/777
  - Fix exception when reconfiguring serverCertificate
    - https://github.com/google/shaka-player/issues/784
  - Don't fire 'trackschanged' event twice
    - https://github.com/google/shaka-player/issues/783
  - Fix track restriction based on key status
    - https://github.com/google/shaka-player/issues/761
  - Fix offline download stalls on Android
    - https://github.com/google/shaka-player/issues/747
  - Fix race condition in gap-jumping code
  - Fix poster visibility in fullscreen mode
    - https://github.com/google/shaka-player/issues/778


## 2.1.0 (2017-04-25)

New features:
  - Add basic HLS support
    - VOD only
    - Widevine & clear content only
    - No support for CEA-708
    - https://github.com/google/shaka-player/issues/279
  - Tolerate gaps in the presentation timeline and jump over them
    - https://github.com/google/shaka-player/issues/555
  - Add an indicator for critical errors
    - https://github.com/google/shaka-player/issues/564
  - Do not retry on HTTP 401/403 errors
    - https://github.com/google/shaka-player/issues/620
  - Expand player stats and track metadata
    - Add loadLatency stat
    - Add mimeType to tracks
    - Track state changes (buffering, playing, paused, ended)
  - DASH trick mode support
    - https://github.com/google/shaka-player/issues/538
  - Expose license expiration times through Player
    - https://github.com/google/shaka-player/issues/727
  - Add support for EventStream elements in DASH
    - https://github.com/google/shaka-player/issues/462
  - Add support for Chromecast Media Playback messages from generic senders
    - https://github.com/google/shaka-player/issues/722
  - Add config to ignore key system and init data in DASH manifest
    - https://github.com/google/shaka-player/issues/750
  - Add support for asynchronous response filters
    - https://github.com/google/shaka-player/issues/610
  - Filter duplicate initData from manifest by key ID
    - https://github.com/google/shaka-player/issues/580
  - Optionally adjust start time to segment boundary
    - https://github.com/google/shaka-player/issues/683
  - StringUtils and Uint8ArrayUtils are now exported, to make filters easier
    - https://github.com/google/shaka-player/issues/667
  - Add audio adaptation to default AbrManager
  - Add an API to force the Chromecast to disconnect
    - https://github.com/google/shaka-player/issues/523
  - Add possibility to delay license request until playback is started
    - https://github.com/google/shaka-player/issues/262
  - Add API to get live stream position as Date
    - https://github.com/google/shaka-player/issues/356
  - Don't clear buffer if switching to the same stream
    - https://github.com/google/shaka-player/issues/693
  - Demo app permalink support through URL hash parameters
    - https://github.com/google/shaka-player/issues/709
  - Add a flag so scheme plugins can ask us to ignore cache hits for ABR
  - Allow passing durations from scheme plugins to compute throughput
    - https://github.com/google/shaka-player/issues/621
  - Make ES6 imports easier
    - https://github.com/google/shaka-player/issues/466
  - Add separate restrictions to AbrManager
    - https://github.com/google/shaka-player/issues/565
  - Allow network plugins to see the request type
    - https://github.com/google/shaka-player/issues/602

Bugfixes:
  - Make language selection explicit
    - https://github.com/google/shaka-player/issues/412
  - Make text track visibility explicit
    - https://github.com/google/shaka-player/issues/626
  - Fix firing of 'trackschanged' event for multi-Period content
    - https://github.com/google/shaka-player/issues/680
  - Correct time parsing for MP4 VTT subtitles
    - https://github.com/google/shaka-player/issues/699
  - Fix playback of live when segments do not extend to the end of the Period
    - https://github.com/google/shaka-player/issues/694
  - Allow seeking to 0 in live streams
    - https://github.com/google/shaka-player/issues/692
  - Add explicit timestamps to 'emsg' events
    - https://github.com/google/shaka-player/issues/698
  - Fix playback of YouTube demo assets
    - https://github.com/google/shaka-player/issues/682
  - Allow text parsers to change during playback
    - https://github.com/google/shaka-player/issues/571

Docs:
  - Add offline storage to v2 upgrade guide
  - Add additional docs for AbrManager
    - https://github.com/google/shaka-player/issues/629
  - Add manifest parser plugin tutorial

Broken Compatibility:
  - Track types 'video' and 'audio' have been combined into 'variant'.
    - Any application looking at track.type will need to be updated.
  - Removed useRelativeCueTimestamps option
    - All segmented WebVTT cue timestamps are now segment-relative
    - https://github.com/google/shaka-player/issues/726
  - Plugin interface for text parsers has changed
    - Both old & new interfaces still supported
    - Support for old interface will be removed in v2.2
  - Plugin interface for ManifestParser.start has changed
    - Now takes an object with named parameters instead of positional params
    - Both old & new interfaces still supported
    - Support for old interface will be removed in v2.2
  - Retired the INVALID\_TTML error code
    - Folded into the INVALID\_XML error code


## 2.0.8 (2017-04-07)

Bugfixes:
  - Suppress controls UI updates when hidden
    - https://github.com/google/shaka-player/issues/749
  - Revert keyboard navigation changes in demo, failing on Firefox


## 2.0.7 (2017-03-29)

New Features:
  - Improved keyboard navigation in demo page for accessibility
  - Play through small gaps at the start of the timeline
  - Add a method for accessing the HTMLMediaElement from the Player
    - https://github.com/google/shaka-player/pull/723
  - Improved error reporting for HTTP errors

Bugfixes:
  - Fixed a DASH compliance bug in SegmentList w/ presentationTimeOffset
  - Fixed compiler renaming in emsg events.
    - https://github.com/google/shaka-player/issues/717
  - Fix period transitions where text streams may be absent
    - https://github.com/google/shaka-player/issues/715
  - Fix Firefox DRM detection
  - Fix cleanup of expired EME sessions for offline
  - Fix demo app error thrown when offline is not supported
  - Fix infinite loop in offline storage of SegmentTemplate-based DASH
    - https://github.com/google/shaka-player/issues/739
  - Fix contamination between tests


## 2.0.6 (2017-02-24)

New Features:
  - Add Media Session info to demo
    - https://github.com/google/shaka-player/pull/689
  - Add support for xml:space in TTML parser
    - https://github.com/google/shaka-player/issues/665
  - Add fullscreenEnabled property to fullscreen polyfill
    - https://github.com/google/shaka-player/issues/669
  - Allow InbandEventStream elements at Representation level
    - https://github.com/google/shaka-player/pull/687
    - https://github.com/google/shaka-player/issues/686
  - Warning for unsupported indexRange attribute
  - Warning for duplicate Representation IDs

Bugfixes:
  - Fix cast support broken since 2.0.3
    - https://github.com/google/shaka-player/issues/675
  - Fix timeout errors in cast demo
    - https://github.com/google/shaka-player/issues/684
  - Fix infinite buffering caused by a race
    - https://github.com/google/shaka-player/issues/600
  - Fix race in StreamingEngine for multi-Period content
    - https://github.com/google/shaka-player/issues/655
  - Hide the controls when going fullscreen on phones
    - https://github.com/google/shaka-player/issues/663
  - Improve calculation of $TIME$ in SegmentTemplate
    - https://github.com/google/shaka-player/issues/690
    - https://github.com/google/shaka-player/pull/706
  - Fix YouTube asset on demo app
    - https://github.com/google/shaka-player/issues/682


## 2.0.5 (2017-01-30)

Bugfixes:
  - Fix several bugs with multi-Period content
    - Possible hang when seeking
    - Fix race between buffering and Period transition
    - Fix race between rapid Period transitions
    - https://github.com/google/shaka-player/issues/655
  - Fix hang in destroy() when EME sessions are in a bad state
    - https://github.com/google/shaka-player/issues/664
  - Fix doubling of time offset for segment-relative cues
    - https://github.com/google/shaka-player/issues/595
    - https://github.com/google/shaka-player/pull/599


## 2.0.4 (2017-01-24)

New features:
  - Support for 4k on Chromecast Ultra
  - Support for text tracks on Toshiba dTV
    - https://github.com/google/shaka-player/issues/635
    - https://github.com/google/shaka-player/pull/643

Bugfixes:
  - Fixed buffering issues at the end of streams in IE/Edge
    - https://github.com/google/shaka-player/issues/658
  - Fixed parsing of empty divs in TTML
    - https://github.com/google/shaka-player/issues/646
    - https://github.com/google/shaka-player/pull/650
  - Fixed subtle bug in Promise.resolve polyfill on IE
  - Fixed test failures on Chromecast

Docs:
  - Added additional docs for offline storage
  - Updated and clarified debugging tutorial
    - https://github.com/google/shaka-player/issues/653


## 2.0.3 (2017-01-09)

New features:
  - Treat HTTP 202 status codes as failures
    - https://github.com/google/shaka-player/issues/645

Bugfixes:
  - Fix race condition in StreamingEngine
  - Fix race in load/unload in Player
    - https://github.com/google/shaka-player/pull/613
    - https://github.com/google/shaka-player/issues/612
  - Update workarounds for Edge EME bugs
    - https://github.com/google/shaka-player/issues/634
  - Add missing events and methods to cast proxy
  - Fix exclusion of standard features in custom builds
  - Be more permissive of text failures
    - Permit text parsing errors as well as streaming errors with the
      ignoreTextStreamFailures config option.
    - Do not fail StreamingEngine startup because of text streams,
      regardless of config.
    - https://github.com/google/shaka-player/issues/635
  - Fix selectTrack() call with no text tracks
    - https://github.com/google/shaka-player/issues/640
  - Fix buffering state for live streams (stop at live edge)
    - https://github.com/google/shaka-player/issues/636


## 2.0.2 (2016-12-15)

New features:
  - Add support for Toshiba dTV
    - https://github.com/google/shaka-player/pull/605
  - TTML subtitles: Support for \<br\> inside a paragraph
    - https://github.com/google/shaka-player/pull/572
    - https://github.com/google/shaka-player/pull/584
  - Parse TTML textAlign settings into align property of a VTTCue
    - https://github.com/google/shaka-player/pull/573
  - Improved test stability and coverage reports

Bugfixes:
  - Fix DASH content type parsing
    - https://github.com/google/shaka-player/issues/631
  - Tolerate larger gaps at the start
    - https://github.com/google/shaka-player/issues/579
  - Fixes for TTML alignment, positioning and cue externs
    - https://github.com/google/shaka-player/pull/588
    - https://github.com/google/shaka-player/pull/594
  - Keep ewma sampling from failing on 0 duration segments
    - https://github.com/google/shaka-player/issues/582
    - https://github.com/google/shaka-player/pull/583
   - Allow text parsers to change during playback
    - https://github.com/google/shaka-player/issues/571
  - Fix playback when IE11 modifies the XML DOM
    - https://github.com/google/shaka-player/issues/608
    - https://github.com/google/shaka-player/pull/611
  - Update MediaSource polyfills for Safari 10
    - https://github.com/google/shaka-player/issues/615
  - Throw explicit error on empty manifests
    - https://github.com/google/shaka-player/issues/618

Docs:
  - Link to error docs from the demo app


## 2.0.1 (2016-10-26)

New features:
  - Faster ABR decisions
  - Add config option for using segment relative timestamps for VTT
    - https://github.com/google/shaka-player/issues/480
    - https://github.com/google/shaka-player/pull/542
  - Log and ignore non-standard WebVTT settings instead of failing
    - https://github.com/google/shaka-player/issues/509
  - Make key IDs from the manifest available through DrmInfo
    - https://github.com/google/shaka-player/pull/529
  - Provide framerate and codecs information on video tracks
    - https://github.com/google/shaka-player/issues/516
    - https://github.com/google/shaka-player/pull/533
  - Dispatch more useful network error when HEAD request fails

Bugfixes:
  - Fix ABR quality issues when switching tracks (stutters, glitches, etc.)
    - https://github.com/google/shaka-player/issues/520
  - Keep user selected text track when switching audio
    - https://github.com/google/shaka-player/issues/514
  - Fix vtt with one digit hour
    - https://github.com/google/shaka-player/pull/522
  - Fix build scripts for Windows
    - https://github.com/google/shaka-player/issues/526
  - Fix buffering event delay
    - https://github.com/google/shaka-player/issues/511
  - Workaround bug in Edge buffered ranges
    - https://github.com/google/shaka-player/issues/530
  - Fix handling of internal-error key status
    - https://github.com/google/shaka-player/issues/539
  - Ignore trick mode tracks
    - https://github.com/google/shaka-player/issues/538
  - Fix AdaptationSetSwitching support
  - Fix buffering logic when switching periods
    - https://github.com/google/shaka-player/issues/537
    - https://github.com/google/shaka-player/issues/545
  - Use data URI content-type for manifest type detection
    - https://github.com/google/shaka-player/pull/550
  - Fix audio language changes on Chromecast
    - https://github.com/google/shaka-player/issues/544
  - Fix Chromecast receiver idle behavior when looping or replaying
    - https://github.com/google/shaka-player/issues/558
  - Fix exception-causing race when TextEngine is destroyed

Demo app improvements:
  - Hide volume & mute buttons on mobile-sized screens
  - Probe both MP4 and WebM support in DrmEngine
    - https://github.com/google/shaka-player/issues/540
  - Update Axinom test assets to v7
  - Fix accessibility issues in the demo app
    - https://github.com/google/shaka-player/issues/552

Docs:
  - Rewrote the debugging tutorial
  - Misc docs cleanup
    - https://github.com/google/shaka-player/pull/536


## 2.0.0 (2016-09-07)

The first full release of v2!

New features:
  - Improved Chromecast support
    - Cast from the built-in Chrome dialog as well as the video controls
    - Use the built-in Chrome dialog to disconnect
  - Support for in-progress recordings (IPR)
    - https://github.com/google/shaka-player/issues/477
  - Can be configured to tolerate text stream failures
    - https://github.com/google/shaka-player/issues/474
  - Ignore small gaps in the timeline
    - https://github.com/google/shaka-player/issues/472
  - Added EMSG box support
    - https://github.com/google/shaka-player/issues/259
  - Reduced test flakiness and improved test speed
  - Improved VTT parsing
    - https://github.com/google/shaka-player/issues/469
  - Improved EME error reporting
    - https://github.com/google/shaka-player/issues/468
  - Improved demo app UI for touch screens
  - Smaller demo app UI (video element above the fold on Nexus 5X)

Bugfixes:
  - Fixed text-related issues in IE11
    - https://github.com/google/shaka-player/issues/501
    - https://github.com/google/shaka-player/issues/502
  - Fixed a few live edge corner cases
    - https://github.com/google/shaka-player/issues/490
    - https://github.com/google/shaka-player/issues/504
  - Fixed TTML parsing exceptions
    - https://github.com/google/shaka-player/issues/473
    - https://github.com/google/shaka-player/issues/506
  - Fixed text encoding issues with subs
  - Fixed issues with multi-period eviction
    - https://github.com/google/shaka-player/pull/483
  - Defined order of AdaptationSet preference (prefer high quality, low bw)
    - https://github.com/google/shaka-player/issues/476
  - Fixed support for manifests with multiple text formats
  - Fixed support for DASH Representations with multiple Roles
    - https://github.com/google/shaka-player/issues/500
  - Fixed CSP compliance for Chrome apps
    - https://github.com/google/shaka-player/issues/487

Planned features we cut:
  - Cache-detecting bandwidth estimation
    - https://github.com/google/shaka-player/issues/324


## 2.0.0-beta3 (2016-07-29)

Restored Features from v1 Missing in v2.0.0-beta2:
  - Offline storage and playback
    - https://github.com/google/shaka-player/issues/343
  - Clearkey license server support
    - https://github.com/google/shaka-player/issues/403

New features:
  - Built-in Chromecast support
    - https://github.com/google/shaka-player/issues/261
  - TTML text support
    - https://github.com/google/shaka-player/issues/111
  - TTML in MP4
    - https://github.com/google/shaka-player/issues/278
  - VTT in MP4
    - https://github.com/google/shaka-player/issues/277
  - Handle QuotaExceededError, automatically reduce buffering goals
    - https://github.com/google/shaka-player/issues/258
  - Faster template processing in DASH
    - https://github.com/google/shaka-player/issues/405
  - Bitrate upgrades take effect faster
  - Add a specific error for missing license server URI
    - https://github.com/google/shaka-player/issues/371
  - Add adaptation events for language changes
  - Don't treat network errors as fatal in StreamingEngine
    - https://github.com/google/shaka-player/issues/390
  - Provide the application access to DrmInfo structure
    - https://github.com/google/shaka-player/issues/272
  - Restructure test/ folder to mimic lib/ folder structure
    - https://github.com/google/shaka-player/pull/434
  - Upgrade closure compiler
    - https://github.com/google/shaka-player/pull/421
  - New logo!

Bugfixes:
  - Revert ABR changes that caused bandwidth samples to be ignored
    - https://github.com/google/shaka-player/issues/367
  - Fix buffering of multi-period text
    - https://github.com/google/shaka-player/issues/411
  - Fix various ABR issues
    - https://github.com/google/shaka-player/issues/435
  - Fix stuck playback on seek
    - https://github.com/google/shaka-player/issues/366
  - Stop refreshing live manifests when unloaded
    - https://github.com/google/shaka-player/issues/369
  - Don't adapt between incompatible codecs (mp4a & ec-3)
    - https://github.com/google/shaka-player/issues/391
  - Fix race in player WRT external text tracks
    - https://github.com/google/shaka-player/issues/418
  - Fix Edge EME workarounds on IE11
    - https://github.com/google/shaka-player/issues/393
  - Work around Safari MSE bugs
  - Fix relative paths in UTCTiming
    - https://github.com/google/shaka-player/issues/376
  - Fix source map paths on windows
    - https://github.com/google/shaka-player/issues/413
  - Improve demo app CSS on mobile
  - Fix buffering state on unload
  - Fix load/unload/destroy race conditions
  - Reduce test flake (async tests still flakey on Safari)
  - Fix context menu display in demo app
    - https://github.com/google/shaka-player/issues/422
  - Fix key status, session expiration, and DRM error dispatch
  - Fix demo app play controls on Android
    - https://github.com/google/shaka-player/issues/432
  - Fix corner cases when seeking to the live edge

Docs:
  - Add a license-wrapping tutorial
  - Add track restriction docs
    - https://github.com/google/shaka-player/issues/387
  - Update track and adaptation docs
    - https://github.com/google/shaka-player/issues/447

Broken Compatibility compared to v2.0.0-beta2:
  - The asynchronous Player.support() has been replaced with the synchronous
    Player.isBrowserSupported() call
    - https://github.com/google/shaka-player/issues/388
  - AbrManager implementations must now handle a partial StreamSet map in
    chooseStreams()
  - The wrong keys error has been dropped due to false positives


## 2.0.0-beta2 (2016-05-04)

Restored Features from v1 Missing in v2.0.0-beta:
  - Track restrictions API
    - https://github.com/google/shaka-player/issues/326
    - https://github.com/google/shaka-player/issues/327
  - Custom controls demo for live
    - https://github.com/google/shaka-player/issues/322
  - Trick play demo
    - https://github.com/google/shaka-player/issues/328

New features:
  - Reduced startup latency
  - Added player.resetConfiguration()
  - Added response text to HTTP errors
    - https://github.com/google/shaka-player/issues/319
  - Demo controls redesigned with material design icons
  - Emit an error if the wrong keys are retrieved
    - https://github.com/google/shaka-player/issues/301
  - Human-readable errors shown in demo app
  - Cache-friendly bandwidth estimation
    - https://github.com/google/shaka-player/issues/324
  - Improved trick play and playbackRate support
    - https://github.com/google/shaka-player/issues/344
  - Allow apps to reset ABR manager estimates
    - https://github.com/google/shaka-player/issues/355
  - Support non-zero start times for VOD
    - https://github.com/google/shaka-player/issues/341
    - https://github.com/google/shaka-player/issues/348
    - https://github.com/google/shaka-player/issues/357

Bugfixes:
  - Fix playback of DASH with unaligned Representations
  - Fixed race conditions on seek
    - https://github.com/google/shaka-player/issues/334
  - Improved drift handling
    - https://github.com/google/shaka-player/issues/330
  - Fixed stack overflow in StringUtils
    - https://github.com/google/shaka-player/issues/335
  - Improved live support
    - https://github.com/google/shaka-player/issues/331
    - https://github.com/google/shaka-player/issues/339
    - https://github.com/google/shaka-player/issues/340
    - https://github.com/google/shaka-player/issues/351
  - Fixed player.addTextTrack
  - Handle CDMs which don't support the same types MSE does
    - https://github.com/google/shaka-player/issues/342
  - Fix audio-only encrypted playback
    - https://github.com/google/shaka-player/issues/360
  - Fix renaming of event properties
    - https://github.com/google/shaka-player/issues/361
  - Warn about missing clock sync elements in live manfiests
    - https://github.com/google/shaka-player/issues/290
  - Add option for default clock sync URI
    - https://github.com/google/shaka-player/issues/290
  - Fix crash in TextEngine when subs are turned off

Docs:
  - Shaka v2 upgrade guide
    - http://shaka-player-demo.appspot.com/docs/api/tutorial-upgrade.html
  - Added enum values (not just names) to generated docs
    - https://github.com/google/shaka-player/issues/337

Broken Compatibility compared to v2.0.0-beta:
  - None!


## 1.6.5 (2016-04-08)

Bugfixes:
  - Always build the same input files to a stable output
    - https://github.com/google/shaka-player/pull/299
  - Properly extern the 'xhr' property of HTTP errors
    - https://github.com/google/shaka-player/pull/319


## 2.0.0-beta (2016-04-07)

New Features:
  - DASH support for:
    - Multi-Period content
      - https://github.com/google/shaka-player/issues/186
    - Location elements
      - https://github.com/google/shaka-player/issues/298
    - UTCTiming elements (for clock synchronization)
      - https://github.com/google/shaka-player/issues/241
  - Better browser compatibility
    - Testing on Safari 9, IE 11, Edge, Firefox 45+, Opera, Chrome
    - https://github.com/google/shaka-player/issues/101
  - New plugin and build system to extend Shaka
    - Networking plugins
      - https://github.com/google/shaka-player/issues/228
      - https://github.com/google/shaka-player/issues/198
  - Cache-friendly networking
    - https://github.com/google/shaka-player/issues/76
    - https://github.com/google/shaka-player/issues/191
    - https://github.com/google/shaka-player/issues/235
  - Limit memory usage by clearing old data from buffer
    - https://github.com/google/shaka-player/issues/247
  - Simpler, more mobile-friendly demo app
  - New test assets
    - https://github.com/google/shaka-player/issues/224
  - Made play()/pause() independent of buffering
    - https://github.com/google/shaka-player/issues/233
  - Numerical error code system
    - https://github.com/google/shaka-player/issues/201
  - Distinguish between subtitle and caption tracks
    - https://github.com/google/shaka-player/issues/206
  - Separate audio & text language preferences
    - https://github.com/google/shaka-player/issues/207
  - Update timeShiftBufferDepth when updating the manifest
    - https://github.com/google/shaka-player/issues/295
  - Simplified clearkey setup using configure()
  - Initial bandwidth is now configurable:
    - https://github.com/google/shaka-player/issues/268

Bugfixes:
  - Stopped using Date headers for clock sync
    - https://github.com/google/shaka-player/issues/205
    - https://github.com/google/shaka-player/issues/241

Docs:
  - New tutorials!

Missing Features from v1 (to be added later):
  - Custom controls demo for live streams
    - https://github.com/google/shaka-player/issues/322
  - Chromecast demo
  - Trick play demo
  - Track restrictions based on key status
  - Offline support

Broken Compatibility:
  - Almost everything! (v2 upgrade guide coming soon)


## 1.6.4 (2016-03-03)

Bugfixes:
  - Updated Promise polyfill with fixes backported from v2
  - Fixed Edge EME compatibility & InvalidStateErrors
    - https://github.com/google/shaka-player/issues/282
  - Fixed HttpVideoSource use with clear content (Thanks, Sanborn!)
    - https://github.com/google/shaka-player/pull/292
  - Fixed uncompiled-mode performance regression introduced in v1.6.3
    - https://github.com/google/shaka-player/issues/288


## 1.6.3 (2016-02-08)

Features:
  - Added opt\_clearBufferOffset for audio  (Thanks, Itay)
    - https://github.com/google/shaka-player/pull/254
  - Fetch segments from new location after manifest redirect  (Thanks, Rob)
    - https://github.com/google/shaka-player/pull/266

Bugfixes:
  - Several IE11 stability issues and race conditions fixed
    - Fixed incompatibilities when clearing the SourceBuffer
    - Ignore spurious 'updateend' events
    - Added stack-based messages to all assertions
    - Fixed some unit test compatibility issues
    - Fixed race conditions caused by Promise polyfill
    - https://github.com/google/shaka-player/issues/251

Docs:
  - Update browser support docs with regard to IE & Firefox

Test app fixes:
  - Fixed slider controls for IE11
  - Turned off seek bar tooltips for IE11


## 1.6.2 (2015-12-14)

Features:
  - Added a new configure parameter to allow a user to completely disable
    the cache-buster.  This is necessary for certain CDNs, but please note
    the tradeoffs before using.  Bandwidth estimation can be adversely
    affected, particularly for low-bandwidth users.
    - https://github.com/google/shaka-player/issues/235
    - https://github.com/google/shaka-player/issues/238
    - https://github.com/google/shaka-player/issues/76

Bugfixes:
  - Fixed interpretation of startNumber for SegmentTemplate w/ duration.
    - https://github.com/google/shaka-player/issues/237


## 1.6.1 (2015-12-07)

Bugfixes:
  - Fixed handling when all streams are removed in a manifest update.
  - Fixed annotation mistakes in preparation for a new compiler release.
  - Fixed Promise polyfill errors in compiled mode.
    - https://github.com/google/shaka-player/issues/236


## 1.6.0 (2015-11-17)

Features:
  - Partial IE11 & PlayReady support.  (Thanks, Jono!)
    - https://github.com/google/shaka-player/pull/176
    - *live and offline content not working*
    - *non-zero start times not working*
    - *IE11 fails to decode some test assets*
      - https://github.com/google/shaka-player/issues/224
  - Added support for setPlaybackStartTime on live streams.
    - https://github.com/google/shaka-player/pull/231
  - Improved support for live streaming corner cases.
    - https://github.com/google/shaka-player/issues/139
    - https://github.com/google/shaka-player/issues/140
    - https://github.com/google/shaka-player/issues/141
    - https://github.com/google/shaka-player/issues/145
    - https://github.com/google/shaka-player/issues/185
  - Now builds with three different configs by default.
    - Full build (all features enabled).
    - DASH MP4 VOD. (Only DASH w/ SegmentBase, no WebM.)
    - DASH MP4 live. (Only DASH w/o SegmentBase, no WebM.)
    - https://github.com/google/shaka-player/issues/116
  - Changed startNumber implementation to be more consistent.
    - https://github.com/google/shaka-player/issues/192
  - Added a new Promise polyfill for IE11.
  - Added support for WebM w/ unknown size in the Segment element.

Bugfixes:
  - Expired sessions (for example, when using key rotation) are now cleaned up.
    - https://github.com/google/shaka-player/issues/210
  - Manifests can now be reprocessed without an update when
    availabilityStartTime passes.
    - https://github.com/google/shaka-player/issues/172

Test app features:
  - Added Chromecast support to the demo app.
    (No changes to the library for this.)
    - https://github.com/google/shaka-player/issues/117
  - Removed force-prefixed feature for improved IE11 support.
    - https://github.com/google/shaka-player/issues/222
  - Added links to the project and the docs.

Broken Compatibility:
  - Removed Player methods deprecated since v1.5.0.
    - enableAdaptation
    - getAdaptationEnabled
    - setStreamBufferSize
    - getStreamBufferSize
    - setLicenseRequestTimeout
    - setMpdRequestTimeout
    - setRangeRequestTimeout
    - setPreferredLanguage
    - setRestrictions
    - getRestrictions
    - https://github.com/google/shaka-player/issues/203
    - https://github.com/google/shaka-player/issues/93
  - Removed support for the old-style ContentProtection callback, deprecated
    since v1.5.0.
    - https://github.com/google/shaka-player/issues/203
    - https://github.com/google/shaka-player/issues/71


## 1.5.2 (2015-11-12)

A roll-up of recent bugfixes.

Bugfixes:
  - Fixed timestamp correction for some live streams from Elemental.
    - https://github.com/google/shaka-player/issues/200
  - Fixed support for manifests with different PSSHs per Representation.
    - https://github.com/google/shaka-player/issues/229
  - Fixed support for ContentProtection elements at both AdaptationSet and
    Representation level in the same manifest.
    - https://github.com/google/shaka-player/issues/230
  - Fixed support for bound DrmInfo callbacks.
    - https://github.com/google/shaka-player/issues/227
  - Fixed the 'enabled' flag of text tracks when manipulated directly by the
    video element.
    - https://github.com/google/shaka-player/issues/214
  - Fixed buffering to use the correct goal (minBufferTime) when re-buffering.
    - https://github.com/google/shaka-player/issues/190
  - Fixed a broken link in the documentation.  (Thanks, Leandro.)
    - https://github.com/google/shaka-player/issues/217
    - https://github.com/google/shaka-player/pull/218

Test app features:
  - Added a Widevine-encrypted version of the Sintel 4k test asset.


## 1.5.1 (2015-10-07)

A roll-up of recent bugfixes.

Bugfixes:
  - Fixed a major memory leak introduced in 1.5.0.
    - https://github.com/google/shaka-player/issues/184
  - Deleting encrypted offline content now deletes persistent sessions.
    - https://github.com/google/shaka-player/issues/171
  - Static content using SegmentTemplate is now truncated at the Period's
    duration.
    - https://github.com/google/shaka-player/issues/187
    - https://github.com/google/shaka-player/issues/173
  - Key status error reporting is now more consistent and provides more
    information.
  - Reduced flakiness in some tests.
  - Requests used for clock sync no longer allow caching.
    - https://github.com/google/shaka-player/issues/191


## 1.5.0 (2015-09-17)

Features:
  - Added method to set playback start time.
    - https://github.com/google/shaka-player/issues/122
    - https://github.com/google/shaka-player/pull/123
  - Added a text-styling API.
    - https://github.com/google/shaka-player/issues/115
  - Added support for AdaptationSet groups.
    - https://github.com/google/shaka-player/issues/67
  - Added a new configuration API.
    - https://github.com/google/shaka-player/issues/93
  - License preprocessing can now modify HTTP method and server URL.
    - https://github.com/google/shaka-player/issues/134
    - https://github.com/google/shaka-player/issues/135
  - Added an API to load captions not specified in the manifest.
    - https://github.com/google/shaka-player/issues/133
  - Added support for live streams using SegmentList.
    - https://github.com/google/shaka-player/issues/88
  - Added support for multiple BaseURL elements for failover.
    - https://github.com/google/shaka-player/issues/68
  - Gave IAbrManager implementation the ability to clear the buffer when
    switching streams.
    - https://github.com/google/shaka-player/pull/144
  - Added setNetworkCallback API to DashVideoSource to modify network requests.
    - https://github.com/google/shaka-player/issues/148
  - Improved error reporting for unplayable content.
  - Added support for multiple DRM schemes per ContentProtection and simplified
    DRM scheme configuration.
    - https://github.com/google/shaka-player/issues/71
  - Improved documentation for license pre- and post-processing.
    - https://github.com/google/shaka-player/issues/137

Bugfixes:
  - Restricting all video tracks now fires an error event.
    - https://github.com/google/shaka-player/issues/179
    - https://github.com/google/shaka-player/issues/170
  - Changing text tracks now fires an adaptation event.
    - https://github.com/google/shaka-player/issues/147
  - Fixed bad interactions between pausing and negative playback rates.
    - https://github.com/google/shaka-player/issues/130
  - Fixed support for negative r values in SegmentTimeline.
    - https://github.com/google/shaka-player/issues/162
  - Fixed bugs that could cause infinite buffering for certain configurations.
    - https://github.com/google/shaka-player/issues/166
  - Fixed exceptions fired during rapid Player destroy().
    - https://github.com/google/shaka-player/issues/151
  - Fixed linting with conflicting globally-installed copy of linter library.
    - https://github.com/google/shaka-player/issues/153
  - Fixed support for SegmentTimelines with presentationTimeOffset.
    - https://github.com/google/shaka-player/issues/143
  - Fixed support for apps/content which specify multiple DRM scheme configs.
    - https://github.com/google/shaka-player/issues/177

Broken Compatibility:
  - Removed Player methods deprecated since v1.3.0.
    - getCurrentResolution
    - getCurrentTime
    - getDuration
    - getMuted
    - getVolume
    - play
    - pause
    - requestFullscreen
    - seek
    - setMuted
    - setVolume
    - https://github.com/google/shaka-player/issues/118

Deprecated:
  - The following methods on Player are deprecated in favor of
    configure()/getConfiguration() and will be removed in v1.6.0:
    - enableAdaptation
    - getAdaptationEnabled
    - setStreamBufferSize
    - getStreamBufferSize
    - setLicenseRequestTimeout
    - setMpdRequestTimeout
    - setRangeRequestTimeout
    - setPreferredLanguage
    - setRestrictions
    - getRestrictions
    - https://github.com/google/shaka-player/issues/93
  - A new two-argument ContentProtectionCallback has been added to
    DashVideoSource, and the old style is deprecated and will be removed
    in v1.6.0.
    - https://github.com/google/shaka-player/issues/71


## 1.4.2 (2015-09-04)

A roll-up of recent bugfixes.

Bugfixes:
  - Fix storage of duplicate session IDs for encrypted offline content.
  - Specify EME sessionTypes, required in newer EME draft.
    - https://github.com/google/shaka-player/issues/128
  - Fix regression in rewind support, once more working outside buffered range.
    - https://github.com/google/shaka-player/issues/165
  - Support renamed output protection errors from newer EME draft.
  - Fix seeking in custom controls on Android.
    - https://github.com/google/shaka-player/issues/164
  - Fix missing final chunk when storing certain videos for offline playback.
    - https://github.com/google/shaka-player/issues/157
  - Prevent crashing of module loaders which use 'define' but are not full AMD
    loaders.
    - https://github.com/google/shaka-player/issues/163

Test app features:
  - Added 'offline' URL param.


## 1.4.1 (2015-08-18)

A roll-up of recent bugfixes and small improvements.

Bugfixes:
  - An exception is no longer thrown from StreamVideoSource in uncompiled mode
    when the stream limits cannot be computed.
  - Fixed support for multiple encrypted audio tracks.
    - https://github.com/google/shaka-player/issues/112
  - Fixed support for manifests that use SegmentList with a single URL.
  - Fixed support for audio and video robustness settings in compiled mode.
  - The MPD 'main' property is now defined in the correct class.
  - The same initialization segment is no longer inserted multiple times into
    the SourceBuffer.
  - Removed a race in Stream that could stop AdaptationEvents from firing.
  - Stopped the compiler from renaming PersistentState and DistinctiveIdentifier
    enum values.
  - Removed a race in Player.getStats() that could cause NaN stats.
  - Fixed support to recover from failed segment requests.
    - https://github.com/google/shaka-player/issues/131
  - Made rewind, pause, play, and fast-forward consistent with normal video
    element behavior, the UI, and Player.setPlaybackRate().
    - https://github.com/google/shaka-player/issues/130
    - https://github.com/google/shaka-player/issues/138
  - Improved seek handling during stream startup.
    - https://github.com/google/shaka-player/issues/136
  - Unnecessary seeking events during stream startup are no longer fired.
    - https://github.com/google/shaka-player/issues/132
  - Segment fetches are no longer retried if the Stream has been destroyed.
    - https://github.com/google/shaka-player/issues/156
  - Fixed support for offline in compiled mode.

Features:
  - The version indicator on the demo page now displays the NPM version (if
    available) when the git version is unavailable.
  - Added support to clear the audio buffer when switching tracks.
    - https://github.com/google/shaka-player/issues/119
  - Added the ability to detect and recover from multiple buffered ranges.
    - https://github.com/google/shaka-player/issues/121
  - Improved error messages when persistent licenses are not supported.
    - https://github.com/google/shaka-player/issues/85

Testing:
  - Reduced test flakiness overall.
  - Certain (unavoidable) decode errors are now suppressed on Chrome Linux.
  - Added waitUntilBuffered() function to help reduce test flakiness.


## 1.4.0 (2015-07-06)

Code health release.  Major refactoring of streaming logic.

Bugfixes:
  - Overriding a license server URL in the test app no longer causes a PSSH
    from the MPD to be ignored.
  - Fixed possible event listener leak.
    - https://github.com/google/shaka-player/issues/109

Features:
  - Player.destroy() now returns a Promise.
  - DrmSchemeInfo now has distinctiveIdentifier, persistentState, and
    robustness parameters.
  - Clarified buffering event policies.
    - https://github.com/google/shaka-player/issues/77
  - Added a license pre-processor.
    - https://github.com/google/shaka-player/issues/62
  - Added support for the MPD Location element.
    - https://github.com/google/shaka-player/issues/65
  - Custom BandwidthEstimators can now allow XHR caching.
    - https://github.com/google/shaka-player/issues/76
  - Added support for startNumber of 0, per the recent DASH spec corrigendum.
    - https://github.com/google/shaka-player/issues/10
  - Added support for server certificate APIs through DrmSchemeInfo.
    - https://github.com/google/shaka-player/issues/84
  - Major refactor of streaming.  Switching representations is now faster and
    more flexible.  Live stream seek ranges are more accurate.
    - https://github.com/google/shaka-player/issues/51
  - XHR timeout is now runtime-configurable.
    - https://github.com/google/shaka-player/issues/50
  - Buffering goals are now runtime-configurable.
    - https://github.com/google/shaka-player/issues/49
  - Alternative IAbrManager implementations can now be injected at runtime.
    - https://github.com/google/shaka-player/issues/48

Test app features:
  - Added "buffered ahead" and "buffered behind" indicators.
    - https://github.com/google/shaka-player/issues/47
  - Converted cycle buttons into checkboxes so cycling can be stopped during
    playback.
    - https://github.com/google/shaka-player/issues/46
  - Test app now jumps to live when the user clicks on the time code in a live
    stream.
  - Added an example of a trick-play UI built on the Player API.
    - https://github.com/google/shaka-player/issues/54

Testing:
  - Disabled code coverage stats in unit tests by default.
    - https://github.com/google/shaka-player/issues/105
  - Split unit tests and integration tests into separate test runners.
    - https://github.com/google/shaka-player/issues/104
  - Added a Karma config file to make automated testing easier.
  - Added checks for offline features to the support-testing page.

Documentation:
  - Documented the fact that autoplay does not work on mobile, and why.
  - Documented error events and how to handle them.
    - https://github.com/google/shaka-player/issues/106
  - Documented browser support and porting.
    - https://github.com/google/shaka-player/issues/66
  - Documented Player APIs for trick play interface.
    - https://github.com/google/shaka-player/issues/54


## 1.3.2 (2015-07-06)

A roll-up of recent bugfixes.

Bugfixes:
  - Fixed case-sensitive scheme URI check in the test app.
  - Fixed support-testing page for very old browsers.
  - Fixed multi-lingual encrypted content.
    - https://github.com/google/shaka-player/issues/112
  - Fixed load-time exceptions in IE 9.
    - https://github.com/google/shaka-player/issues/87
    - https://github.com/google/shaka-player/pull/110


## 1.3.1 (2015-05-22)

A roll-up of recent bugfixes and small improvements.

Bugfixes:
  - Fixed some broken tests.
  - Fixed buffering states.
    - https://github.com/google/shaka-player/issues/61
  - Fixed fullscreen polyfill installation.
    - https://github.com/google/shaka-player/issues/81
  - Fixed handling of live content with minimumUpdatePeriod of 0.
    - https://github.com/google/shaka-player/pull/64
  - Fixed selection of live content (type=dynamic).
    - https://github.com/google/shaka-player/issues/69
    - https://github.com/google/shaka-player/issues/70
  - Fixed AJAX request timeouts.
    - https://github.com/google/shaka-player/issues/78
    - https://github.com/google/shaka-player/pull/79
  - Fixed spec compliance for polyfilled session expiration.
  - Fixed buffer time for offline playback.
  - Fixed offline API consistency.
    - https://github.com/google/shaka-player/issues/72

Features:
  - Refactored and updated support test page.
    - http://shaka-player-demo.appspot.com/support.html
  - Simplified polyfill installation. (shaka.polyfill.installAll)
  - New polyfill for CustomEvent.
  - Small improvements to browser compatibility.
    - (node.childNodes, node.textContent, currentScript, CSS fixes, etc.)
  - Documented clock sync and CORS issues with live content.
    - https://github.com/google/shaka-player/issues/53
  - Documented JRE requirements.
  - Test app now accepts a URL parameter to make ChromeCast testing easier.
    - https://github.com/google/shaka-player/issues/56
  - Stopped using deprecated methods in tests and tutorials.
    - https://github.com/google/shaka-player/issues/73
  - Added progress events for storing offline content.
  - Documented offline APIs.
    - https://github.com/google/shaka-player/issues/60


## 1.3.0 (2015-04-16)

Feature release, introducing live streaming and offline playback.

Bugfixes:
  - Fixed playback and buffering of streams whose index is inaccurate.
  - Fixed EME spec compliance.
    - https://github.com/google/shaka-player/issues/45
  - Fixed FakeEventTarget exception handling.
  - Fixed aggressive dead code stripping by the compiler.
  - Fixed a bug in which subtitles were enabled by default without a subtitle
    language match.

Features:
  - Added offline playback support.
    - https://github.com/google/shaka-player/issues/22
  - Added offline support for encrypted content (on platforms which support
    persistent licenses).
    - https://github.com/google/shaka-player/issues/23
  - Added live stream support.
    - https://github.com/google/shaka-player/issues/21
  - Added support for header-based clock synchronization.
  - Added support for inheriting Segment{Base,List,Template} across levels in
    MPDs.
  - Add polyfill support for fullscreen events.
  - Updated EME usage to the March 12 draft.
  - Added Player.getAdaptationEnabled().
    - https://github.com/google/shaka-player/pull/31
  - Added support for bandwidth restrictions and restrictions not based on
    license responses.
    - https://github.com/google/shaka-player/pull/36
  - Added support for requireJS and improved support for commonJS.
  - Sped up integration tests and improved test robustness.
  - Bandwidth estimates can now be persisted across playbacks.
  - Custom bandwidth estimator objects can now be injected into the Player.
  - Improved EME v0.1b polyfill consistency with native EME in Chrome.
  - Improved buffering and underflow mechanisms.
  - Improved error reporting if DRM info is missing.
  - Improved robustness in the face of HTTP 404 and 410 errors during segment
    fetch.
  - Improved documentation for Role tags and multilingual assets.

Test app features:
  - Example player controls in the test app.

Deprecated:
  - The following methods on Player are deprecated.  They will be removed in
    v1.4.0:
    - getCurrentResolution() (replace with video.videoWidth & video.videoHeight)
    - getCurrentTime()/seek() (replace with video.currentTime)
    - getDuration() (replace with video.duration)
    - getMuted()/setMuted() (replace with video.muted)
    - getVolume()/setVolume() (replace with video.volume)
    - play() (replace with video.play)
    - pause() (replace with video.pause)
    - requestFullscreen() (replace with video.requestFullscreen())

Broken compatibility:
  - The license postprocessor callback is no longer given a Restrictions
    argument.  See Player.getRestrictions()/setRestrictions().
  - The suppressMultipleEvents flag has been dropped from DrmSchemeInfo, which
    changes the constructor signature.  This flag interfered with key rotation.


## 1.2.3 (2015-04-07)

A roll-up of recent bugfixes.

Bugfixes:
  - Fixed consistency of setPlaybackRate(0).
  - Fixed support for mp4a.40.5 audio content.
  - Improved rewind accuracy.
  - Fixed decode of query parameters in content URLs.
    - https://github.com/google/shaka-player/pull/40
  - Fixed FakeEventTarget for Chrome 43+.
  - Removed flaky assertion in EME polyfill.
  - Made AbrManager less aggressive.
  - Fixed EME spec compatibility and encrypted playback in Chrome 43+.
    - https://github.com/google/shaka-player/issues/45

Features:
  - Added support for module.exports.
    - https://github.com/google/shaka-player/pull/35

Test app features:
  - Added a new 4k test asset.


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

[Feb 9 2015 EME spec]: https://bit.ly/EmeFeb15
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

