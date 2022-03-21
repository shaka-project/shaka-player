# Google App Engine Version Index

This folder contains everything necessary to host an index of Shaka Player
releases and demos at https://index-dot-shaka-player-demo.appspot.com/

 - app.yaml: App Engine config file.  Defines the runtime (Python 3).

 - main.py: A python service that queries available versions and generates the
            index from a template.

 - requirements.txt: Used by App Engine to install the necessary Python server
                     requirements (Flask, App Engine API).

 - templates/index.html: A Jinja2 template used to generate the index HTML.
