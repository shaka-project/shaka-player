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
  * Git 1.7.10+  {@link https://git-scm.com/downloads}
  * Python 2.7.x  {@link https://www.python.org/downloads/}
  * Java Runtime Environment 7+  {@link https://java.com/en/download/}
  * A local web server
    * _NOTE: A local web server is required because browsers place restrictions
      on applications from file:/// URLs._

Additionally, to build the documentation and run the tests, you will need:
  * npm v1.3.12+  {@link https://nodejs.org/en/download/}

To quickly install these prerequisites on Ubuntu or Debian, run:

```sh
sudo apt-get update
sudo apt-get install git python2.7 default-jre-headless npm

# Upgrade npm and node to the latest versions
sudo npm install -g n
sudo n stable
sudo npm install -g npm
```

Installation instructions for other operating systems are not provided here.
(We can't possibly document them all.)  You can follow the links above to
download and install the prerequisites.


#### Get the source

```sh
git clone https://github.com/google/shaka-player.git
cd shaka-player
```


#### Compile the library

```sh
python build/all.py
```

The output is:
 * dist/shaka-player.compiled.js (compiled bundle)
 * dist/shaka-player.compiled.debug.js (debug bundle)
 * dist/shaka-player.compiled.externs.js
   (generated externs, for Closure-based projects)


#### Generate the documentation

```sh
python build/docs.py
```

The output will be in `docs/api/`.


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
