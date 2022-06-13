# Google App Engine Version Index

This folder contains everything necessary to host an index of Shaka Player
releases and demos at https://index-dot-shaka-player-demo.appspot.com/

 - app.yaml: App Engine config file.  Defines the runtime (Python 3).

 - generate.py: A python script that generates the index's static content from
                a template.

 - requirements.txt: Used by App Engine to install the necessary Python server
                     requirements (Flask).

 - templates/index.html: A Jinja2 template used to generate the index HTML.
