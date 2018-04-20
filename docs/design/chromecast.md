# Shaka Player v2 Chromecast Design

last update: 2016-05-07

by: [joeyparrish@google.com](mailto:joeyparrish@google.com)


## Overview

Shaka Player v2 will support Chromecast in the library for both sender and
receiver.  This is in contrast to v1, where we demonstrated cast sending and
receiving in the demo app, but provided no direct Chromecast support in the
library.

Senders will use a `shaka.cast.CastProxy` object which wraps both `shaka.Player`
and `HTMLMediaElement`.  The proxy will delegate to either local or remote
objects based on the current cast state.  Senders must also load the Cast Sender
API JavaScript library in addition to Shaka.  Applications can be quickly
modified to use a `CastProxy` without changing their use of `Player` and
`HTMLMediaElement` APIs.

Receivers will use a `shaka.cast.CastReceiver` object which wraps both
`shaka.Player` and `HTMLMediaElement` on the Chromecast.  The `CastReceiver`
will receive commands from the sender and update the sender with the status of
the `Player` and `HTMLMediaElement` objects.  Receiver apps only have to worry
about their UI, while the `CastReceiver` takes care of playback and
communication.


#### `CastProxy` API sketch

```js
new shaka.cast.CastProxy(video, player, receiverAppId)

// Also destroys the underlying local Player object
shaka.cast.CastProxy.prototype.destroy() => Promise

// Looks like shaka.Player, proxies to local or remote player based on cast
// state
shaka.cast.CastProxy.prototype.getPlayer() => shaka.Player

// Looks like HTMLMediaElement, proxies to local or remote video based on cast
// state
shaka.cast.CastProxy.prototype.getVideo() => HTMLMediaElement

// True if there are cast receivers available
shaka.cast.CastProxy.prototype.canCast() => boolean

// True if we are currently casting
shaka.cast.CastProxy.prototype.isCasting() => boolean

// Fired when either canCast or isCasting changes
shaka.cast.CastProxy.CastStatusChangedEvent

// Resolved when connected to a receiver, rejected if the connection fails
shaka.cast.CastProxy.prototype.cast() => Promise

// Transmits application-specific data to the receiver (now or on later connect)
shaka.cast.CastProxy.prototype.setAppData(appData)

// Disconnect from the receiver
shaka.cast.CastProxy.prototype.disconnect()
```


#### `CastReceiver` API sketch

```js
new shaka.cast.CastReceiver(video, player, appDataCallback)

// True if there are cast senders connected
shaka.cast.CastReceiver.prototype.isConnected() => boolean

// Fired when isConnected changes
shaka.cast.CastReceiver.CastStatusChangedEvent
```


#### Implementation

`CastProxy` in local mode will pass all attribute and method accesses directly
to the local objects.  In cast mode, it will have to implement certain
attributes and methods differently from others.

In cast mode, reads of attributes and calls to synchronous getter methods will
be backed by a cache of attribute values pushed by the `CastReceiver`.  They
will synchronously return the most recent value sent by the receiver.  Writes to
attributes and calls to methods without a return value will be proxied to the
remote objects and treated as synchronous.  Attribute writes will replace the
most recent values pushed by the receiver.  Methods which return a `Promise`
will return a Promise which is resolved when the `CastReceiver` pushes a return
value back.

`CastProxy` and `CastReceiver` must share a list of events, attributes, getter
methods, void methods, and methods which return a `Promise`.  If a key is not
explicitly listed, its type is not known and it is not supported by the proxy.

`CastReceiver` will periodically push values of attributes and getters to the
`CastProxy` on the sender.  It will also push events to the `CastProxy`.  As of
our first draft, `CastReceiver` pushes attribute updates every 500ms.  Based on
experiments, this seems to be a good balance between performance and UI
responsiveness.

`CastProxy` will have to have a special handler to simulate `TimeRanges`, since
the object cannot be pushed directly by `CastReceiver`.  `CastReceiver` will
read out the values of each range and push an anonymous object containing the
information.  `CastProxy` will provide an object that looks and acts like
`TimeRanges`, but which is backed by the anonymous object pushed by
`CastReceiver`.

`CastReceiver` will have to connect `volume` and `muted` attributes to the
system volume, not the video volume.  The ChromeCast documentation states:

> All user-initiated actions on volume should impact the system volume, not the
> stream volume.

When we first cast, `CastProxy` will send its initial state to `CastReceiver`,
including its configuration, manifest URI, selected tracks, text visibility,
side-loaded text tracks, current timestamp, and any custom app data from the
sender application.  `CastReceiver` will invoke a receiver app callback to
process any custom app data before initiating playback.

Custom app data can be used to pass information that cannot be transferred from
the sender app's config to the receiver app's config.  For example, network
filters, custom dash scheme callbacks, and custom ABR callbacks are all
functions defined in the sender app.  These cannot be serialized and transferred
to the receiver without security risks, because the receiver would have to use
`eval()` to deserialize them.  Instead, the sender app must send whatever data
is necessary for the receiver to construct equivalent callbacks if needed.  For
example, if network filters are used to attach auth tokens to license requests,
the app data would include the user's auth token.

Sender apps must listen for `CastStatusChangedEvent`s because a receiver can be
disconnected without going through the app's UI.

Receiver apps must listen for `CastStatusChangedEvent`s because senders can
disconnect at any time, and because Chromecast UI guidelines say that receiver
apps should show a different UI while idle.


#### Error conditions

Errors during `cast()`:
  - Cast API unavailable
  - No cast receivers available
  - Already casting
  - Cast canceled by user
  - Cast connection timed out
  - Requested cast receiver app ID is unavailable or does not exist
