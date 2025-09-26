# Speech to text

#### Requirements

 - Use `setVideoContainer` method in the player.
 - [Speech Recognition API][] with support for `start(MediaStreamTrack audioTrack)` method.

Note: It is necessary that the required APIs are present and functional.

#### Optional requirements

 - [Translator API][].


### How does it work?

Using the Web Audio API, the audio track is passed to the Speech Recognition module, which returns what was said in the audio at that moment.

There are two options here, depending on the configuration:
- Display the text as is
- If a translation was chosen, the text is sent to the Translator module, which returns the translation.

When this module is activated, only Speech to Text is used by default. If you need it to be translated, you must specify the languages in the configuration.

The text is rendered inside a container whose class is 'shaka-speech-to-text-container' created inside videoContainer.

The text is truncated by default, and the number of characters can be configured with `streaming.speechToText.maxTextLength`.


### Configuration
 - `enabled`: Enable this module.
 - `maxTextLength`: Number of characters before truncation.
 - `processLocally`: Indicates a requirement that the speech recognition process MUST be performed locally on the user’s device. If set to false, the user agent can choose between local and remote processing. Note: remote processing is done by the browser and we have no control over what 3rd parties are involved.
 - `languagesToTranslate`: List of languages to translate into.


### How to differentiate these tracks

All these tracks have `originalLanguage` equal to `speech-to-text`.

Track without any translation has `language` equal to `''`.

When a track is translated it has `language` it is translated into.


### Why don't I see the text track that the translations should have?

The browser must support [Translator API][], if it does not support it, the tracks will not be created since it is not possible to use this part of this module.


### Why don't I see the translation?

The translation module must support both the input and output languages. If it doesn't, then nothing will be displayed.


[Speech Recognition API]: https://webaudio.github.io/web-speech-api/
[Translator API]: https://webmachinelearning.github.io/translation-api/
