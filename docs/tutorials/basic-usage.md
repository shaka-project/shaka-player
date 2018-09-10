# Basic Usage

Basic usage of Shaka Player is very easy:

1. Start with {@tutorial welcome} and compile the library.
2. Create a simple HTML page with a video or audio element.
3. In your application's JavaScript:
  1. Install Shaka's polyfills.
  2. Check for browser support.
  3. Create a Player object to wrap the media element.
  4. Listen for errors.
  5. Load a manifest.

```html
<!DOCTYPE html>
<html>
  <head>
    <!-- Shaka Player compiled library: -->
    <script src="dist/shaka-player.compiled.js"></script>
    <!-- Your application source: -->
    <script src="myapp.js"></script>
  </head>
  <body>
    <video id="video"
           width="640"
           poster="//shaka-player-demo.appspot.com/assets/poster.jpg"
           controls autoplay></video>
  </body>
</html>
```

```js
// myapp.js

var manifestUri =
    'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd';

function initApp() {
  // Install built-in polyfills to patch browser incompatibilities.
  shaka.polyfill.installAll();

  // Check to see if the browser supports the basic APIs Shaka needs.
  if (shaka.Player.isBrowserSupported()) {
    // Everything looks good!
    initPlayer();
  } else {
    // This browser does not have the minimum set of APIs we need.
    console.error('Browser not supported!');
  }
}

function initPlayer() {
  // Create a Player instance.
  var video = document.getElementById('video');
  var player = new shaka.Player(video);

  // Attach player to the window to make it easy to access in the JS console.
  window.player = player;

  // Listen for error events.
  player.addEventListener('error', onErrorEvent);

  // Try to load a manifest.
  // This is an asynchronous process.
  player.load(manifestUri).then(function() {
    // This runs if the asynchronous load is successful.
    console.log('The video has now been loaded!');
  }).catch(onError);  // onError is executed if the asynchronous load fails.
}

function onErrorEvent(event) {
  // Extract the shaka.util.Error object from the event.
  onError(event.detail);
}

function onError(error) {
  // Log the error.
  console.error('Error code', error.code, 'object', error);
}

document.addEventListener('DOMContentLoaded', initApp);
```

That's it!


#### Continue the Tutorials

Next, check out {@tutorial debugging}.
