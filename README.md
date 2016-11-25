# ![Shaka Player](docs/shaka-player-logo.png)

Shaka Player is a JavaScript library for adaptive video streaming.
It plays [DASH][] content without browser plugins using
[MediaSource Extensions][] and [Encrypted Media Extensions][].

We are currently testing on the latest stable releases of Chrome, Firefox, and
Edge, as well as IE 11 and Safari 9. We test using both Widevine and PlayReady,
but any browser-supported DRM system available through EME should work.

Our main goal is to make it as easy as possible to stream adaptive bitrate
video using modern browser technologies. We try to keep the library light and
simple, and it has no third-party dependencies. Everything you need to build
and deploy is in the sources.

We support both ISO BMFF (MP4) and WebM content (even in the same
manifest), WebVTT for subtitles and captions, both clear and encrypted content,
and multilingual content. And best of all, it's free!

[DASH]: http://dashif.org/
[MediaSource Extensions]: http://w3c.github.io/media-source/
[Encrypted Media Extensions]: https://w3c.github.io/encrypted-media/


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

If you installed Shaka Player via npm, the sources have already been compiled
for you.

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
