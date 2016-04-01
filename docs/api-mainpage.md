## Shaka Player API Documentation

The Shaka Player library is meant to be compiled before deployment.  The
compiled library will only have some symbols exported.  Others will be
inaccessible from the compiled bundle.

Because of this, these API docs can be filtered to show you what is and isn't
accessible.  The combo box in the top-right corner of the page lets you select
different views of the library.  You can choose the "exported", "public", or
"everything" view.

"Exported" means everything which is available outside the compiled library.
In all modes, exported symbols are shown in red.

"Public" means everything which is public in the sources.  This is used in the
sense of [public/protected/private](http://goo.gl/jg5iKD) in object-oriented
programming languages.

"Everything" shows all symbols, even private ones.

Whatever view you choose will be stored by the browser across page loads and
sessions, so you should not have to keep setting it as you browse the docs.

## Tutorials

We have written several tutorials to help you learn about Shaka Player.  Each
is an easy, hands-on tutorial with sample code.  If you don't know where to go
next, we recommend you start with {@tutorial welcome}.
