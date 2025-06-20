# UI Library: basic usage

Shaka Player has an optional UI library that provides a high-quality accessible
localized UI. It is an alternate bundle from the base
Shaka Player library, that adds additional UI-specific classes and a streamlined
declarative style of setup.


#### Setting up the UI library

Setting up a project with the UI library is even easier than setting one up without.

Set up controls with HTML data attributes:

```html
<!DOCTYPE html>
<html>
  <head>
    <!-- Shaka Player UI compiled library: -->
    <script src="dist/shaka-player.ui.js"></script>
    <!-- Shaka Player UI compiled library default CSS: -->
    <link rel="stylesheet" type="text/css" href="dist/controls.css">
    <!-- Chromecast SDK (if you want Chromecast support for your app): -->
    <script defer src="https://www.gstatic.com/cv/js/sender/v1/cast_sender.js"></script>
    <!-- Your application source: -->
    <script src="myapp.js"></script>
  </head>
  <body>
    <!-- The data-shaka-player-container tag will make the UI library place the controls in this div.
         The data-shaka-player-cast-receiver-id tag allows you to provide a Cast Application ID that
           the cast button will cast to; the value provided here is the sample cast receiver. -->
    <div data-shaka-player-container style="max-width:40em"
         data-shaka-player-cast-receiver-id="07AEE832">
       <!-- The data-shaka-player tag will make the UI library use this video element.
            If no video is provided, the UI will automatically make one inside the container div. -->
      <video autoplay data-shaka-player id="video" style="width:100%;height:100%"></video>
    </div>
  </body>
</html>
```

```js
// myapp.js

const manifestUri =
    'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd';

async function init() {
  // When using the UI, the player is made automatically by the UI object.
  const video = document.getElementById('video');
  const ui = video['ui'];
  const controls = ui.getControls();
  const player = controls.getPlayer();

  // Attach player and UI to the window to make it easy to access in the JS console.
  window.player = player;
  window.ui = ui;

  // Listen for error events.
  player.addEventListener('error', onPlayerErrorEvent);
  controls.addEventListener('error', onUIErrorEvent);

  // Try to load a manifest.
  // This is an asynchronous process.
  try {
    await player.load(manifestUri);
    // This runs if the asynchronous load is successful.
    console.log('The video has now been loaded!');
  } catch (error) {
    onPlayerError(error);
  }
}

function onPlayerErrorEvent(errorEvent) {
  // Extract the shaka.util.Error object from the event.
  onPlayerError(event.detail);
}

function onPlayerError(error) {
  // Handle player error
  console.error('Error code', error.code, 'object', error);
}

function onUIErrorEvent(errorEvent) {
  // Extract the shaka.util.Error object from the event.
  onPlayerError(event.detail);
}

function initFailed(errorEvent) {
  // Handle the failure to load; errorEvent.detail.reasonCode has a
  // shaka.ui.FailReasonCode describing why.
  console.error('Unable to load the UI library!');
}

// Listen to the custom shaka-ui-loaded event, to wait until the UI is loaded.
document.addEventListener('shaka-ui-loaded', init);
// Listen to the custom shaka-ui-load-failed event, in case Shaka Player fails
// to load (e.g. due to lack of browser support).
document.addEventListener('shaka-ui-load-failed', initFailed);
```


#### Enabling VR

To enable the playback of VR content, there are two possibilities:

1. Enable via UI config:
```js
const config = {
  'displayInVrMode': true
}
ui.configure(config);
```

2. Content is automatically treated as VR if it fits the following criteria:
 - HLS or DASH manifest
 - fMP4 segments
 - Init segment contains `prji` and `hfov` boxes


If you want the VR to be rendered outside of the main container, add the
`data-shaka-player-vr-canvas` tag to a canvas element on the page.

Note: VR is only supported for clear streams or HLS-AES stream. DRM prevents
access to the video pixels for transformation.


#### Enabling Chromecast support

If you'd like to take advantage of Shaka's built-in Chromecast support,
you will need to provide us with your cast receiver application id.
If you want to track cast status changes, you should also
set up a listener for the 'caststatuschanged' events.

```html
<!-- Add a data-shaka-player-cast-receiver-id tag to provide a Cast Application ID that
           the cast button will cast to; the value provided here is the sample cast receiver. -->
    <div data-shaka-player-container style="max-width:40em"
         data-shaka-player-cast-receiver-id="07AEE832">
    </div>
```

With the UI library set up this way, it will provide a button for casting to a
ChromeCast when appropriate, without any extra code.
Next, let's add a listener to the 'caststatuschanged' event in myapp.js:


```js
  controls.addEventListener('caststatuschanged', onCastStatusChanged);

  function onCastStatusChanged(event) {
    const newCastStatus = event['newStatus'];
    // Handle cast status change
    console.log('The new cast status is: ' + newCastStatus);
  }
```


