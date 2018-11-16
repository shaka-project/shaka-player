# UI Library

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
#### Configuring the UI

When creating the UI via code, you can pass in configuration options that change
the look and functioning of the UI bar. For example, if you wanted to not have
a seek bar, you could add the following line to initPlayer, right before
creating the UI overlay:

```js
config['addSeekBar'] = false;
```

See the docs on [UIConfiguration][UIConfiguration] for more information.

#### Customizing the number and order of controls

For example, let's say that all you care about for your app is rewinding and
fast-forwarding. You could add the following line to init(), right before
creating the UI overlay. This will configure UI to ONLY provide these two buttons:

```js
config['controlPanelElements'] = ['rewind', 'fast_forward'];
```
This call will result in the controls panel having only two elements: rewind
button and fast forward button, in that order. If the reversed order is desired,
the call should be:

```js
config['controlPanelElements'] = ['fast_forward', 'rewind'];
```
The following elements can be added to the UI bar using this configuration value:
* time_and_duration: adds an element tracking and displaying current progress of
  the presentation and the full presentation duration in the "0:10 / 1:00"
  form where "0:10" (ten seconds) is the number of seconds passed from the start of the presentation
  and "1:00" (one minute) is the presentation duration.
* mute: adds a button that mutes/unmutes the video on click.
* volume: adds a volume slider.
* fullscreen: adds a button that toggles full screen mode on click.
* overflow_menu: adds a button that opens an overflow menu with additional settings
  buttons. It's content is also configurable.
* rewind: adds a button that rewinds the presentation on click; that is, it starts playing
  the presentation backwards.
* fast_forward: adds a button that fast forwards the presentation on click; that is, it
  starts playing the presentation at an increased speed
<!-- TODO: If we add more buttons that can be put in the order this way, list them here. -->
At most one button of each type can be added at a time.

Similarly, the 'overflowMenuButtons' configuration option can be used to control
the contents of the overflow menu.
The following buttons can be added to the overflow menu:
* captions: adds a button that controls the current text track selection (including turning it off).
  The button is visible only if the content has at least one text track.
* cast: adds a button that opens a Chromecast dialog. The button is visible only if there is
  at least one Chromecast device on the same network available for casting.
* quality: adds a button that controls enabling/disabling of abr and video resolution selection.
* language: adds a button that controls audio language selection.

Please note that custom layouts might need CSS adjustments to look good.

#### Changing seek bar progress colors
<!-- TODO: Is there a better way to do this? (The actual thing, not the tutorial) -->
The seek bar consist of three segments: past (already played part of the presentation),
future-buffered and future-unbuffered. The segments colors are set when the seek bar is created.
To customize the colors, change the values of `shaka.ui.Controls.SEEK_BAR_BASE_COLOR_` ,
`shaka.ui.Controls.SEEK_BAR_PLAYED_COLOR_`, and `shaka.ui.Controls.SEEK_BAR_BUFFERED_COLOR_` in ui/controls.js

<!-- TODO: If we add more buttons that can be put in the order this way, list them here. -->

<!-- TODO: Add a custom button tutorial. -->

#### Continue the Tutorials

Next, check out {@tutorial config}.

[UIConfiguration]: https://shaka-player-demo.appspot.com/docs/api/shaka.extern.html#.UIConfiguration