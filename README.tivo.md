# shaka-player &middot; [![Shields.io](https://img.shields.io/badge/CD-Inception-blue)](https://builds-inception.tivo.com/job/shaka-player/job/master/)

This patched version of Shaka addresses issues specific to streams that need to be played by the web Portal, in the context of TiVo environments. It solved the issue of JS_INTEGER_OVERFLOW we've found while trying to play our IP Linear streams. 
The VOD assets work without this patch.

How to upgrade the Shaka player version
1. Clone the repo in your local environment: git clone git@github.com:tivocorp/shaka-player.git
2. Extract the diff related to Shaka player only: git diff 8000eca^...d4dd319 > ~/shaka-player.diff
3. Extract the diff for CI/CD system: git diff 9af98aba^..fe5460f7 > ~/shaka-player-build.diff
4. Delete the whole contents of the shaka-player project except for README.tivo.md
5. Copy the desired sources from the open-source shaka-player project to our local project
6. Apply ~/shaka-player-build.diff and commit locally
7. Apply ~/shaka-player.diff and commit locally
8. Push, wait for Tivo Shaka Jenkins job to finish
9. Run updateShakaPlayer Gradle task from Portal 
