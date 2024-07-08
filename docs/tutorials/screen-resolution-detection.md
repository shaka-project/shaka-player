# Screen resolution detection

Shaka Player is able to detect the screen resolution and limit the resolution
on certain devices:

## Chromecast

We can detect if the device supports 1920x1080 or 3840x2160 (4K).

By default, the maximum resolution supported is 1280x720.

## Tizen

We can detect if the device supports 3840x2160 (4K) or 7680x4320 (8K).

By default, the maximum resolution supported is 1920x1080.

## WebOS

We can detect if the device supports 1280x720, 1920x1080, 3840x2160 (4K) or
7680x4320 (8K).

By default, the maximum resolution supported is 1920x1080.

## Xbox

We can detect if the device supports 3840x2160 (4K).

By default, the maximum resolution supported is 1920x1080.

Note: in order to use this feature in a UWP app, you must add the URI of your
web app in the ContentURIs section of the Package.appxmanifest file and set
the `WinRT access` field to `All`.

## Hisense

We can detect if the device supports 3840x2160 (4K).

By default, the maximum resolution supported is 1920x1080.

## PlayStation 4 & PlayStation 5

We can detect if the device supports 3840x2160 (4K).

By default, the maximum resolution supported is 1920x1080.
