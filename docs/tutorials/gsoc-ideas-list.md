# Google Summer of Code Ideas List

This is a collection of project ideas for [Google Summer of Code 2021][]. 
These projects are intended to be good starting projects for new Shaka Player 
contributors, to complete relatively independently in a few weeks. Familiarity 
with Javascript or Python will be helpful, but not required.

If you're interested in contributing to Shaka Player through Google Summer of 
Code 2021 for other ideas or projects, please see our 
[enhancement list][] and [roadmap][], and let us know via 
[email](mailto:michellezhuo@google.com) or [Github page][]!



## Shaka Player UI Library projects

**Shaka Player** is an open-source JavaScript library for adaptive media. It 
plays adaptive media formats (such as DASH and HLS) in a browser, without using 
plugins or Flash. Instead, Shaka Player uses the open web standards MediaSource 
Extensions and Encrypted Media Extensions.

Shaka Player also supports offline storage and playback of media using 
IndexedDB. Content can be stored on any browser. Storage of licenses depends on 
browser support.

Our main goal is to make it as easy as possible to stream adaptive bitrate video
 and audio using modern browser technologies. We try to keep the library light, 
simple, and free from third-party dependencies. Everything you need to build 
and deploy is in the sources.

**Shaka Player UI library** provides a high-quality accessible localized UI 
layer for the applications. It is an alternate bundle from the base Shaka Player
 library, that adds additional UI-specific classes and a streamlined declarative
 style of setup.

[Google Summer of Code 2021]:https://summerofcode.withgoogle.com/
[enhancement list]:https://github.com/google/shaka-player/issues?q=is%3Aopen+is%3Aissue+label%3A%22contributions+welcome%22
[roadmap]:https://github.com/google/shaka-player/blob/master/roadmap.md
[Github page]:https://github.com/google/shaka-player



### Add close button to the UI library 

Estimated complexity: easy

Languages: Javascript

The Shaka UI library provides a few buttons for the application developer to add
 onto their UI, such as the Play/Pause button, Fullscreen button, etc.
This project will add the Close button as a new compontent of the UI library, 
similar to the Close button on the [Shaka demo page][]. The Close button will 
allow users to stop playing the video and close the video element.

The [implementation][] of the demo page Close button is a good starting point 
for reference.

![Close button](https://user-images.githubusercontent.com/31563237/71356283-c479f000-2592-11ea-80aa-c0ff6992c001.png)

[Shaka Demo page]: https://shaka-player-demo.appspot.com/demo/#audiolang=ru-RU;textlang=ru-RU;uilang=ru-RU;asset=https://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mpd;panel=HOME;build=compiled
[implementation]:https://github.com/google/shaka-player/blob/master/demo/close_button.js



### Add Overflow Menu Buttons to the UI Control Panel

Estimated complexity: hard

Languages: Javascript

Currently the Shaka UI library has two types of buttons:
- Control panel buttons
- Overflow menu buttons

The overflow menu buttons are designed to display in the overflow menu, such as 
the Language button, the Playback Speed button, etc. You can see them by 
clicking the dot button on bottom right.
The control panel buttons are designed to display on the main control panel, 
such as Volumes bar, the Fullscreen button, etc. The overflow menu buttons have 
dropdown menus, and are implemented with a different structure than the control 
panel buttons.

Currently, the application developers cannot add a overflow menu button to the 
control panel easily.
This project will enable adding the overflow menu buttons to the control panel.

An possible solution would be having two versions of each button, to support 
placing them wherever the application developers want.
 
![Overflow menu]( 
https://user-images.githubusercontent.com/28269801/109266388-dec5e400-77bc-11eb-9ac8-dda3dac53bf4.png)



### Add Video Stats panel in UI

Estimated complexity: medium

Languages: Javascript

Similar to Youtube “Stats for nerds”, this project will implement a panel to 
display the video stats as part of the UI library. The users can see a menu on
right click, and choose to display the Stats panel.
This project involves:
1. implementing an overflow menu on right click on the video component
2. displaying an overflow menu with stats data on the video component

![Stats panel1](https://user-images.githubusercontent.com/8983024/83487168-d305f500-a4aa-11ea-8c7b-8d6d7dbde65b.png)
![Stats panel2](https://user-images.githubusercontent.com/8983024/83487122-bcf83480-a4aa-11ea-9f46-2a489f128c7d.png)



## Shaka Streamer projects

[Shaka Streamer](https://github.com/google/shaka-streamer) offers a simple 
config-file based approach to preparing streaming media. It greatly simplifies 
the process of using FFmpeg and Shaka Packager for both VOD and live content.

Live documentation can be found 
[here](https://google.github.io/shaka-streamer/).



### Support concatenation of inputs

Estimated complexity: hard

Languages: Python

We’ll allow Shaka Streamer to transfer a xml/json file with a list of media
files, stitch the multiple inputs together, and convert the media file to m3u8 or mpd playlist in turn as a continuous output.
 
For example, the input xml/json file is:
```json
{
  "input_config": "input.yaml",
  "pipeline_config": "pipeline.yaml",
  "files": [
  {
    "source": "file1.mp4"
  },
  {
    "source": "file2.mp4"
  },
  {
    "source": "file3.mp4"
  }
  ]
}
```
At the output, we will get an hls / dash playlist.



### Add support for audio codecs

Estimated complexity: medium

Languages: Python

Currently Shaka Streamer only supports video codecs, and we’ll expand our 
support for audio codecs, ac-3 and ec-3.
