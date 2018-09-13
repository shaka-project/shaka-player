# Shaka Upgrade Guide, v2.3 => v2.4

This is a detailed guide for upgrading from Shaka Player v2.3 to v2.4.
Feel free to skim or to search for the class and method names you are using in
your application.


#### What's New in v2.4?

Shaka v2.4 introduces several improvements over v2.3, including:
  - Support for CEA captions in TS content
  - Support for TTML and VTT regions
  - A video element is no longer required when `Player` is constructed
  - New `attach()` and `detach()` methods have been added to `Player` to manage
    attachment to video elements
  - Fetch is now preferred over XHR when available
  - Network requests are now abortable
  - Live stream playback can begin at a negative offset from the live edge


#### Text parser plugin API changes

The TextParser plugin API has changed.

The `segmentStart` attribute of `shakaExtern.TextParser.TimeContext` is now
nullable.  Your plugin will receive a `segmentStart` of `null` if the
information is not available, as is the case in HLS.

Text-parsing plugins that produce region information will need to be updated to
use the new `shaka.text.CueRegion` class.  The new structure allows for more
accurate representation of both TTML and VTT regions.

All application-specific text-parsing plugins MUST to be updated.
v2.4 does not have backward compatibility for this!

See {@link shakaExtern.TextParser.TimeContext} and {@link shaka.text.CueRegion}
for details.


#### Text displayer plugin API changes

The TextDisplayer plugin API has changed.

TextDisplayer plugins need to handle changes to the `shakaExtern.CueRegion`
structure.  The new structure allows for more accurate representation of both
TTML and VTT regions.

All application-specific TextDisplayer plugins MUST to be updated.
v2.4 does not have backward compatibility for this!

See {@link shakaExtern.CueRegion} for details.


#### NetworkingEngine API changes

In v2.3, the `request()` method on `shaka.net.NetworkingEngine` returned a
Promise.  Now, in v2.4, it returns an instance of
`shakaExtern.IAbortableOperation`, which contains a Promise.

All applications which make application-level requests via `NetworkingEngine`
SHOULD update to the new API.  Support for the old API will be removed in v2.5.

```js
// v2.3:
player.getNetworkingEngine().request(type, request).then((response) => {
  // ...
});

// v2.4:
let operation = player.getNetworkingEngine().request(type, request);
// Use operation.promise to get the response.
operation.promise.then((response) => {
  // ...
});
// The operation can also be aborted on some condition.
onSomeOtherCondition(() => {
  operation.abort();
});
```

Backward compatibility is provided in the v2.4 releases by adding `.then` and
`.catch` methods to the return value from `request()`.


#### Network scheme plugin API changes

In v2.4, we changed the API for network scheme plugins.

These plugins now return an instance of `shakaExtern.IAbortableOperation`.
We suggest using the utility `shaka.util.AbortableOperation` for convenience.

We also introduced an additional parameter for network scheme plugins to
identify the request type.

All applications which have application-level network scheme plugins SHOULD
update to the new API.  Support for the old API will be removed in v2.5.

```js
// v2.3
function fooPlugin(uri, request) {
  return new Promise((resolve, reject) => {
    // ...
  });
}
shaka.net.NetworkingEngine.registerScheme('foo', fooPlugin);

// v2.4
function fooPlugin(uri, request, requestType) {
  let rejectCallback = null;

  const promise = new Promise((resolve, reject) => {
    rejectCallback = reject;

    // Use this if you have a need for it.  Ignore it otherwise.
    if (requestType == shaka.net.NetworkingEngine.RequestType.MANIFEST) {
      // ...
    } else {
      // ...
    }

    // ...
  });

  const abort = () => {
    // Abort the operation.
    // ...

    // Reject the Promise.
    rejectCallback(new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.OPERATION_ABORTED));
  };

  return new shaka.util.AbortableOperation(promise, abort);
}
shaka.net.NetworkingEngine.registerScheme('foo', fooPlugin);
```


#### Manifest parser plugin API changes

The API for `shaka.media.PresentationTimeline` has changed.  `ManifestParser`
plugins that use these methods MUST be updated:

  - `setAvailabilityStart()` was renamed to `setUserSeekStart()`.
  - `notifySegments()` now takes a reference array and a boolean called
    `isFirstPeriod`, instead of a period start time and a reference array.
