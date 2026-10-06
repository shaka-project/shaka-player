# Configuring text displayer

### Default displayers

Shaka Player supports two implementations of {@link shaka.extern.TextDisplayer}
which can be used to render & style content subtitles.

#### NativeTextDisplayer

{@link shaka.text.NativeTextDisplayer} which uses browser's native cue
renderer. Shaka Player creates corresponding text tracks for text streams on
the video element and provides necessary data so video element can render it.
This is the default displayer when shaka UI is **not** used, we also use
NativeTextDisplayer when using PiP and Fullscreen API of the video element
itself.

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

##### Subtitle timing offset

Shaka Player allows applications to manually adjust subtitle timing using the `textDisplayer.subtitleDelay` configuration option.

This is useful when subtitles are out of sync with the video.

```js
player.configure({
  textDisplayer: {
    subtitleDelay: 2, // Delay subtitles by 2 seconds
  },
});
```

Behavior
- Positive values delay subtitles (they appear later than the video)
- Negative values advance subtitles (they appear earlier than the video)
- Default value is 0 (no offset)

Notes:
- With UITextDisplayer, the subtitle delay is applied dynamically.
- With NativeTextDisplayer, the delay is applied by modifying cue timings when they are added to the video element.

##### Overriding Subtitle Style

Applications can override the style defined by the subtitles with the
following configuration options.  Their default values keep the style defined
by the subtitles, so only the options that are changed override it.

| Option | Values | Default |
|--------|--------|---------|
| `fontScaleFactor` | The factor used to increase or decrease the font size | `1` |
| `positionArea` | `shaka.config.PositionArea` (see below) | `DEFAULT` |
| `fontFamily` | `shaka.config.FontFamily`: `MONOSPACED_SERIF`, `PROPORTIONAL_SERIF`, `MONOSPACED_SANS_SERIF` or `PROPORTIONAL_SANS_SERIF` | `DEFAULT` |
| `fontColor` | A CSS color | `''` |
| `fontOpacity` | Between 0 and 1 | `NaN` |
| `backgroundColor` | A CSS color | `''` |
| `backgroundOpacity` | Between 0 and 1 | `NaN` |
| `characterEdgeStyle` | `shaka.config.CharacterEdgeStyle`: `NONE`, `DROP_SHADOW`, `RAISED`, `DEPRESSED` or `OUTLINE` | `DEFAULT` |

Example configuration:

```js
player.configure({
  textDisplayer: {
    fontScaleFactor: 1.5,
    positionArea: shaka.config.PositionArea.BOTTOM_CENTER,
    fontColor: '#ff0',
    backgroundColor: '#080808',
    backgroundOpacity: 0.5,
    characterEdgeStyle: shaka.config.CharacterEdgeStyle.OUTLINE,
  },
});
```

Note: Only supported on UITextDisplayer.

###### Size

For improved readability, `fontScaleFactor` scales the font size of the
subtitles.  For example, `1.5` makes them 50% bigger.

###### Position

By setting `positionArea`, applications can:

- Explicitly control where subtitles are rendered on the screen
- Override the automatic or cue-defined positioning
- Update subtitle placement dynamically at runtime

This is useful when subtitles need to avoid UI overlays, follow accessibility
guidelines, or provide a consistent layout across different content.

| Value | Screen Position |
|------|-----------------|
| `DEFAULT` | Default player behavior |
| `TOP_LEFT` | Top left |
| `TOP_CENTER` | Top center |
| `TOP_RIGHT` | Top right |
| `CENTER_LEFT` | Center left |
| `CENTER` | Center of the screen |
| `CENTER_RIGHT` | Center right |
| `BOTTOM_LEFT` | Bottom left |
| `BOTTOM_CENTER` | Bottom center |
| `BOTTOM_RIGHT` | Bottom right |

###### Colors and opacities

`fontColor` and `backgroundColor` replace the colors of the subtitles.
`fontOpacity` and `backgroundOpacity` replace the opacity of the color in use,
whether it is the one defined by the subtitles or the one given in the
configuration.  The opacities are only applied to hexadecimal, `rgb()`,
`rgba()` and basic named colors.

###### Character edge style

`characterEdgeStyle` draws an edge around the characters, which makes the
subtitles easier to read over bright video: a drop shadow, a raised or
depressed look, or an outline.  `NONE` removes the edges defined by the
subtitles.

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
   textDisplayFactory: (player) => new CustomTextDisplayer(player),
});
```

Keep in mind text displayers are used entirely for rendering subtitles related
directly to the content. If you wish to display other information, i.e. stream
metadata, you might consider using {@link shaka.ui.Overlay#setTextWatermark}
instead.
