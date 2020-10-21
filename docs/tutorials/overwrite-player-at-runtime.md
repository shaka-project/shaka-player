# What does overwrite player at runtime mean ? And why may you need it

We have a plugins and custom build tutorial section, but sometimes you may only want
to change just a bit html/css/js to the player,
custom build may add unecessary complex to your application and deployment process.

Luckily, we can do that another way (overwrite shaka-player at runtime),
in this tutorial, we'll guide you through a few simple examples to get a feel how to do it.

Of course, there are pros and cons to each approach, let talk about pros:
- Reuse current CDN (you can still use cdnjs, jsdivr, google hosted libraries, etc..).
- Use some commits are merged upstream (master) but not yet in released version.
- Overwrite default inline css shaka-player.

In this tutorial, we will guide you to: add a custom button, modify css style,
modify a function, detach/add new event listener to an existing element,
(in practice you could even rewrite shaka-player a whole at runtime).

#### Add a button
When using shaka player from CDN, your app will have access to global `shaka` variable
(make sure you don't use global variable `shaka` anywhere in your app,
we could accidentally overwrite each other).

First let take a look at these button (don't be afraid):
- [Cast](https://github.com/google/shaka-player/blob/master/ui/cast_button.js)
- [Fast forward](https://github.com/google/shaka-player/blob/master/ui/fast_forward_button.js)
- [Play](https://github.com/google/shaka-player/blob/master/ui/play_button.js)
- [Air play](https://github.com/google/shaka-player/blob/master/ui/airplay_button.js)

What do you see in common ?
A structure compose of 3 parts: a button extends of basic [element](https://github.com/google/shaka-player/blob/master/ui/element.js) attached to shaka.ui namespace
A Factory class and a register method for that Factory class.

Let copy that and put it right after fullscreen button!

```js
shaka.ui.SkipButton = class extends shaka.ui.Element {
  constructor(parent, controls) {
    super(parent, controls);

    // The actual button that will be displayed
    this.button_ = document.createElement('button');
    this.button_.textContent = 'Skip current video';
    // Screen readers will read "skip button"
    this.button_.setAttribute('aria-label', 'Skip');
    this.parent.appendChild(this.button_);
  }
};

shaka.ui.SkipButton.Factory = class {
  create(rootElement, controls) {
    return new shaka.ui.SkipButton(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
    'skip', new shaka.ui.SkipButton.Factory());
```

That basically it! When you init shaka-player, make sure you call that `skip` button out

```js
// init config shaka-player section
config['controlPanelElements'] = [
  'play_pause', 'mute', 'volume', 'time_and_duration', 'spacer',
  'overflow_menu', 'fullscreen', 'skip' // order matter, we put skip behind fullscreen
]
```

#### Modify html
Default in shaka-player we have our seeker bar *after* controls bar, what if we want it before ?

```js
var shakaSeekBarContainer = document.getElementsByClassName('shaka-seek-bar-container')[0]
var shakaBottomControls = document.getElementsByClassName('shaka-bottom-controls')[0]
shakaBottomControls.insertBefore(shakaSeekBarContainer, shakaBottomControls.firstChild)
```

The player is just javascript, html and css, you could change it however you like!


#### Modify css style
Some default styling not fit with the theme of your site ? We could easily fix that!

There are some methods we could use to fix our styling, namely:
- using css `!important` attribute. (it's perfectly fine)
- using ResizeObserver dynamic change size of subtitle (when use fullscreen or have @media query)

example:
```css
.shaka-text-container {
  bottom: 0% !important;
}

.shaka-text-container {
  position: absolute;
  bottom: calc(36px + 4.4%) !important;
}
```

```js
const manifestUri = 'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd';

await player.load(manifestUri).then(function () {
  var shakaTextContainer = document.querySelector('.shaka-text-container')

  const resizeObserver = new ResizeObserver(entries => {
    var fontSize = 11 + (1.5 * entries[0].contentRect.width / 100);
    shakaTextContainer.style.fontSize = fontSize + 'px';
  })

  resizeObserver.observe(shakaTextContainer)
})
```

#### Attach/detach event listener
In shaka-player we use our own custom implementation event (what is even [event](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events)? It quite daunting!)
There are two classes you should checkout [event_manager](https://github.com/google/shaka-player/blob/master/lib/util/event_manager.js) and (fake_event_target)[https://github.com/google/shaka-player/blob/master/lib/util/fake_event_target.js]
EventManager is a central map known of every event happen to shaka-player.
FakeEventTarget is an wrapper of [EventTarget](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget).

We will give a few examples how to do it:

For example, we want a shaka-fullscreen class add when [fullscreenchange](https://developer.mozilla.org/en-US/docs/Web/API/Document/fullscreenchange_event) event happen
Let say we want to add `.shaka-fullscreen` same level at `.shaka-video`

```js
shaka.ui.FullscreenButton = class extends shaka.ui.FullscreenButton {
  constructor(parent, controls) {
    super(parent, controls);

    this.eventManager.listen(document, 'fullscreenchange', () => {
      if (document.fullscreen) {
        this.video.classList.add('shaka-fullscreen');
      } else {
        this.video.classList.remove('shaka-fullscreen');
      }
    });
  }
}

shaka.ui.FullscreenButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.FullscreenButton(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
    'fullscreen', new shaka.ui.FullscreenButton.Factory());
```

HINT: try not to register as anonymous function, because there is no link to that function anymore
and we cannot easily deregister it, in this example above it is fine since we don't plan to deregister it later.
