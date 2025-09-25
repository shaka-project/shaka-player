# Speech to text

#### Requirements

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


### Why don't I see the text track that the translations should have?

The browser must support [Translator API][], if it does not support it, the tracks will not be created since it is not possible to use this part of this module.


### Why don't I see the translation?

The translation module must support both the input and output languages. If it doesn't, then nothing will be displayed.


[Speech Recognition API]: https://webaudio.github.io/web-speech-api/
[Translator API]: https://webmachinelearning.github.io/translation-api/
