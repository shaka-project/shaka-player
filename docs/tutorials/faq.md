# Frequently Asked Questions

**Q:** Does Shaka Player support IE11?

**A:** Shaka Player no longer supports IE11 beyond v3.1. If you need Shaka
Player with IE support, checkout v3.0.x and previous versions.

<hr>

**Q:** My live stream is buffering forever or doesn't play.

**A:** Check your time-sync.  In v1 we would adjust automatically to account for
bad content.  But now in v2, we don't.

This requires setting up clock sync for live streams.  This can be done by
adding a `<UTCTiming>` element to the manifest or by setting the
{@link shaka.extern.html.DashManifestConfiguration|
`.manifest.dash.clockSyncUri`} configuration. See [#386(comment)][386] 
for more info.

We also have issues with "drifting" DASH streams.  If your encoder experiences
drift, you may need to address that with the encoder.  We have plans to be
more tolerant of drift in future.  See [#999][999] for more info.

<hr>

**Q:** I am getting decoder errors or `VIDEO_ERROR` or error code 3016.

**A:** This error is given to us when the browser can't play the content.  This
is out of our control and is usually caused by bad content.  On Chrome you can
check `chrome://media-internals` for more info (see [#489(comment)][489]).

<hr>

**Q:** I am getting `HTTP_ERROR` or error code 1002.

**A:** The browser rejected the request.  Look at the browser logs for more
info.  This is usually a [CORS][] error, which means you need particular
headers in the response.  Additionally, with some manifests, we will send a
`Range` header.  This will require explicit approval through the CORS header
`Access-Control-Allow-Headers`.

This can also happen with mixed-content restrictions.  If the site is using
`https:`, then your manifest and segments must also.

<hr>

**Q:** I am getting `REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE` or error code
6001.

**A:** The most common cause is that you are not using a secure origin.  The
EME API in the browser requires a secure origin, which means `https` or
`localhost`.  Chrome enforces this requirement, but other browsers may not yet.
See the [announcement][eme_https] for more info.

You should also check that your platform/browser actually supports the key
system.  If your manifest contains only PlayReady, it will need to be played on
IE/Edge, a Chromecast, or another device with PlayReady.
See the [DRM tutorial][drm_tutorial] for more info.

This will also happen if you use `Storage` to store protected content (when
`usePersistentLicense` is true).  Currently, persistent licenses are supported
on Chromebooks and Chrome 64+ on Mac/Windows.  On other platforms, you can only
store clear content or store only the content offline (i.e. set
`usePersistentLicense` configuration to false).

<hr>

**Q:** I am getting `LICENSE_REQUEST_FAILED` or error code 6007.

**A:** See `HTTP_ERROR`.  If you are getting a bad HTTP status, the server
rejected the request.  Your proxy may require [wrapping][wrapping] the request
or it may require [extra authentication][auth].

<hr>

**Q:** I am getting `INVALID_SERVER_CERTIFICATE` or error code 6004.

**A:** You need to get the license certificate from your DRM provider.  This is
**not** the HTTPS certificate of the proxy or any files on your proxy.  This
should be the certificate of the license server given by your provider.

The certificate can only be used for that license server, but can be used with
different proxies so long as they use the same license server.  For Widevine,
the certificate should be binary, so avoid fetching the response as a string
(e.g. with `responseText`).

<hr>

**Q:** I am getting `LICENSE_RESPONSE_REJECTED` or error code 6008.

**A:** Check the DevTools network tab for the response.  Verify that the
response data looks correct.  For Widevine, the response should be binary.  If
you see JSON, you will need to [unwrap the response][wrapping].

<hr>

**Q:** Why does it take so long to switch to HD?

**A:** When Shaka Player's `AbrManager` makes a decision to adapt, we don't
clear any of the content that has already been buffered.  (We used to, but it
does not work consistently across browsers and created a bad experience.)

This means that if you want to see the results of a new decision sooner, you
should have a less aggressive buffering goal.  See the tutorial on [buffering
configuration][buffering] and the docs for the {@link 
shaka.extern.StreamingConfiguration|`.streaming.bufferingGoal`} configuration.

Another factor is the segment size.  It may take up to 2 segments before Shaka
Player has enough information to form a bandwidth estimate and make a decision.
If your content uses 10-second segments, this means we may buffer 20 seconds
of low quality video before we make a decision.  If it is too late to change
the segment size in your content library, you may want to adjust the "default"
bandwidth estimate used by Shaka Player to select the first segments.  Use the
{@link shaka.extern.AbrConfiguration|`.abr.defaultBandwidthEstimate`} 
configuration to control these initial decisions.

<hr>

**Q:** I am getting `UNSUPPORTED_SCHEME` or error code 1000 when loading from
`file://`.

**A:** In a browser environment, trying to load a file from `file://` is
inappropriate. Therefore, we do not provide a default network plugin for such
requests.

In other environments, for example Electron, it is appropriate.
In those cases, before Shaka Player loads a manifest, you can register the
existing http plugin for `file://` requests:
```js
shaka.net.NetworkingEngine.registerScheme('file', shaka.net.HttpXHRPlugin.parse);
```

<hr>

**Q:** Why do I get 404 errors with very large timescales?

**A:** Some content creates timestamps too large to be represented as Numbers
in JavaScript (2^53).  Very large timescales require very large timestamps (in
timescale units), which means we are unable to substitute the correct values
for `$Time$` in a `<SegmentTemplate>`.

We can work around this for platforms that support [`BigInt`][], or in cases
where we can live with a rounding error (not `$Time$` in `<SegmentTemplate>`).

If you must use `$Time` in `<SegmentTemplate>` and you must play on devices
that do not support [`BigInt`][], we recommend reducing your timescale.
See discussion in [#1667][1667] for details.

<hr>

**Q:** I get logs like: `It is recommended that a robustness level be
specified...`.

**A:** This is a warning from Chrome about setting the robustness level for EME.
For most content, this warning can be safely ignored (see
<https://crbug.com/720013>).  If your content requires a specific robustness
level, it is suggested to set it in the player configuration to ensure playback
works: `.drm.advanced.<key_system>.audioRobustness` and
`.drm.advanced.<key_system>.videoRobustness` (see {@link 
shaka.extern.AdvancedDrmConfiguration|docs}).

<hr>

**Q:** Does Shaka Player support iOS?

**A:** Starting in v2.5, we support it through Apple's native HLS player.  So
you can use the same top-level APIs; but we are dependent on the browser
handling the streaming.  So we won't support DASH on iOS since the browser
doesn't support it.

In a future version, we plan to support `ManagedMediaSource` on iOS to achieve
control over both DASH and HLS playback on iOS.  See [#5271][] and the
[`ManagedMediaSource` W3C spec proposal][]

<hr>

**Q:** The Nightly Demo isn't loading for me!

**A:** Are you looking at the uncompiled build with an AdBlocker enabled?

Some ad blockers decide to block requests for some of our source files simply
because they have `ad` in the file name. This only affects the uncompiled
build.

Switch to the compiled build (add "build=compiled" to the url) or temporarily
disable your ad blocker to see the nightly in uncompiled mode.

Please note that if you want to test our ad logic, you might have to disable
the ad blocker in compiled mode as well.

<hr>

**Q:** Why does some DASH content take a long time to start playback?

**A:** Shaka Player honors the `minBufferTime` field in DASH.  If this field is
set to a large value, Shaka Player will buffer that much content before
beginning playback.  To override this behavior and ignore the `minBufferTime`
field, we offer the following configuration:

```js
player.configure('manifest.dash.ignoreMinBufferTime', true);
```

<hr>

**Q:** My HLS stream is failing on Chrome, with a chunk demuxer append failed
error.

**A:** For a stream to play properly on some browsers, we need to know ahead of
time what the codecs of the stream are.  If no codec information is provided in
an HLS manifest, we do our best to guess what the codecs might be, but those
guesses might not always be accurate.  If an HLS manifest has no codec
information provided, we default to guessing that the video codec is
`avc1.42E01E` and the audio codec is `mp4a.40.2`, which can cause problems if
the stream is actually video-only or audio-only.

To change our default assumptions about codecs in HLS, please see
{@link shaka.extern.HlsManifestConfiguration|`.manifest.hls`} in the player
config.

<hr>

**Q:** How can I make Shaka Player work with Vue?

**A:** Currently, Shaka Player does not support being made into a Vue reactive
object. When Vue wraps an object in a reactive Proxy, it
{@link https://v3.vuejs.org/guide/reactivity.html#proxied-objects|also wraps
nested objects}. This results in Vue converting some of our internal values into
Proxy objects, which causes failures at load-time.
If you want to use Shaka Player in Vue, avoid making it into a reactive object;
so don't declare it using a ref(), and if you put your player instance into a
data() object, you can prefix the property name with "$" or "_" to make Vue not
proxy them.

[386]: https://github.com/shaka-project/shaka-player/issues/386#issuecomment-227898001
[489]: https://github.com/shaka-project/shaka-player/issues/489#issuecomment-240466224
[743]: https://github.com/shaka-project/shaka-player/issues/743
[887]: https://github.com/shaka-project/shaka-player/issues/887
[999]: https://github.com/shaka-project/shaka-player/issues/999
[1667]: https://github.com/shaka-project/shaka-player/issues/1667
[#5271]: https://github.com/shaka-project/shaka-player/issues/5271
[BigInt]: https://caniuse.com/bigint
[CORS]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS
[`ManagedMediaSource` W3C spec proposal]: https://github.com/w3c/media-source/issues/320
[Shaka Player Embedded]: https://github.com/shaka-project/shaka-player-embedded
[auth]: https://shaka-player-demo.appspot.com/docs/api/tutorial-license-server-auth.html
[buffering]: https://shaka-player-demo.appspot.com/docs/api/tutorial-network-and-buffering-config.html
[drm_tutorial]: https://shaka-player-demo.appspot.com/docs/api/tutorial-drm-config.html
[eme_https]: https://sites.google.com/a/chromium.org/dev/Home/chromium-security/deprecating-powerful-features-on-insecure-origins
[wrapping]: https://shaka-player-demo.appspot.com/docs/api/tutorial-license-wrapping.html
[including mux.js]: https://github.com/shaka-project/shaka-player/blob/967f3399/demo/index.html#L39
