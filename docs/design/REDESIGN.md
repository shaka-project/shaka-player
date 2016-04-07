# Shaka v2.0 Redesign

last update: 2016-04-07

by: [joeyparrish@google.com](mailto:joeyparrish@google.com)


## Objective

Shaka Player has been redesigned to reduce overall complexity, increase
modularity, and make it easier to introduce new features that would be too
messy in Shaka Player v1.x.  We posted a code preview on github at the end
of November 2015, and released a public beta in April 2016.


## Background

Shaka Player v1.x has been very successful, but new features are becoming more
difficult to add and old features are becoming difficult to maintain.  What
started as a simple design has gotten more complex over its first year, and
minor design flaws have been exacerbated.


## Issues in Shaka Player v1.x

Existing features in Shaka are [difficult][] [to exclude][] [from the build][],
often requiring [multiple][] [fixes][] to get certain dependencies removed.
This means users all end up using the same monolithic player library.
Features in Shaka 2 should be modular and easy to exclude from the build.

[difficult]: https://github.com/google/shaka-player/commit/671611ef3722169b9f6b51ab44bdd6b4098d959e
[to exclude]: https://github.com/google/shaka-player/commit/603fae969550c69ea38a61249da905857c67b9f1
[from the build]: https://github.com/google/shaka-player/commit/f248647685b92ba928bbfd06d45d2b99023d60c2
[multiple]: https://github.com/google/shaka-player/commit/39be45d3d55cdcef20a6a529a87246b0ea11cb33
[fixes]: https://github.com/google/shaka-player/commit/6fe239150a8939728876e93e1a4269032530d9f1

Some operations, in particular [starting playback and filling the buffer][],
take longer than they need to.  Startup and buffering in Shaka 2 should be as
low-latency as possible without complicating the code.

[starting playback and filling the buffer]: https://groups.google.com/forum/#!topic/shaka-player-users/Icvx6ymGyEs

The system of [StreamVideoSource][], [Stream][], and [SourceBufferManager][] in
Shaka 1 involves a lot of code and is difficult to synchronize, which [prevents
us from updating MediaSource duration][] and makes it [difficult to set initial
playback time][] on browsers other than Chrome.  Shaka 2 should have a simpler
streaming core that works better across browsers.

[StreamVideoSource]: https://github.com/google/shaka-player/blob/v1.5.x/lib/player/stream_video_source.js
[Stream]: https://github.com/google/shaka-player/blob/v1.5.x/lib/media/stream.js
[SourceBufferManager]: https://github.com/google/shaka-player/blob/v1.5.x/lib/media/source_buffer_manager.js
[prevents us from updating MediaSource duration]: https://github.com/google/shaka-player/blob/v1.5.1/lib/player/stream_video_source.js#L1807
[difficult to set initial playback time]: https://github.com/google/shaka-player/issues/101

[Buffering state][] in Shaka 1 involves coordination between several layers
(from [Player][] to [Stream][]) and has been [tough][] [to][] [get][]
[right][].  Buffering state in Shaka 2 should be simple and consistent.

[Buffering state]: https://github.com/google/shaka-player/blob/v1.5.1/lib/player/player.js#L994
[Player]: https://github.com/google/shaka-player/blob/v1.5.x/lib/player/player.js
[Stream]: https://github.com/google/shaka-player/blob/v1.5.x/lib/media/stream.js
[tough]: https://github.com/google/shaka-player/issues/44
[to]: https://github.com/google/shaka-player/issues/63
[get]: https://github.com/google/shaka-player/issues/127
[right]: https://github.com/google/shaka-player/issues/221#issuecomment-152781243

Shaka 1 relies on the browser to implement support for text types, and is
therefore limited to non-segmented WebVTT.  Shaka 2 should also support
[segmented text types][] and [types not natively supported by the browser][].

[segmented text types]: https://github.com/google/shaka-player/issues/150
[types not natively supported by the browser]: https://github.com/google/shaka-player/issues/111

Bandwidth estimation in Shaka 1 relies on the assumption that segments are not
cached locally.  Use of [cache-busting techniques][] to enforce this makes
Shaka very [cache][]-[unfriendly][].  Shaka 2 should be cache-friendly.

