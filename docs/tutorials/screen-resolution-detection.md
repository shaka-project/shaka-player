# Screen resolution detection

Shaka Player is able to detect the screen resolution and limit the resolution
on certain devices:

## Chromecast

We can detect if the device supports 1920x1080 or 3840x2160 (4K).

By default, the maximum resolution supported is 1280x720.

## Tizen

We can detect if the device supports 3840x2160 (4K) or 7680x4320 (8K).

By default, the maximum resolution supported is 1920x1080.

In order to use the necessary APIs you need add the next privilege to your
`config.xml` file:

`<tizen:privilege name="http://developer.samsung.com/privilege/productinfo"/>`

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

### WebView2

When using a WebView2 control in a UWP app, an additional step is required in
order to enable the screen resolution detection. You will need to add a special
project called WinRTAdapter in your project's solution. This project allows
WinRT APIs to be exposed in the WebView2 control.
You will find more information on this [here](https://learn.microsoft.com/en-us/microsoft-edge/webview2/how-to/winrt-from-js).
Make sure you put `Windows.Media.Protection.ProtectionCapabilities`
and `Windows.Media.Protection.ProtectionCapabilityResult` in the WinRTAdapter
_Include filters_ configuration.

## Hisense

We can detect if the device supports 3840x2160 (4K).

By default, the maximum resolution supported is 1920x1080.

## PlayStation 4 & PlayStation 5

We can detect if the device supports 3840x2160 (4K).

By default, the maximum resolution supported is 1920x1080.
