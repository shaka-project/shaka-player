# Network and Buffering Configuration

#### Networking Configuration

Shaka Player has separate network retry settings for each of the different
types of requests: manifest, license, and segment requests. For example: you
may want a failed license request to be retried differently from a failed
segment request.

The three separate retry settings are found under `drm.retryParameters` (for
license requests), `manifest.retryParameters` (for manifest requests), and
`streaming.retryParameters` (for segment requests).  All three structures are
identical:

```js
retryParameters: {
  timeout: 0,       // timeout in ms, after which we abort; 0 means never
  maxAttempts: 2,   // the maximum number of requests before we fail
  baseDelay: 1000,  // the base delay in ms between retries
  backoffFactor: 2, // the multiplicative backoff factor between retries
  fuzzFactor: 0.5,  // the fuzz factor to apply to each retry delay
}
```

Each time we retry, the backoff factor is applied to the delay between retries.
So, for example, if the base delay is 1s, and the backoff factor is 2:

1. initial request at time t = 0 seconds
2. delay of 1, retry at t = (0 + 1) = 1
3. delay of 2, retry at t = (1 + 2) = 3
4. delay of 4, retry at t = (3 + 4) = 7
5. delay of 8, retry at t = (7 + 8) = 15

and so on.  To avoid many clients hammering a server at the same exact time,
we also apply a fuzz factor.  A fuzz factor of 0.5 means we fuzz the delay
50% in either direction.  So if the ideal delay is 8, the actual delay will be
randomly chosen between 4 and 12.  To extend our earlier example:

1. initial request
2. delay of 1±50% (0.5 to 1.5), retry
3. delay of 2±50% (1 to 3), retry
4. delay of 4±50% (2 to 6), retry
5. delay of 8±50% (4 to 12), retry

You should consider the default backoff and fuzz factors as a recommendation of
best practice.  The base delay, timeout, and maximum number of attempts should
be customized for your application's requirements.


#### Buffering Configuration

Shaka Player's buffering system has three parameters, all of which are nested
under `streaming` in the config object: `bufferingGoal`, `rebufferingGoal`, and
`bufferBehind`.  All are expressed in seconds.

`bufferingGoal` is the amount of content we try to buffer.  For example, if
this is set to 30, we fetch segments until we have at least 30 seconds buffered.

`rebufferingGoal` is the amount of content we have to have buffered before we
can play.  For example, if this is 15, we stay in a buffering state until we
have at least 15 seconds buffered.  This affects both buffering at startup
and rebuffering later during playback.

`bufferBehind` is the amount of content we keep in buffer behind the playhead.
For example, if this is 30, we keep 30 seconds of content buffered behind the
video's `currentTime`.  When we have more than 30 seconds buffered behind,
content will be removed from the start of the buffer to save memory.
This is a minimum; if the stream's max segment size is longer than the
'bufferBehind', then that will be used instead.


*NOTES:*
 - *`rebufferingGoal` should always be less than `bufferingGoal`.*
 - *A DASH manifest's `minBufferTime`, if greater, overrides `rebufferingGoal`.*
 - *You can ignore `minBufferTime` by setting the
   `manifest.dash.ignoreMinBufferTime` configuration to true.*

All of these settings should be customized for your application.  The default
values are very conservative.

#### Buffering and Adaptation

While we are playing, we will only buffer the currently chosen stream.  We do
not download other bitrates until AbrManager tells us to switch.  We also (by
default) do not clear the buffer when we adapt.  This means that when we adapt
to a different bitrate, it may not be visible for a while because the old
buffer will still be used.  There will be at most `bufferingGoal` seconds left
of the old bitrate in the buffer.

#### Try it out

Use the code from {@tutorial basic-usage} and try configuring some of these
parameters in `initPlayer()` to see how they affect playback.

#### Server Considerations

Shaka Player makes a number of requests to various servers while streaming.  You
need to make sure that Shaka has correct access to those resources.  Browsers
impose several restrictions on the content that a webpage has access to.

One restriction is [CORS][] (Cross-Origin Resource Sharing).  This requires
network requests to be made to the same origin, or for the server to explicitly
give access.  An "origin" refers to the domain name (e.g. `api.example.com`),
the scheme (e.g. `https:`), and the port (e.g. 80).  If you host your assets on
a different origin than your web app, then you'll need to set CORS headers on
the asset server to ensure we have access.  For some content, this will also
require allowing the `Range` header by sending the CORS header
`Access-Control-Allow-Headers`.

Another restriction is called mixed-content.  If your webpage is accessed using
`https:`, then all resources that are loaded also need to be loaded using
`https:`.  This means that the manifest and all the media segments need to be
loaded using `https:`.  This is most easily done by either having all the
URLs in your manifests always use `https:`, or by having it not include the
scheme (e.g. `//example.com/file.mp4`).

[CORS]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS


#### Continue the Tutorials

Next, check out {@tutorial drm-config}.
