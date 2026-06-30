# Google App Engine Version Index (Turn-down Notice)

The archive of Shaka Player release demos and libraries that used to be hosted
here has been retired.  This folder now serves a single static page at
https://index-dot-shaka-player-demo.appspot.com/ informing users that we no
longer host individual demo versions, and pointing them at CDNs and other
services where library versions can be found.

 - app.yaml: App Engine config file.  Serves the static page.

 - main.py: A trivial entrypoint.  The Python 3 runtime requires one even when
            all content is static.

 - requirements.txt: Used by App Engine to install the necessary Python server
                     requirements (Flask).

 - static/index.html: The turn-down notice.
