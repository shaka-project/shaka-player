# Shaka Player #

The Shaka Player is a JavaScript library which implements a [DASH][] client.
It relies on [HTML5 video][], [MediaSource Extensions][], and [Encrypted Media
Extensions][] for playback.

A generic DASH client can be difficult to implement, and the DASH standard does
not always align well with the new browser APIs that DASH clients are built on.
Our goal is to reduce this friction and make it easier to adopt these emerging
web standards for streaming, without falling back to plugins.

We support both ISO BMFF (MP4) and WebM files (even in the same manifest),
WebVTT for subtitles and captions, both clear and encrypted content, and
multiple audio and subtitle languages (even in the same manifest).
And best of all, it's free!

[DASH]: http://dashif.org/
[HTML5 video]: http://www.html5rocks.com/en/tutorials/video/basics/
[MediaSource Extensions]: http://w3c.github.io/media-source/
[Encrypted Media Extensions]: https://w3c.github.io/encrypted-media/


## Dependencies ##

Most of the tools you need to work on the Shaka Player are included in the
sources, including the [Closure Compiler][], [gjslint][], [JSDoc][], and
[Jasmine][].

The build scripts assume the presence of tools which are readily available on
Linux and Mac, such as bash, python, git, and java.  For Windows, you can
[use cygwin][].

The Closure Compiler is built with Java JRE 7, so you must have JRE 7 or newer
in order to compile Shaka Player.

[Closure Compiler]: https://developers.google.com/closure/compiler/
[gjslint]: https://developers.google.com/closure/utilities/docs/linter_howto
[JSDoc]: http://usejsdoc.org/
[Jasmine]: http://jasmine.github.io/2.1/introduction.html
[use cygwin]: http://shaka-player-demo.appspot.com/docs/tutorial-windows.html


## Mailing list ##

We have a [public mailing list][] for discussion and announcements.  To receive
notifications about new versions, please join the list.  You can also use the
list to ask questions or discuss Shaka Player development.

[public mailing list]: https://groups.google.com/forum/#!forum/shaka-player-users


## Documentation ##

We have detailed documentation which is generated from the sources using JSDoc.
A pre-rendered version of this documentation is available on the web at
http://shaka-player-demo.appspot.com/docs/index.html .  This will be updated
with each release, but you can generate the same docs yourself at any time:
```Shell
./build/docs.sh
```

If you are new to the project, we recommend you start by browsing the docs,
in particular [the tutorials][].  This landing page is very brief, and only
covers the most basic information about the project.

[the tutorials]: http://shaka-player-demo.appspot.com/docs/tutorial-player.html


## Getting Sources ##

Up-to-date sources can be obtained from http://github.com/google/shaka-player .


## Building ##

The development process is documented in more detail [in our generated docs][],
but in short, you can build the library by running:
```Shell
./build/all.sh
```

Compiling Shaka Player requires Java JRE 7 or greater, but you can use the
library in uncompiled mode without Java.  Just generate the closure
dependencies by running:
```Shell
./build/gendeps.sh
```

[in our generated docs]: http://shaka-player-demo.appspot.com/docs/tutorial-dev.html


## Running ##

The library comes with a test app that can be used to tinker with all of the
library's basic functionality.  The test app (index.html and app.js in the
sources) is meant to be used by making the source folder available to a local
web server and pointing your browser at it.

A hosted version of the test app is also available at
http://shaka-player-demo.appspot.com/ for your convenience.


## Updating ##

Simply pull new sources from github and enjoy!
```Shell
git pull --rebase
```


## Design Overview ##

The main entities you care about are [shaka.player.Player][],
[shaka.player.DashVideoSource][], and [shaka.player.DrmInfo.Config][].
In short, you construct a player and give it a \<video\> tag, then you
construct a DASH video source and give it a manifest URL and an optional DRM
callback.  Your DRM callback returns DrmInfo.Config objects to describe your
DRM setup.  You load this video source into the player to begin playback.

The player handles high-level playback and DRM, while the video source deals
with streaming and all of the low-level parts of adaptive playback.  The DRM
scheme info is an explicit set of parameters for DRM, and contains everything
the library can't glean from a DASH manifest.

More detailed information and walkthroughs with fully-functional sample code
can be found in [the tutorials][].

[shaka.player.Player]: http://shaka-player-demo.appspot.com/docs/shaka.player.Player.html
[shaka.player.DashVideoSource]: http://shaka-player-demo.appspot.com/docs/shaka.player.DashVideoSource.html
[shaka.player.DrmInfo.Config]: http://shaka-player-demo.appspot.com/docs/shaka.player.DrmInfo.html#Config
[the tutorials]: http://shaka-player-demo.appspot.com/docs/tutorial-player.html


## Contributing ##

If you have improvements or fixes, we would love to have your contributions.
Please read CONTRIBUTIONS.md for more information on the process we would like
contributors to follow.

