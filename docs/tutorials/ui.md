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
    <!-- Shaka Player ui compiled library: -->
    <script src="dist/shaka-player.ui.js"></script>
    <!-- Shaka Player ui compiled library default CSS: -->
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
         data-shaka-player-cast-receiver-id="7B25EC44">
       <!-- The data-shaka-player tag will make the UI library use this video element.
            If no video is provided, the UI will automatically make one inside the container div. -->
      <video autoplay data-shaka-player id="video" style="width:100%;height:100%"></video>
    </div>
  </body>
</html>
```


```js
// myapp.js

var manifestUri =
    'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd';

async function init() {
  // When using the UI, the player is made automatically by the UI object.
  const video = document.getElementById('video');
  const ui = video['ui'];
  const controls = ui.getControls();
  const player = controls.getPlayer();

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

function initFailed() {
  // Handle the failure to load
  console.error('Unable to load the UI library!');
}

// Listen to the custom shaka-ui-loaded event, to wait until the UI is loaded.
document.addEventListener('shaka-ui-loaded', init);
// Listen to the custom shaka-ui-load-failed event, in case Shaka Player fails
// to load (e.g. due to lack of browser support).
document.addEventListener('shaka-ui-load-failed', initFailed);

```

#### Enabling Chromecast support

If you'd like to take advantage of Shaka's built-in Chromecast support,
you will need to provide us with your cast receiver application id.
If you want to track cast status changes, you should also
set up a listener for the 'caststatuschanged' events.

```html
<!-- Add a data-shaka-player-cast-receiver-id tag to provide a Cast Application ID that
           the cast button will cast to; the value provided here is the sample cast receiver. -->
    <div data-shaka-player-container style="max-width:40em"
         data-shaka-player-cast-receiver-id="A15A181D">
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
#### Providing source(s) for auto load.

It's also possible to provide an 'src' attribute on the <video>  element
or a <source> tag inside it to enable auto loading of the specified content.

```html
    <div data-shaka-player-container style="max-width:40em"
         data-shaka-player-cast-receiver-id="7B25EC44">
      <!-- The manifest url in the src attribute will be automatically loaded -->
      <video autoplay data-shaka-player id="video" style="width:100%;height:100%"
       src="https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd"></video>
    </div>

```

or

```html
    <div data-shaka-player-container style="max-width:40em"
         data-shaka-player-cast-receiver-id="7B25EC44">
      <video autoplay data-shaka-player id="video" style="width:100%;height:100%">
        <!-- The manifest url in the src attribute will be auto loaded -->
       <source src="https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd"/>
      </video>
    </div>

```

Use several <source> tags to provide backup manifest urls in case the load()
call to the first one fails.

```html
    <div data-shaka-player-container style="max-width:40em"
         data-shaka-player-cast-receiver-id="7B25EC44">
      <video autoplay data-shaka-player id="video" style="width:100%;height:100%">
        <!-- Try this first -->
        <source src="https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd"/>
        <!-- Try this if the first one has failed -->
        <source src="https://storage.googleapis.com/shaka-demo-assets/angel-one-hls-apple/master.m3u8"/>
      </video>
    </div>

```
NOTE: Please DO NOT specify both an 'src' attribute on the <video> tag AND
a <source> tag inside it.

<!-- TODO: Also mention the download button, once we add it. -->
#### Continue the Tutorials

Next, check out {@tutorial ui-customization}.
