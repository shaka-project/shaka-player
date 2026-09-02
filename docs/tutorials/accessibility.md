# Accessibility

## Accessibility and forced text tracks
Accessibility in media playback ensures that all users, including those with hearing impairments or language barriers, can enjoy the content. One important feature is the use of **forced text tracks** as a fallback when no other subtitle or caption track is selected.

### What are forced text tracks?
Forced text tracks are subtitles or captions that appear automatically for specific parts of the content, such as foreign language dialogue or critical on-screen text. They are not full subtitles but provide essential context.

### Fallback behavior
When the config `accessibility.handleForcedSubtitlesAutomatically` is **true**, the player will select a forced text track under two scenarios:

1. **Initial Selection**
   - If the user’s preferred subtitle language or role does not match any available tracks, the player will ignore `preferredTextLanguage` and `preferredTextRole`.
   - Instead, it will choose a forced text track based on the initial audio variant.

2. **Changing Audio Language**
   - If the user switches the audio language and the previous subtitle track is either missing or was a forced track from the previous language, the player will select a forced text track for the new language.

### Default behavior
By default, this config is **true**, meaning the player will always attempt to provide essential subtitles when no other suitable track is available.

### Why is this important for accessibility?
- **Inclusivity:** Ensures critical information is conveyed even when full subtitles are unavailable.
- **User Experience:** Prevents confusion during foreign language scenes or when switching audio tracks.
- **Compliance:** Helps meet accessibility standards for multimedia content (eg: European Accessibility Act).



## Speech to text
The **Speech-to-Text module** enables real-time transcription of audio streams within a player environment. It leverages the [Web Audio API][] and the [Speech Recognition API] to convert spoken content into text, with optional integration of the [Translator API][] for multilingual support. This feature enhances accessibility and user experience by providing on-screen captions or translated text dynamically.

### Requirements

 - Use `setVideoContainer` method in the player.
 - [Speech Recognition API][] with support for `start(MediaStreamTrack audioTrack)` method.

**Note:** The required APIs must be available and functional.

### Optional requirements

 - [Translator API][].

### How it Works
Using the **Web Audio API**, the audio track is passed to the Speech Recognition module, which returns the spoken text in real time.

There are two possible behaviors, depending on the configuration:

- Display the recognized text as-is.
- If translation is enabled, the text is sent to the Translator module, which returns the translated version.

By default, when this module is activated, only **Speech-to-Text** is used. To enable translation, you must specify the target languages in the configuration.

The text is rendered inside a container with the class `shaka-speech-to-text-container`, created within `videoContainer`.

Text is truncated by default, and the maximum number of characters can be configured using `accessibility.speechToText.maxTextLength`.

### Configuration options
- `enabled`: Enables or disables this module.
- `maxTextLength`: Maximum number of characters before truncation.
- `processLocally`: Indicates whether speech recognition **must** be performed locally on the user’s device. If set to `false`, the user agent may choose between local and remote processing.
  **Note:** Remote processing is handled by the browser, and we have no control over third-party involvement.
- `languagesToTranslate`: List of target languages for translation.

### Track identification
All generated tracks have `originalLanguage` set to `speech-to-text`.

- Tracks without translation have `language` equal to `''`.
- Translated tracks have `language` set to the target language.


### Why don’t I see the translation track?
The browser must support the [Translator API][]. If it does not, translation tracks will not be created because this functionality cannot be used.


### Why isn’t the translation displayed?
The translation module must support both the input and output languages. If it does not, no translated text will be shown.


[Web Audio API]: https://webaudio.github.io/web-audio-api/
[Speech Recognition API]: https://webaudio.github.io/web-speech-api/
[Translator API]: https://webmachinelearning.github.io/translation-api/
