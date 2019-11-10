# Frequently Asked Questions

**Q:** My live stream is buffering forever or doesn't play.

**A:** Check your time-sync.  In v1 we would adjust automatically to account for
bad content.  But now in v2, we don't.

This requires setting up clock sync for live streams.  This can be done by
adding a `<UTCTiming>` element to the manifest or by setting the
[`.manifest.dash.clockSyncUri`][DashManifestConfiguration] configuration.
See [#386(comment)][386] for more info.

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

**Q:** Why doesn't my HLS content work?

**A:** If your HLS content uses MPEG2-TS, you may need to enable transmuxing.
The only browsers capable of playing TS natively are Edge and Chromecast.  You
will get a `CONTENT_UNSUPPORTED_BY_BROWSER` error on other browsers due to
their lack of TS support.

You can enable transmuxing by [including mux.js][] v5.1.3+ in your application.
If Shaka Player detects that mux.js has been loaded, we will use it to transmux
TS content into MP4 on-the-fly, so that the content can be played by the
browser.

<hr>

**Q:** Why does it take so long to switch to HD?

**A:** When Shaka Player's `AbrManager` makes a decision to adapt, we don't
clear any of the content that has already been buffered.  (We used to, but it
does not work consistently across browsers and created a bad experience.)

This means that if you want to see the results of a new decision sooner, you
should have a less aggressive buffering goal.  See the tutorial on [buffering
configuration][buffering] and the docs for the
[`.streaming.bufferingGoal`][StreamingConfiguration] configuration.

Another factor is the segment size.  It may take up to 2 segments before Shaka
Player has enough information to form a bandwidth estimate and make a decision.
If your content uses 10-second segments, this means we may buffer 20 seconds
of low quality video before we make a decision.  If it is too late to change
the segment size in your content library, you may want to adjust the "default"
bandwidth estimate used by Shaka Player to select the first segments.  Use the
[`.abr.defaultBandwidthEstimate`][AbrConfiguration] configuration to control
these initial decisions.

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
shaka.net.NetworkingEngine.registerScheme('file', shaka.net.HttpXHRPlugin);
```

<hr>

**Q:** Why are my CEA-708 captions not showing on Edge or Chromecast?

**A:** Our support for CEA-708 captions requires transmuxing the TS files that
contain said captions.  Edge and Chromecast, however, have native TS support and
thus are not required to transmux.
In order to force those platforms to transmux, set the
[`.streaming.forceTransmuxTS`][StreamingConfiguration] configuration to true.

<hr>

**Q:** Why do I get 404 errors with very large timescales?

**A:** We can't handle content that creates timestamps too large to be
represented as Numbers in JavaScript (2^53).  Very large timescales require very
large timestamps (in timescale units), which means we are unable to substitute
the correct values for `$Time$` in a `<SegmentTemplate>`.  [BigInteger.js][] is
too large to become a required dependency for Shaka Player.

We recommend reducing your timescale or avoiding `$Time` in `<SegmentTemplate>`.
See discussion in [#1667][1667] for details.

<hr>

**Q:** I get logs like: `It is recommended that a robustness level be
specified...`.

**A:** This is a warning from Chrome about setting the robustness level for EME.
For most content, this warning can be safely ignored (see
<https://crbug.com/720013>).  If your content requires a specific robustness
level, it is suggested to set it in the player configuration to ensure playback
works: `.drm.advanced.<key_system>.audioRobustness` and
`.drm.advanced.<key_system>.videoRobustness` (see
[docs][AdvancedDrmConfiguration]).

<hr>

**Q:** Does Shaka Player support iOS?

**A:** Starting in v2.5, we support it through Apple's native HLS player.  So
you can use the same top-level APIs; but we are dependent on the browser
handling the streaming.  So we won't support DASH on iOS since the browser
doesn't support it.

We have another project called [Shaka Player Embedded][] that offers the same
features and similar APIs for native apps on iOS.  This project uses its own
media stack, which allows it to play content that would otherwise not be
supported.  This supports both DASH and HLS manifests.


[386]: https://github.com/google/shaka-player/issues/386#issuecomment-227898001
[489]: https://github.com/google/shaka-player/issues/489#issuecomment-240466224
[743]: https://github.com/google/shaka-player/issues/743
[887]: https://github.com/google/shaka-player/issues/887
[999]: https://github.com/google/shaka-player/issues/999
[1667]: https://github.com/google/shaka-player/issues/1667
[AbrConfiguration]: https://shaka-player-demo.appspot.com/docs/api/shaka.extern.html#.AbrConfiguration
[AdvancedDrmConfiguration]: https://shaka-player-demo.appspot.com/docs/api/shakaExtern.html#.AdvancedDrmConfiguration
[BigInteger.js]: https://github.com/peterolson/BigInteger.js
[CORS]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS
[DashManifestConfiguration]: https://shaka-player-demo.appspot.com/docs/api/shaka.extern.html#.DashManifestConfiguration
[Shaka Player Embedded]: https://github.com/google/shaka-player-embedded
[StreamingConfiguration]: https://shaka-player-demo.appspot.com/docs/api/shaka.extern.html#.StreamingConfiguration
[auth]: https://shaka-player-demo.appspot.com/docs/api/tutorial-license-server-auth.html
[buffering]: https://shaka-player-demo.appspot.com/docs/api/tutorial-network-and-buffering-config.html
[drm_tutorial]: https://shaka-player-demo.appspot.com/docs/api/tutorial-drm-config.html
[eme_https]: https://sites.google.com/a/chromium.org/dev/Home/chromium-security/deprecating-powerful-features-on-insecure-origins
[wrapping]: https://shaka-player-demo.appspot.com/docs/api/tutorial-license-wrapping.html
[including mux.js]: https://github.com/google/shaka-player/blob/967f3399/demo/index.html#L39
