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

## Why is this important for accessibility?
- **Inclusivity:** Ensures critical information is conveyed even when full subtitles are unavailable.
- **User Experience:** Prevents confusion during foreign language scenes or when switching audio tracks.
- **Compliance:** Helps meet accessibility standards for multimedia content (eg: European Accessibility Act).
