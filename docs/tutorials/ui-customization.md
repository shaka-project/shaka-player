# Customizing the UI


#### Configuring the layout

Once the UI is created, you can pass in configuration options that change
the look and functioning of the UI bar. For example, if you wanted to not have
a seek bar, you could add the following line to the `init()` function from the
UI basic usage tutorial, after creating the UI overlay:

```js
const video = document.getElementById('video');
const ui = video['ui'];
const config = {
  addSeekBar: false
};
ui.configure(config);
```

Controls will fire a {@link shaka.ui.Controls#event:UIUpdatedEvent} event once the
config takes effect.
See the docs for {@link shaka.extern.UIConfiguration} for more information.

#### Customizing the number and order of controls

For example, let's say that all you care about for your app is rewinding and
fast-forwarding. You could add the following line to `init()`, right before
creating the UI overlay. This will configure UI to ONLY provide these two buttons:

```js
const config = {
  'controlPanelElements': ['rewind', 'fast_forward']
}
ui.configure(config);
```
This call will result in the controls panel having only two elements: rewind
button and fast forward button, in that order. If the reversed order is desired,
the call should be:

```js
const config = {
 'controlPanelElements': ['fast_forward', 'rewind']
}
ui.configure(config);
```

The following elements can be added to the UI bar using this configuration value:
* time_and_duration: adds an element tracking and displaying current progress of
  the presentation and the full presentation duration in the "0:10 / 1:00"
  form where "0:10" (ten seconds) is the number of seconds passed from the start of the presentation
  and "1:00" (one minute) is the presentation duration.
* play_pause: adds a button that plays/pauses the video on click.
* mute: adds a button that mutes/unmutes the video on click.
* volume: adds a volume slider.
* fullscreen: adds a button that toggles full screen mode on click.
* overflow_menu: adds a button that opens an overflow menu with additional settings
  buttons. It's content is also configurable.
* rewind: adds a button that rewinds the presentation on click; that is, it starts playing
  the presentation backwards.
* fast_forward: adds a button that fast forwards the presentation on click; that is, it
  starts playing the presentation at an increased speed
* spacer: adds a chunk of empty space between the adjacent elements.
* picture_in_picture: adds a button that enables/disables picture-in-picture mode on browsers
  that support it. Button is invisible on other browsers. Note that it will use the
  [Document Picture-in-Picture API]() if supported.
* loop: adds a button that controls if the currently selected video is played in a loop.
* airplay: adds a button that opens a AirPlay dialog. The button is visible only if the browser
  supports AirPlay.
* cast: adds a button that opens a Chromecast dialog. The button is visible only if there is
  at least one Chromecast device on the same network available for casting.
* quality: adds a button that controls enabling/disabling of abr and video resolution selection.
* language: adds a button that controls audio language selection.
* playback_rate: adds a button that controls the playback rate selection.
* captions: adds a button that controls the current text track selection (including turning it off).
<!-- TODO: If we add more buttons that can be put in the order this way, list them here. -->
[Document Picture-in-Picture API]: https://developer.chrome.com/docs/web-platform/document-picture-in-picture/

Similarly, the 'overflowMenuButtons' configuration option can be used to control
the contents of the overflow menu.
The following buttons can be added to the overflow menu:
* captions: adds a button that controls the current text track selection (including turning it off).
  The button is visible only if the content has at least one text track.
* cast: adds a button that opens a Chromecast dialog. The button is visible only if there is
  at least one Chromecast device on the same network available for casting.
* quality: adds a button that controls enabling/disabling of abr and video resolution selection.
* language: adds a button that controls audio language selection.
* picture_in_picture: adds a button that enables/disables picture-in-picture mode on browsers
  that support it. Button is invisible on other browsers. Note that it will use the 
  [Document Picture-in-Picture API]() if supported.
* loop: adds a button that controls if the currently selected video is played in a loop.
* playback_rate: adds a button that controls the playback rate selection.
* airplay: adds a button that opens a AirPlay dialog. The button is visible only if the browser
  supports AirPlay.
* Statistics: adds a button that displays statistics of the video.
<!-- TODO: If we add more buttons that can be put in the order this way, list them here. -->

Example:
```js
// Add only the cast button to the overflow menu, nothing else
const config = {
  'overflowMenuButtons' : ['cast']
}
ui.configure(config);
```

An important note: the 'overflow_menu' button needs to be part of the 'controlPanelElements'
layout for the overflow menu to be available to the user.

#### Adding tooltips to control panel buttons

Tooltips can be enabled to display the function of every button in the control panel. Where applicable, they will also contain the current selection in parenthesis.

Example:
```js
const config = {
  'enableTooltips' : true
}
ui.configure(config);
```

#### Replacing the default context menu

A custom context menu can be added through the `customContextMenu` boolean. Additionally, the `contextMenuElements` option can be used to add elements to it.
The following buttons can be added to the context menu:
* Statistics: adds a button that displays statistics of the video.
* loop: adds a button that controls if the currently selected video is played in a loop.
* picture_in_picture: adds a button that enables/disables picture-in-picture mode on browsers
  that support it. Button is invisible on other browsers. Note that it will use the 
  [Document Picture-in-Picture API]() if supported.

Example:
```js
const config = {
  'customContextMenu' : true,
  'contextMenuElements' : ['statistics'],
}
ui.configure(config);
```

#### Configuring Statistics
The list of statistics that are displayed when toggling the statistics button can be customized by specifying a `statisticsList` on the configuration. With the exception of `switchHistory` and `stateHistory`, all of the statistics from the {@link shaka.extern.Stats `Stats`} extern can be displayed.

Example:
```js
// Add a context menu with the 'statistics' button that displays a container with
// the current 'width', 'height', 'playTime', and 'bufferingTime' values.
const config = {
  'customContextMenu' : true,
  'contextMenuElements' : ['statistics'],
  'statisticsList' : ['width', 'height', 'playTime', 'bufferingTime'],
}
ui.configure(config);
```

The presence of the seek bar and the big play button in the center of the video element can be
customized with `addSeekBar` and `addBigPlayButton` booleans in the config.

UI layout can be reconfigured at any point after it's been created.
Please note that custom layouts might need CSS adjustments to look good.

#### Changing seek bar progress colors
The seek bar consists of three segments: past (already played part of the presentation),
future-buffered and future-unbuffered.
To customize the colors, add your values to the config object under `seekBarColors`:
 ```js
const config = {
  'seekBarColors': {
    base: 'rgba(255, 255, 255, 0.3)',
    buffered: 'rgba(255, 255, 255, 0.54)',
    played: 'rgb(255, 255, 255)',
  }
}
ui.configure(config);
```

If you're using our ad API, you can also specify the color for the ad break markers on
the timeline:
 ```js
const config = {
  'seekBarColors': {
    adBreaks: 'rgb(255, 204, 0)',
  }
}
ui.configure(config);
```

#### Configuring playback, fast forward and rewind rates
The rate in which the player can play, fast forward and rewind content can be configured using the `playbackRates`, `fastForwardRates` and `rewindRates` options.

* `playbackRates`: List of rates available in the `playback_rate` menu.
* `fastForwardRates`: List of rates available to cycle through every time the `fast_forward` button is clicked.
* `rewindRates`: List of rates available to cycle through every time the `rewind` button is clicked.

 ```js
const config = {
  'controlPanelElements': ['playback_rate', 'fast_forward', 'rewind'],
  'playbackRates': [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
  'fastForwardRates': [2, 4, 8, 1],
  'rewindRates': [-1, -2, -4, -8],
}
ui.configure(config);
```

#### Creating custom elements and adding them to the UI
It's possible to add custom application-specific buttons to the UI.
Each element has to have it's own class that implements the {@linksource shaka.extern.IUIElement}
interface and register with {@linksource shaka.ui.Controls}.
All our elements use {@linksource shaka.ui.Element} as a base class. Take a look to see if it's
right for your custom buttons.

Let's say, we want to create a button that allows user to skip the currently playing video and go to
the next one.

```js
// skipButton.js

// Use shaka.ui.Element as a base class
myapp.SkipButton = class extends shaka.ui.Element {
  constructor(parent, controls) {
    super(parent, controls);

    // The actual button that will be displayed
    this.button_ = document.createElement('button');
    this.button_.textContent = 'Skip current video';
    this.parent.appendChild(this.button_);

    // Listen for clicks on the button to start the next playback
    this.eventManager.listen(this.button_, 'click', () => {
      const nextManifest = /* Your logic to pick the next video to be played */
        myapp.getNextManifest();

      // shaka.ui.Element gives us access to the player object as member of the class
      this.player.load(nextManifest);
    });
  }
};


// Factory that will create a button at run time.
myapp.SkipButton.Factory = class {
  create(rootElement, controls) {
    return new myapp.SkipButton(rootElement, controls);
  }
};

// Register our factory with the controls, so controls can create button instances.
shaka.ui.Controls.registerElement(
  /* This name will serve as a reference to the button in the UI configuration object */ 'skip',
  new myapp.SkipButton.Factory());

```

We have our button. Let's see how we can add it to the layout.
Similar to specifying the order of shaka-provided controls, we'll need to
add a line to the `init()` function in myapp.js

```js
// This will add three buttons to the controls panel (in that order): shaka-provided
// rewind and fast forward button and out custom skip button, referenced by the name
// we used when registering the factory with the controls.
uiConfig['controlPanelElements'] = ['rewind', 'fast_forward', 'skip'];
```
<!-- TODO: Create a doc on best a11y practices for custom buttons and link to the
  localization docs explaining how to take advantage of our localization system. -->

####  Shaka Theme Gallery
Check out the set of [pre-packaged Shaka UI themes][], created by [@lucksy][]!
PR contributions to [the gallery repo][] are welcome.
[@lucksy]: https://github.com/lucksy
[pre-packaged Shaka UI themes]: https://lucksy.github.io/shaka-player-themes/
[the gallery repo]: https://github.com/lucksy/shaka-player-themes


#### Continue the Tutorials

Next, check out {@tutorial a11y} to make your custom buttons accessible to screen readers.
