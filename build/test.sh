#!/bin/bash

dir=$(dirname "$BASH_SOURCE")/..
cd "$dir"

set -e

# Generate closure dependencies, which are needed by the tests.
./build/gendeps.sh

# Karma may be installed globally or locally.
PATH=$PATH:./node_modules/.bin

wrapper=""
system=$(uname -s)
if [[ "$system" == Linux ]]; then
  # If we are running tests on Linux, run inside a virtual framebuffer.
  wrapper="xvfb-run --auto-servernum"
  # FIXME: Avoid Opera on Linux until we can figure out how to run with MP4
  # enabled.
  browsers="Chrome,FirefoxWithMSE"
elif [[ "$system" == Darwin ]]; then
  browsers="Chrome,FirefoxWithMSE,Safari"
elif [[ "$system" == CYGWIN* ]]; then
  browsers="Chrome,FirefoxWithMSE,IE"
fi

# Run tests in all available browsers.
$wrapper karma start --single-run --browsers "$browsers"

# Run a coverage report in Chrome only.
$wrapper karma start --single-run --reporters coverage --browsers Chrome