#### Enabling Android Receiver Apps

If you'd like to take advantage of Android Receiver App support,
you will need to provide a boolean flag to enable support for
casting to an Android receiver app.

```html
    <div data-shaka-player-container style="max-width:40em"
         data-shaka-player-cast-receiver-id="07AEE832"
         data-shaka-player-cast-android-receiver-compatible="true">
      <!-- The manifest url in the src attribute will be automatically loaded -->
      <video autoplay data-shaka-player id="video" style="width:100%;height:100%"
             src="https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd"></video>
    </div
```

#### Providing source(s) for auto load.

It's also possible to provide the `src` attribute on the `<video>` element
or a `<source>` tag inside it to enable auto loading of the specified content.

```html
    <div data-shaka-player-container style="max-width:40em"
         data-shaka-player-cast-receiver-id="07AEE832">
      <!-- The manifest url in the src attribute will be automatically loaded -->
      <video autoplay data-shaka-player id="video" style="width:100%;height:100%"
             src="https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd"></video>
    </div>
```

or

```html
    <div data-shaka-player-container style="max-width:40em"
         data-shaka-player-cast-receiver-id="07AEE832">
      <video autoplay data-shaka-player id="video" style="width:100%;height:100%">
        <!-- The manifest url in the src attribute will be auto loaded -->
        <source src="https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd"/>
      </video>
    </div>
```

Use several `<source>` tags to provide backup manifest urls in case the `load()`
call to the first one fails.

```html
    <div data-shaka-player-container style="max-width:40em"
         data-shaka-player-cast-receiver-id="07AEE832">
      <video autoplay data-shaka-player id="video" style="width:100%;height:100%">
        <!-- Try this first -->
        <source src="https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd"/>
        <!-- Try this if the first one has failed -->
        <source src="https://storage.googleapis.com/shaka-demo-assets/angel-one-hls-apple/master.m3u8"/>
      </video>
    </div>
```

NOTE: Please DO NOT specify both the `src` attribute on the `<video>` tag AND
a `<source>` tag inside it.


#### Programmatic UI setup.

It is possible to set up the UI programmatically after the page loads.
(One of the big use cases for this is building Shaka Player into UI frameworks
that modify the DOM after the page load.)

To create UI without the DOM-based setup, use the `shaka.ui.Overlay`
constructor.

```js
// "local" because it is for local playback only, as opposed to the player proxy
// object, which will route your calls to the ChromeCast receiver as necessary.
const localPlayer = new shaka.Player();
// "Overlay" because the UI will add DOM elements inside the container,
// to visually overlay the video element
const ui = new shaka.ui.Overlay(localPlayer, videoContainerElement,
  videoElement);
// Now that the player has been configured to be part of a UI, attach it to the
// video.
await localPlayer.attach(videoElement);

// As with DOM-based setup, get access to the UI controls and player from the
// UI.
const controls = ui.getControls();

// These are cast-enabled proxy objects, so that when you are casting,
// your API calls will be routed to the remote playback session.
const player = controls.getPlayer();
const video = controls.getVideo();

// Programmatically configure the Chromecast Receiver App Id and Android
// Receiver Compatibility.
ui.configure({
  // Set the castReceiverAppId
  'castReceiverAppId': '07AEE832',
  // Enable casting to native Android Apps (e.g. Android TV Apps)
  'castAndroidReceiverCompatible': true,
});
```


#### Fully-featured example

You can see a fully-featured example of the Shaka Player UI with autoloading
here:

[https://github.com/joeyparrish/bbbcm-if.org/blob/main/watch/index.html](https://github.com/joeyparrish/bbbcm-if.org/blob/main/watch/index.html)

This example loads Shaka from a Google CDN, autoloads content, has CSS for a
full-window watch page, and lazy-loads translations as needed.

See it live at [https://bbbcm-if.org/watch/](https://bbbcm-if.org/watch/), and
override the UI language with the lang= parameter.
(ex: [https://bbbcm-if.org/watch/?lang=sjn](https://bbbcm-if.org/watch/?lang=sjn))


#### Supported shortcuts

* Spacebar: Play/Pause when the seek bar is selected.
* Left/Right arrow on the seek bar: Seek backward/forward 5 seconds. This seek distance can be configured with `keyboardSeekDistance`.
* PageDown/PageUp on the seek bar: Seek backward/forward 60 seconds. This seek distance can be configured with `keyboardLargeSeekDistance`.
* Home/End: Seek to the beginning/last seconds of the video.
* c: Activate closed captions and subtitles if available. To hide captions and subtitles, press C again.
* f: Activate full screen. If full screen mode is enabled, press F again or press escape to exit full screen mode.
* m: Mute/unmute the video.
* p: Activate picture in picture. If picture in picture mode is enabled, press P again.
* \>: Speed up the video playback rate.
* \<: Slow down the video playback rate.
