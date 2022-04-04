#!/bin/bash

# A script to launch a homedir-installed copy of Safari in Karma.  Used with
# karma-script-launcher and --browsers path/to/script.

# There is an issue where opening a URL in a browser that is not already open
# will also open it in the default browser.  See
# https://apple.stackexchange.com/a/122000/454832 and the comments below it for
# details.

# The workaround is to open the browser explicitly first, without a URL.
open -a ~/Applications/Safari.app --fresh
sleep 5

# Then open the browser with the URL, and wait for it to quite.  In fact, the
# browser won't be closed automatically at all, and Karma will kill this script
# when the tests complete.  But if we don't wait, Karma will error instead.
open -a ~/Applications/Safari.app --wait-apps "$1"
