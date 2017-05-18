# Frequently Asked Questions

**Q:** My live stream is buffering forever or doesn't play.

**A:** Check your time-sync.  In v1 we would adjust automatically to account for
bad content.  But now in v2, we don't.  So this requires setting up clock sync
for live streams.  This can be done by adding a `<UTCTiming>` element to the
manifest or by setting the `.manifest.dash.clockSyncUri`\[[1][clockSyncUri]\]
configuration option. See [#386(comment)][386] for more info.


**Q:** I am getting decoder errors or `VIDEO_ERROR` or error code 3016.

**A:** This error is given to us when the browser can't play the content.  This
is out of our control and is usually caused by bad content.  On Chrome you can
check `chrome://media-internals` for more info (see [#489(comment)][489]).


**Q:** I am getting `HTTP_ERROR` or error code 1002.

**A:** The browser rejected the request.  Look at the browser logs for more
info.  This is usually a [CORS][] error. This is usually a matter of the correct
headers in the response. This can also happen with mixed-content restrictions.
If the site is using `https:` then your manifest and segments must also.


**Q:** I am getting `LICENSE_REQUEST_FAILED` or error code 6007.

**A:** See `HTTP_ERROR`.  If you are getting a bad HTTP status, the server
rejected the request.  Your proxy may require [wrapping][wrapping] the request
or it may require [extra authentication][auth].


**Q:** I am getting `INVALID_SERVER_CERTIFICATE` or error code 6004.

**A:** You need to get the license certificate from your DRM provider.  This is
**not** the HTTPS certificate of the proxy or any files on your proxy.  This
should be the certificate of the license server given by your provider. The
certificate can only be used for that license server, but can be used with
different proxies so long as they use the same license server.  For Widevine,
the certificate should be binary, so avoid fetching the response as a string
(e.g. with `responseText`).


**Q:** I am getting `LICENSE_RESPONSE_REJECTED` or error code 6008.

**A:** Check the DevTools network tab for the response.  Verify that the
response data looks correct.  For Widevine, the response should be binary.  If
you see JSON, you will need to [unwrap the response][wrapping].


[386]: https://github.com/google/shaka-player/issues/386#issuecomment-227898001
[489]: https://github.com/google/shaka-player/issues/489#issuecomment-240466224
[auth]: https://shaka-player-demo.appspot.com/docs/api/tutorial-license-server-auth.html
[clockSyncUri]: https://shaka-player-demo.appspot.com/docs/api/shakaExtern.html#DashManifestConfiguration
[CORS]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS
[wrapping]: https://shaka-player-demo.appspot.com/docs/api/tutorial-license-wrapping.html
