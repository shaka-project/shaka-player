# ![Shaka Player](docs/shaka-player-logo.png)

Shaka Player is an open-source JavaScript library for adaptive media.  It plays
adaptive media formats (such as [DASH][] and [HLS][]) in a browser, without
using plugins or Flash.  Instead, Shaka Player uses the open web standards
[MediaSource Extensions][] and [Encrypted Media Extensions][].

Our main goal is to make it as easy as possible to stream adaptive bitrate
video and audio using modern browser technologies. We try to keep the library
light, simple, and free from third-party dependencies. Everything you need to
build and deploy is in the sources.

Shaka Player supports any browser that supports the necessary web standards.
It is actively tested with:
  - Chrome
  - Chromecast
  - Firefox
  - Microsoft Edge
  - IE 11
  - Safari
  - [Widevine][]
  - [PlayReady][]

Shaka Player supports:
  - Streaming formats:
    - [DASH][]
    - [HLS][]
  - protected content:
    - [Widevine][]
    - [PlayReady][]
    - Clear Key
    - any other [EME][]-compliant DRM system
  - media formats:
    - ISO-BMFF / MP4
    - [WebM][] (depends on browser support)
    - MPEG2-TS (depends on browser support)
    - [WebVTT][]
    - [TTML][]
  - [Chromecast][]
  - offline playback:
    - clear content (all browsers)
    - protected content (depends on browser support)

*Please note that Shaka Player cannot support iOS due to a lack of
[MediaSource Extensions][] on that platform.*

[DASH]: http://dashif.org/
[HLS]: https://developer.apple.com/streaming/
[Widevine]: http://www.widevine.com/
[PlayReady]: https://www.microsoft.com/playready/
[WebM]: https://www.webmproject.org/
[WebVTT]: https://w3c.github.io/webvtt/
[TTML]: https://www.w3.org/TR/ttaf1-dfxp/
[Chromecast]: https://www.google.com/chromecast/
[MediaSource Extensions]: http://w3c.github.io/media-source/
[Encrypted Media Extensions]: https://w3c.github.io/encrypted-media/
[EME]: https://w3c.github.io/encrypted-media/


## Important Links ##

 * [hosted demo](http://shaka-player-demo.appspot.com) (sources in `demo/`)
 * [hosted builds on cdnjs](https://cdnjs.com/libraries/shaka-player)
 * [mailing list](https://groups.google.com/forum/#!forum/shaka-player-users)
     (join for release announcements or to discuss development)
 * [hosted API docs](http://shaka-player-demo.appspot.com/docs/api/index.html)
 * [tutorials](http://shaka-player-demo.appspot.com/docs/api/tutorial-welcome.html)


## Compiled Mode ##

Shaka Player is meant to be deployed after being compiled. The tools you need
to compile the sources and documentation are included in the sources:
[Closure Compiler][], [Closure Linter][], and [JSDoc][].

If you are integrating Shaka Player into another Closure-based project, our
build process will generate externs for Shaka Player itself.

If you installed Shaka Player via npm, the sources have already been compiled
for you and the externs have been generated.

See:
 * dist/shaka-player.compiled.js (compiled bundle)
 * dist/shaka-player.compiled.externs.js (generated externs)

In order to build, you simply need python v2.7 (for the build scripts) and
JRE 7+ (for the compiler). Just run `./build/all.py` and look for the output
in `dist/shaka-player.compiled.js`. The output can be included directly in a
`<script>` tag or loaded via a number of JavaScript module loaders.

To build the documentation, you will also need nodejs. Just run
`./build/docs.py` and look for the output in `docs/api/`.

[Closure Compiler]: https://developers.google.com/closure/compiler/
[Closure Linter]: https://developers.google.com/closure/utilities/docs/linter_howto
[JSDoc]: http://usejsdoc.org/


## Uncompiled Mode ##

Shaka Player can also be run in uncompiled mode. This is very useful for
development purposes.

To load the library without compiling, you will need to generate a Closure
"deps file" by running `./build/gendeps.py`. Then, you'll need to bootstrap
your application with three `<script>` tags:

```html
  <script src="third_party/closure/goog/base.js"></script>
  <script src="dist/deps.js"></script>
  <script src="shaka-player.uncompiled.js"></script>
```

If you installed Shaka Player via npm, the deps file has already been generated
for you.


## Testing ##

You will need a few third-party dependencies to run automated tests. These
dependencies are managed through `npm` and Shaka's `package.json`. If you
cloned Shaka from github, simply run `npm install` from your git working
directory to install these dependencies locally.

Run the tests in your platform's browsers using `./build/test.py`. If you are
familiar with the [karma][] test runner, you can pass additional arguments
to karma from `build/test.py`. For example:

```
./build/test.py --browsers Opera
```

Or:

```
./build/test.py --browsers Chrome,Firefox --reporters coverage
```

You can skip slow-running integration tests with `--quick`.

[karma]: https://karma-runner.github.io/


## Contributing ##

If you have improvements or fixes, we would love to have your contributions.
Please read CONTRIBUTING.md for more information on the process we would like
contributors to follow.