[cache-busting techniques]: https://github.com/google/shaka-player/blob/v1.5.1/lib/util/ajax_request.js#L241
[cache]: https://github.com/google/shaka-player/issues/76
[unfriendly]: https://github.com/google/shaka-player/issues/191

Shaka 1 [uses HTTP headers to synchronize the user's clock][] with the server.
This is [error-prone for some CDNs][] and also raises [CORS issues][], so Shaka
2 should avoid using HTTP headers.

[uses HTTP headers to synchronize the user's clock]: https://github.com/google/shaka-player/blob/v1.5.1/lib/util/ajax_request.js#L448
[error-prone for some CDNs]: https://github.com/google/shaka-player/issues/205
[CORS issues]: https://github.com/google/shaka-player/issues/159

[HttpVideoSource][] does not build on MSE and classes like [EmeManager][] have
special cases to support it.  Since it was originally created for debugging
purposes, Shaka 2 should drop HttpVideoSource and only support MSE-based
playback.

[HttpVideoSource]: https://github.com/google/shaka-player/blob/v1.5.x/lib/player/http_video_source.js
[EmeManager]: https://github.com/google/shaka-player/blob/v1.5.x/lib/media/eme_manager.js

Integration tests using externally-hosted resources [can be flaky][],
especially when run outside of Google's network.  Shaka 2 should avoid tests
that depend on external resources or network conditions.

[can be flaky]: https://groups.google.com/forum/#!searchin/shaka-player-users/test/shaka-player-users/rftylXoq0N4/b8_ijGYckUkJ

Error reporting is inconsistent in Shaka 1.  The format of error events varies,
and application developers sometimes [have to use error message strings][]
hard-coded into the library.  Shaka 2 should have a consistent error format
that is easy to read.

[have to use error message strings]: https://github.com/google/shaka-player/issues/201

Networking abstractions in Shaka 1 are built inside of AjaxRequest, which
requires non-HTTP requests to [pretend to come from XmlHttpRequest][].  The
networking abstraction in Shaka 2 should be simpler and should not treat
XHR as the basis for all networking.

[pretend to come from XmlHttpRequest]: https://github.com/google/shaka-player/blob/v1.5.1/lib/util/ajax_request.js#L305

A developer who wishes to use a custom network protocol or a custom manifest
format in Shaka 1 will have to modify the library to do so.  Shaka 2 should
[support external plugins for networking][] and manifest support.

[support external plugins for networking]: https://github.com/google/shaka-player/issues/198

The functionality that can be injected into Shaka 1 ([IBandwidthEstimator][],
[IAbrManager][]) is based on implementing class interfaces, which can be complex
for those unfamiliar with the Closure compiler.  Plugins and extensions to Shaka
2 should be as simple as possible.

[IBandwidthEstimator]: https://github.com/google/shaka-player/blob/v1.5.1/lib/util/i_bandwidth_estimator.js
[IAbrManager]: https://github.com/google/shaka-player/blob/v1.5.1/lib/media/i_abr_manager.js

[Static members][] in Shaka 1 make it impossible in some cases to host multiple
Player instances with different settings.  Player instances should be completely
independent in Shaka 1.

[Static members]: https://github.com/google/shaka-player/issues/126


## Shaka v2 Design Principles

Modularity: make it easy to exclude what you don't need

Extensibility: make it easy to add what we didn't give you

Portability: minimize assumptions about browser behavior

Latency: parallelize operations whenever feasible

Simplicity: organize classes to minimize and isolate complexity

Independence: instances of Player should not affect one another's state


## New Ideas

**[Extensibility]** Shaka 2 will expose a system of plugins to allow extensions and modifications
of core behavior.  Internally-implemented features (such as support for HTTP
requests or DASH manifests) will be implemented as plugins as well.

**[Modularity]** Built-in plugins (HTTP, DASH, etc) will register themselves at load-time.  In
this way, excluding a class from the build excludes that feature and all of its
dependencies.

**[Portability]** Rather than assume how browsers will implement eviction in MSE, we will start
clearing data from SourceBuffers once the playhead has moved.  The amount of
data left in buffer for backward seeking will be configurable.

**[Simplicity]** All MSE functionality (MediaSource and all SourceBuffers) will be isolated to
one object called MediaSourceEngine.  All MSE operations will be wrapped in
Promises, and synchronization will be handled internally.

**[Simplicity]** StreamVideoSource and Stream will be replaced by StreamingEngine.
StreamingEngine will own MediaSourceEngine, and will be responsible for reading
an internal representation of a manifest, fetching content, and feeding content
to MediaSourceEngine.

**[Simplicity]** To simplify segmented text and non-native text formats, we
will create TextEngine.  MediaSourceEngine and the layers above it will not
have to know the details of how text is handled, and segmented text can be
streamed exactly the same way as segmented audio and video.

**[Extensibility]** Text parsers will be plugin-based, allowing new text formats to be supported
without modifying the library.

**[Simplicity]** To avoid complicating StreamingEngine, it will be agnostic to live vs VOD
content.  The internal representation of a manifest will only contain available
segments.

**[Extensibility]** As much as possible, plugins will be simple callbacks rather than class
interfaces.  All structured input will be in the form of anonymous objects.

**[Extensibility, Simplicity]** Manifest support will be plugin-based.  A manifest plugin will be responsible
for fetching manifests, parsing manifests, and in the case of live content,
updating manifests and segment indexes.  Updates to the manifest will be made
unilaterally by the parser, without involving StreamingEngine.

**[Simplicity]** Loading a manifest in the Player will invoke an auto-detecting parser.  This
default parser will determine which parser plugin is appropriate and delegate
to it.  This simplifies the basic playback API to a single step.

**[Simplicity]** Distribute support tests through each component.  Player can test for browser
support in a hierarchical way by querying each component.  This provides a more
detailed view of feature support from the library and removes the need for the
separate browser support test in Shaka 1.


## Architecture Diagrams

See [architecture.md](architecture.md).


## Rough Sample APIs

shaka.Player(videoElement)

shaka.Player.prototype.configure({})

shaka.Player.prototype.getConfiguration() => {}

shaka.Player.prototype.load(manifestUri, opt\_startTime, opt\_manifestParserFactory) => Promise

shaka.Player.prototype.unload() => Promise

shaka.Player.prototype.destroy() => Promise

shaka.Player.prototype.trickPlay(rate)

shaka.Player.prototype.cancelTrickPlay()

shaka.Player.prototype.isLive() => boolean

shaka.Player.prototype.isBuffering() => boolean

shaka.Player.prototype.getTracks() => []

shaka.Player.prototype.selectTrack(Track)

shaka.Player.prototype.getNetworkingEngine() => NetworkingEngine

shaka.Player.prototype.isTextTrackVisible => boolean

shaka.Player.prototype.setTextTrackVisibility(boolean)

shaka.Player.prototype.getStats => Stats

shaka.Player.support() => {}

shaka.net.NetworkingEngine.registerScheme(schemeId, requestCallback)

shaka.net.NetworkingEngine.prototype.registerRequestFilter(filterCallback)

shaka.net.NetworkingEngine.prototype.registerResponseFilter(filterCallback)

shaka.media.TextEngine.registerParser(mimeType, parserCallback)

shaka.media.ManifestParser.registerParserByMime(mimeType, parser)

shaka.media.ManifestParser.registerParserByExtension(fileExt, parser)


## Sketch of Player configuration
  - preferredAudioLanguage: string
  - preferredTextLanguage: string
  - abr
    - enable: boolean
    - manager: AbrManager
    - defaultBandwidthEstimate: number
  - manifest
    - retryParameters: NetworkingEngine.RetryParameters
    - dash
      - customScheme: function(ContentProtection) => !Array.&lt;\!DrmInfo&gt;
  - drm
    - retryParameters: NetworkingEngine.RetryParameters
    - servers: Object.&lt;key system string, license server url string&gt;
    - clearKeys: Object.&lt;key id hex string, content key hex string&gt;
    - advanced: Object.&lt;key system string, advanced settings&gt;
  - streaming
    - retryParameters: NetworkingEngine.RetryParameters
    - restrictions: Restrictions
    - rebufferingGoal: number in seconds, amount to buffer ahead at startup
    - bufferingGoal: number in seconds, amount to keep ahead after startup
    - bufferBehind: number in seconds, amount kept behind the playhead

