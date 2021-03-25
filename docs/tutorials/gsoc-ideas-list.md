# Google Summer of Code Ideas List

## Update 03.22:

We've received many interests, questions and enhancement ideas for Shaka Player.
Thank you so much! 

We have a few updates regarding the GSoC application.
1. We’re adding a few projects to our list soon, please stay tuned. Please hold
   to start working on the projects until the GSoC program officially starts.
2. We encourage you to focus on the proposal of the listed projects now. You can
   reference your work-in-progress PRs when applying for GSoC. However, please
   understand that we have limited capacity now and would not be able to provide
   close guidance until the GSoC officially starts in the summer. You are
   welcome to send us a PR once you have a complete, fully-tested,
   ready-for-review solution.
3. If you have questions, please send it to the Google group.
4. Please be mindful of posting on the Github page just to claim that you are
   "interested" in working on a task, since it may spam other subscribed
   developers, and also confuse other students applying for GSoC at the same
   time. 
5. Please be kind and only @us for urgent issues on Github regarding your
   questions or PRs, since that might spam the team members who are not GSoC
   mentors.

### Slack channel:
The [video-dev][] is a Slack workspace for general video developers, and you
can join the [#shaka-player][] channel in the video-dev workspace. You can post
your questions at the #shaka-player channel. However, we don’t use Slack as a
primary tool for communication, so please expect a slower response.

[video-dev]: https://video-dev.herokuapp.com/
[#shaka-player]: https://video-dev.slack.com/archives/C01QRAFHLQK


# Introduction
This is a collection of project ideas for [Google Summer of Code 2021][]. 
These projects are intended to be good starting projects for new Shaka Player 
contributors, to complete relatively independently in a few weeks. Familiarity 
with Javascript or Python will be helpful, but not required.

To start, checkout our [demo][] and {@link 
https://nightly-dot-shaka-player-demo.appspot.com/docs/api/tutorial-welcome.html
|tutorial} page, and [contributing guide][].

If you have any questions, you can discuss with us via the [mailing list][] 
or with the GSoC [mentor][].


## Shaka Player UI Library Projects

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
[Github]:https://github.com/google/shaka-player
[demo]:https://shaka-player-demo.appspot.com/demo/#audiolang=en-US;textlang=en-US;bufferingGoal=30;uilang=en-US;panel=HOME;build=uncompiled
[mailing list]:https://groups.google.com/g/shaka-player-gsoc
[Slack chanel]:https://app.slack.com/client/T0XKDDFM0/C01QRAFHLQK
[mentor]:mailto:michellezhuo@google.com
[contributing guide]:https://github.com/google/shaka-player/blob/master/CONTRIBUTING.md


### Add Close Button to the UI Library

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

[Shaka Demo page]:https://shaka-player-demo.appspot.com/demo/#audiolang=en-US;textlang=en-US;bufferingGoal=30;uilang=en-US;panel=HOME;build=uncompiled

[implementation]:https://github.com/google/shaka-player/blob/master/demo/close_button.js

[Github Issue](https://github.com/google/shaka-player/issues/2316)


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

[Github Issue](https://github.com/google/shaka-player/issues/2676)


### Add Video Stats Panel in UI

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

[Github Issue](https://github.com/google/shaka-player/issues/2607)


## Shaka Streamer Projects

[Shaka Streamer](https://github.com/google/shaka-streamer) offers a simple 
config-file based approach to preparing streaming media. It greatly simplifies 
the process of using FFmpeg and Shaka Packager for both VOD and live content.

Shaka Streamer connects FFmpeg and Shaka Packager in a pipeline, such that 
output from FFmpeg is piped directly into the packager, and packaging and 
transcoding of all resolutions, bitrates, and languages occur in parallel.

Live documentation can be found 
[here](https://google.github.io/shaka-streamer/).



### Support Concatenation of Inputs

Estimated complexity: hard

Languages: Python

We’ll allow Shaka Streamer to take a new input type with a list of media files,
stitch the multiple media files together, and convert them to a m3u8 or mpd
playlist as a continuous output.
 
For example, the input config can be:
```json
inputs:
    # The type of input.
  - input_type: concat
    # The media type is required at this level only.
    media_type: video
    list:
      # These only need to have "name" attributes.
      -name: foo1.mp4
      -name: foo2.mp4
       is_interlaced: True  # If you have an interlaced source in the list

    # The type of input.
  - input_type: concat
    # The media type is required at this level only.
    media_type: audio
    language: "de"
    list:
      # These only need to have "name" attributes.
      -name: foo1.mp4
      -name: foo2.mp4
       track_num: 2  # If the 0th audio track is not the one you want here...

```
At the output, we will get an hls / dash playlist, with the three media sources 
stitched together.

There are several ways to concatenate things in ffmpeg, with various
limitations.
1. Concat demuxer (same codecs, same time base, "etc" (ffmpeg doc is vague))
2. Concat protocol (same file format, only concatenateable formats like TS
   supported, analogous to "cat" command)
3. Concat filter (same resolution required, otherwise no restrictions)
4. External ffmpeg process (pre-encoding everything to match parameters first,
then streaming it as one stream)

[Github Issue](https://github.com/google/shaka-streamer/issues/43)


### Add Support for More Audio Codecs

Estimated complexity: medium

Languages: Python

Currently Shaka Streamer supports a few video and audio codecs, and we’ll expand
 our support for the audio codecs of [ac-3][] and [ec-3][].

[ac-3]: https://en.wikipedia.org/wiki/Dolby_Digital
[ec-3]: https://en.wikipedia.org/wiki/Dolby_Digital_Plus

[Github Issue](https://github.com/google/shaka-streamer/issues/37)
