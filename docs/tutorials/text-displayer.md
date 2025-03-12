# Configuring text displayer

### Default displayers

Shaka Player supports two implementations of {@link shaka.extern.TextDisplayer}
which can be used to render & style content subtitles.

#### SimpleTextDisplayer

{@link shaka.text.SimpleTextDisplayer} which uses browser's native cue
renderer. Shaka Player creates a custom text track attached to the video
element and provides necessary data so video element can render it. This is
the default displayer when shaka UI is **not** used.

#### UITextDisplayer

{@link shaka.text.UITextDisplayer} which renders subtitles inside of a DOM
container provided to shaka.
Container can be provided in 2 ways, by either a {@link shaka.Player}
constructor or a {@link shaka.Player#setVideoContainer} method. This call
is done automatically when using Shaka UI.
```js
// Take your custom video container element.
const container = document.getElementById('video_container');
// Attach container using player constructor.
const player = new shaka.Player(/* mediaElement= */ null, container);
// Alternatively, pass it using dedicated method.
player.setVideoContainer(container);
```

##### Font size scaling for readability

For improved readability the option to scale text size is provided via player
config.

```js
player.configure({
   textDisplayer: {
      fontScaleFactor: 1.5,
   },
});
```

### Text displayer configuration

Additional configuration for the text displayer can be passed by calling:
```js
player.configure({
   textDisplayer: {/*...*/}
});
```
See {@link shaka.extern.TextDisplayerConfiguration} for more details.

### Custom text displayer

If none of displayers is suitable for your needs, you can prepare your own.
To do that you need to implement {@link shaka.extern.TextDisplayer} interface
and pass your custom displayer to shaka by calling:
```js
player.configure({
   textDisplayFactory: () => new CustomTextDisplayer(),
});
```

Keep in mind text displayers are used entirely for rendering subtitles related
directly to the content. If you wish to display other information, i.e. stream
metadata, you might consider using {@link shaka.ui.Overlay#setTextWatermark}
instead.
