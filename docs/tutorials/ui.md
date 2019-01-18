# UI Library: basic usage

Shaka Player has an optional UI library that provides a high-quality accessible
localized UI. It is an alternate bundle from the base
Shaka Player library, that adds additional UI-specific classes and a streamlined
declarative style of setup.

#### Setting up the UI library

Setting up a project with the UI library is even easier than setting one up without.

Option 1: Set up controls with HTML data attributes:

```html
<!DOCTYPE html>
<html>
  <head>
    <!-- Shaka Player ui compiled library: -->
    <script src="dist/shaka-player.ui.js"></script>
    <!-- Shaka Player ui compiled library default CSS: -->
    <link rel="stylesheet" type="text/css" href="dist/controls.css">
    <!-- Google Material Design Icons: -->
    <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
    <!-- Your application source: -->
    <script src="myapp.js"></script>
  </head>
  <body>
    <!-- The data-shaka-player-container tag will make the UI library place the controls in this div.
         The data-shaka-player-cast-receiver-id tag allows you to provide a Cast Application ID that
           the cast button will cast to; the value provided here is the sample cast receiver. -->
    <div data-shaka-player-container style="max-width:40em"
         data-shaka-player-cast-receiver-id="A15A181D">
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
  const player = ui.getPlayer();
  const controls = ui.getControls();

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
    onError(error);
  }
}

function onPlayerErrorEvent(errorEvent) {
  // Extract the shaka.util.Error object from the event.
  onPlayerError(event.detail);
}

function onPlayerError(error) {
  // Handle player error
}

function onUIErrorEvent(errorEvent) {
  // Handle UI error
}

// Listen to the custom shaka-ui-loaded event, to wait until the UI is loaded.
document.addEventListener('shaka-ui-loaded', init);

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
  }

```

<!-- TODO: Also mention the download button, once we add it. -->
#### Option 2: Setting the UI element programmatically

The most basic way to make an element host the Shaka Player UI is to use the
data-shaka-player tags in the HTML.
However, that approach won't necessarily work for every application. For
instance, if your site lays itself out programmatically, that is not an option.
In addition, when using data-shaka-player tags, advanced customization options
are not available.
For more advanced use, the UI can be assigned to an element in code.

```html
<!DOCTYPE html>
<html>
  <head>
    <!-- Shaka Player ui compiled library: -->
    <script src="dist/shaka-player.ui.js"></script>
    <link rel="stylesheet" type="text/css" href="dist/controls.css">
    <!-- Google Material Design Icons: -->
    <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
    <!-- Your application source: -->
    <script src="myapp.js"></script>
  </head>
  <body>
    <div id="videoContainer" style="max-width:40em">
      <video autoplay id="video" style="width:100%;height:100%"></video>
    </div>
  </body>
</html>
```

```js
// myapp.js

var manifestUri =
    'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd';

async function init() {
  // Create the UI manually.
  const video = document.getElementById('video');
  const videoContainer = document.getElementById('videoContainer');
  const player = new shaka.Player(video);
  // Use this to pass in desired config values.  Config values not passed in
  // will be filled out according to the default config.
  // See more info on the configuration in the section below.
  const uiConfig = {};
  const ui = new shaka.ui.Overlay(player, videoContainer, video, uiConfig);
  const controls = ui.getControls();

  // Listen for error events.
  player.addEventListener('error', onPlayerErrorEvent);
  controls.addEventListener('error', onUIErrorEvent);
  controls.addEventListener('caststatuschanged', onCastStatusChanged);

  // Try to load a manifest.
  // This is an asynchronous process.
  try {
    await player.load(manifestUri);
    // This runs if the asynchronous load is successful.
    console.log('The video has now been loaded!');
  } catch (error) {
    onError(error);
  }
}

function onPlayerErrorEvent(errorEvent) {
  // Extract the shaka.util.Error object from the event.
  onPlayerError(event.detail);
}

function onPlayerError(error) {
  // Handle player error
}

function onUIErrorEvent(errorEvent) {
  // Handle UI error
}

function onCastStatusChanged(event) {
  // Handle cast status change
}

// The shaka-ui-loaded event won't fire if there are no tagged UI elements to
// set up, so listen to DOMContentLoaded instead.
document.addEventListener('DOMContentLoaded', init);
```

#### Continue the Tutorials

Next, check out {@tutorial ui-customization}.
