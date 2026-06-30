# Google App Engine Code

This folder contains source code for the services we run on Google App Engine
(appspot.com).  The primary services have been shut down, and these are now
just compatibility shims.

 - shaka-player-demo: Formerly, our hosted demo.  Now, a compatibility service
   to parse outdated links to the old service and forward users to the new demo
   on GitHub Pages.

 - demo-version-index: Formerly, an index of Shaka Player releases and demo
   versions hosted on AppEngine.  Now, a page that informs users that we no
   longer host individual demo versions, and points them to various CDNs and
   other services where library versions can be found.
