# Configuring text displayer`

Shaka Player supports two types of Text Displayer.
1) Using the browser's native API, Shaka Player creates a textTrack along
   with the AUDIO or VIDEO Element.
2) Rendering the subtitles in a container in the DOM.

By default, if not configured otherwise, the player will use type 1.
To configure type 2, you have to call `setVideoContainer` function before
making `load` call in the player.
