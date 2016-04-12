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
  timeout: 0,       // timeout in ms, after which we abort a request; 0 means never
  maxAttempts: 1,   // the maximum number of requests before we fail
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

*NOTES:*
 - *`rebufferingGoal` should always be less than `bufferingGoal`.*
 - *A DASH manifest's `minBufferTime`, if greater, overrides `rebufferingGoal`.*

All of these settings should be customized for your application.  The default
values are very conservative.


#### Try it out

Use the code from {@tutorial basic-usage} and try configuring some of these
parameters in `playerInit()` to see how they affect playback.


#### Continue the Tutorials

Next, check out {@tutorial drm-config}.
