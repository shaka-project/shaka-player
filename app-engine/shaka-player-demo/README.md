# Google App Engine Demo (Compatibility Shim)

The hosted demo on https://shaka-player-demo.appspot.com/ has been shut down.
This folder now contains a best-effort compatibility shim that forwards old
appspot URLs to their equivalents on GitHub Pages.

This is the *default* version/service for the project, so App Engine routes
requests for every now-deleted version subdomain (nightly-dot-, support-dot-,
v2-4-7-dot-, ...) here, preserving the original Host header.

 - app.yaml: App Engine config file.  Routes every request to the Flask app.

 - main.py: A Flask app that branches on the request's Host header and path and
   forwards old URLs to GitHub Pages.  Most cases are HTTP redirects; the
   /demo/ paths instead render an interstitial page, because the hash fragment
   they rely on is never sent to the server.

 - templates/interstitial.html: The page rendered for /demo/.  Its JavaScript
   reads the URL fragment, translates outdated demo parameters into the current
   format, and forwards the user to the new demo.

 - requirements.txt: Used by App Engine to install the necessary Python server
   requirements (Flask).
