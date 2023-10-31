# Error Handling

The basics for handling native Error and {@link shaka.util.Error} thrown by Shaka.

## Listening To and Handling Errors

```javascript
const handleError = (error) => {
  if (error instanceof Error) {
    // shaka crashed with an unhandled native error
  }

  if (error.severity === shaka.util.Error.Severity.CRITICAL) {
    // handle fatal error, playback can not continue
  } else {
    // handle non-fatal error, playback can continue
  }
};

const player = new shaka.Player();
await player.attach(video);

// handle errors that occur after load
player.addEventListener('error', handleError);

// there are two options for catching errors that occur during load

// it's possible to listen directly on the promise
player.load(url).catch(handleError);

// or to use async/await with a try/catch
try {
  await player.load(url);
} catch (e) {
  handleError(e);
}
```

## Custom Handling of Streaming Errors

The `streaming.failureCallback` property of {@link shaka.extern.PlayerConfiguration} can be used to add custom handling or error conversion of errors that occur during streaming.

```javascript
player.configure('streaming.failureCallback', (error) => {
  if (error.severity === shaka.util.Error.Severity.CRITICAL) {
    // custom handling of critical error
    // e.g. player.retryStreaming();
  } else {
    // custom handling of recoverable error
  }
});
```

## Custom Handling of Retries

When configuring retry parameters in Shaka there may be known error codes that should not be retried, or the need to break out of an infinite retry loop in a live context. Retries for failed network requests are not reported as `RECOVERABLE` errors.

For example, if a VOD manifest is missing, unlike when a LIVE manifest is missing, it can be expected to not show up and there is no need to retry.

This is how to convert a retry into a critical error, see {@link shaka.net.NetworkingEngine.RetryEvent} and {@link shaka.util.Error} to decipher how the event can be parsed:

```javascript
const nwEngine = player.getNetworkingEngine();

const vodManifestNotFoundHandler = (event /* shaka.net.NetworkingEngine.RetryEvent */) => {
  const code = event.error.code;
  const data = event.error.data;

  if (code === shaka.util.Error.Code.BAD_HTTP_STATUS) {
    if (
      // each type of error has its own data structure (or none at all), tread with care
      Array.isArray(data) &&
      data[1] === 404 &&
      data[4] === shaka.net.NetworkingEngine.RequestType.MANIFEST
    ) {
      // Throwing inside a retry callback will immediately stop retries
      throw error;

      // A proprietary error code can also be thrown
      // throw new shaka.util.Error(
      //   shaka.util.Error.Severity.CRITICAL,
      //   shaka.util.Error.Category.NETWORK,
      //   'RECOGNIZABLE_ERROR_MESSAGE'
      // );
    }
  }
};

nwEngine.addEventListener('retry', vodManifestNotFoundHandler);

player.addEventListener('load'() => {
  nwEngine.removeEventListener('retry', vodManifestNotFoundHandler);
});

```
