# Welcome to Shaka Player

Shaka Player is a JavaScript library for adaptive video streaming.
It plays [DASH][] content without browser plugins using
[MediaSource Extensions][] and [Encrypted Media Extensions][].

Shaka Player is meant to be deployed after being compiled. The tools you need
to compile the sources and documentation are included in the sources:
[Closure Compiler][], [Closure Linter][], and [JSDoc][].

If you are integrating Shaka Player into another Closure-based project, our
build process will generate externs for Shaka Player itself.

If you installed Shaka Player via npm, the source has been compiled and the
externs have been generated.

[DASH]: http://dashif.org/
[MediaSource Extensions]: http://w3c.github.io/media-source/
[Encrypted Media Extensions]: https://w3c.github.io/encrypted-media/

[Closure Compiler]: https://developers.google.com/closure/compiler/
[Closure Linter]: https://developers.google.com/closure/utilities/docs/linter_howto
[JSDoc]: http://usejsdoc.org/


#### Prerequisites

You can build Shaka on Linux, Windows, or Mac.
To get the sources and compile the library, you will need:
  * {@link https://git-scm.com/downloads Git v1.9+}
  * {@link https://www.python.org/downloads/ Python v2.7 or v3.5+}
  * {@link https://java.com/en/download/ Java Runtime Environment v8+}
  * {@link https://nodejs.org/en/download/ NodeJS v10+}
  * A local web server, such as {@link https://httpd.apache.org/ Apache}
    * _NOTE: A local web server is required because browsers place restrictions
      on applications from file:/// URLs._

To quickly install these prerequisites on Ubuntu or Debian, you can run this
script:

```sh
curl https://raw.githubusercontent.com/google/shaka-player/master/build/install-linux-prereqs.sh | bash
```

We do not provide detailed instructions or scripts for installing these
prerequisites on other operating systems or on non-Debian-based Linux
distributions.  (We couldn't possibly document them all.)  You can follow the
links above to download and install the prerequisites manually on any OS.


#### Get the source

```sh
git clone https://github.com/google/shaka-player.git
cd shaka-player
```


#### Compile the library and generate the docs

```sh
python build/all.py
```

The output is:
 * dist/shaka-player.compiled.js (compiled bundle)
 * dist/shaka-player.compiled.debug.js (debug bundle)
 * dist/shaka-player.compiled.externs.js
   (generated externs, for Closure-based projects)
 * docs/api/index.html (generated documentation)


#### Run the tests

The tests depend on a few third-party tools, which are installed automatically
via `npm` when you run the tests. Nothing will be installed globally.

Run the tests in your platform's browsers using `./build/test.py`. You can
specify particular browsers with the `--browsers` argument. For example:

```sh
./build/test.py --browsers Opera

# or:

./build/test.py --browsers Chrome,Firefox,Edge
```

You can find a full list of available browsers with `--browsers help`, and you
can find a complete list of testing options with `--help`.


#### Join the announcement list

If you want to receive release or survey announcements, you should join our
[mailing list](https://groups.google.com/forum/#!forum/shaka-player-users).
The list is very low volume.


#### Continue the Tutorials

Next, check out {@tutorial basic-usage}.
