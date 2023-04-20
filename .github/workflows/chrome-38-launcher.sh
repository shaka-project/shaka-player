#!/bin/bash

# Fail on error
set -e

# A script to launch a copy of Chrome 38.  Used with karma-script-launcher and
# --browsers path/to/script.

# Chrome 38 is too old to be run with any available verison of ChromeDriver.
# So this launches Chrome 38 explicitly as a command with a URL.
# A side benefit of this is that by not using ChromeDriver, we don't run the
# screenshot tests, which would surely fail on such an old version of Chrome.

# The hacked Chrome 38 package installs the browser under a slightly different
# binary name to avoid conflicts.  We also launch with a unique profile
# directory, in case a recent Chrome has been launched with the standard
# profile directory.
google-chrome-38 --user-data-dir=$HOME/.config/google-chrome-38/default "$1"
