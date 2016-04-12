# Welcome to Shaka Player

Shaka Player is a JavaScript library for adaptive video streaming.
It plays [DASH][] content without browser plugins using
[MediaSource Extensions][] and [Encrypted Media Extensions][].

[DASH]: http://dashif.org/
[MediaSource Extensions]: http://w3c.github.io/media-source/
[Encrypted Media Extensions]: https://w3c.github.io/encrypted-media/

#### Prerequisites

You can build Shaka on Linux, Windows, or Mac.
To get the sources and compile the library, you will need:
  * Git 1.7.10+  {@link https://git-scm.com/downloads}
  * Python 2.7.x  {@link https://www.python.org/downloads/}
  * Java Runtime Environment 7+  {@link https://java.com/en/download/}

Additionally, to build the documentation and run the tests, you will need:
  * npm v1.3.12+  {@link https://nodejs.org/en/download/}

To quickly install these prerequisites on Ubuntu or Debian, run:

```sh
sudo apt-get install git python2.7 openjdk-7-jre-headless npm
sudo npm install -g npm  # Upgrade npm to the latest
# Add a symlink missing on some systems:
sudo ln -s /usr/bin/nodejs /usr/local/bin/node
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


#### Join the community

If you want to discuss Shaka Player development or receive notifications when
a new version is released, you should join our [users group].

[users group]: https://groups.google.com/forum/#!forum/shaka-player-users


#### Continue the Tutorials

Next, check out {@tutorial basic-usage}.
