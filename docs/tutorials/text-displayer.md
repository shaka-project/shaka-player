# Configuring text displayer

Shaka Player supports two types of Text Displayer.
1) Using the browser's native API, Shaka Player creates a textTrack along
   with the AUDIO or VIDEO Element.
2) Rendering the subtitles in a container in the DOM.
3) Providing a custom text displayer factory would allow a developer to make
   their own custom text displayer that fits neither category.

By default, if not configured otherwise, the player will use type 1.
To configure type 2, you have to call `setVideoContainer` function before
making `attach` call in the player.

Note: The UI calls setVideoContainer for you if the video's controls are
disabled, so this isn't always necessary when using the UI.
