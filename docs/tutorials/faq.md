# Frequently Asked Questions

**Q:** My live stream is buffering forever or doesn't play.

**A:** Check your time-sync.  In v1 we would adjust automatically to account for
bad content.  But now in v2, we don't.

This requires setting up clock sync for live streams.  This can be done by
adding a `<UTCTiming>` element to the manifest or by setting the
[`.manifest.dash.clockSyncUri`][DashManifestConfiguration] configuration.
See [#386(comment)][386] for more info.

<hr>

**Q:** I am getting decoder errors or `VIDEO_ERROR` or error code 3016.

**A:** This error is given to us when the browser can't play the content.  This
is out of our control and is usually caused by bad content.  On Chrome you can
check `chrome://media-internals` for more info (see [#489(comment)][489]).

<hr>

**Q:** I am getting `HTTP_ERROR` or error code 1002.

**A:** The browser rejected the request.  Look at the browser logs for more
info.  This is usually a [CORS][] error, which means you need particular
headers in the response.

This can also happen with mixed-content restrictions.  If the site is using
`https:`, then your manifest and segments must also.

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

**Q:** My HLS manifest doesn't load.

**A:** If your HLS manifest describes MPEG2-TS content, the only browsers
capable of playing it are Edge, Chromecast and Safari. You will get an
`UNPLAYABLE_PERIOD` error on other browsers due to their lack of TS support.

We also were not able to make it work on Safari yet due to a bug in their
MediaSource implementation ([#743][743]).

Please file a issue if your TS content isn't playing in Chromecast or Edge
and your MP4 content - on any browser.

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


[386]: https://github.com/google/shaka-player/issues/386#issuecomment-227898001
[489]: https://github.com/google/shaka-player/issues/489#issuecomment-240466224
[743]: https://github.com/google/shaka-player/issues/743
[AbrConfiguration]: https://shaka-player-demo.appspot.com/docs/api/shakaExtern.html#AbrConfiguration
[CORS]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS
[DashManifestConfiguration]: https://shaka-player-demo.appspot.com/docs/api/shakaExtern.html#DashManifestConfiguration
[StreamingConfiguration]: https://shaka-player-demo.appspot.com/docs/api/shakaExtern.html#StreamingConfiguration
[auth]: https://shaka-player-demo.appspot.com/docs/api/tutorial-license-server-auth.html
[buffering]: https://shaka-player-demo.appspot.com/docs/api/tutorial-network-and-buffering-config.html
[wrapping]: https://shaka-player-demo.appspot.com/docs/api/tutorial-license-wrapping.html
