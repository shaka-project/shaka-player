# Google App Engine Demo

This folder contains everything necessary to host our demo on
https://shaka-player-demo.appspot.com/

 - app.yaml: App Engine config file.  Defines cache expiration and how specific
             URLs are mapped to specific files.

 - main.py: A catch-all python service to serve any non-static files.  This
            handles HTTP redirects for the root path (this is the only way to
            do HTTP redirects in App Engine) and the poster service (which
            returns special poster images on certain days).

 - requirements.txt: Used by App Engine to install the necessary Python server
                     requirements (Flask).

 - time.txt: A static file used for time sync in the client.  Configured with
             special response headers for cross-origin access.
