#!/bin/bash
#
# Copyright 2015 Google Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

dir=$(dirname $0)/..
. "$dir"/build/lib.sh

set -e

NPM_VERSION=$(
  grep '"version"' "$dir"/package.json |
    cut -f 2 -d : | sed -e 's/.*"\(.*\)".*/\1/'
)
PLAYER_VERSION=$(
  grep GIT_VERSION "$dir"/lib/player/player.js | grep goog.define |
    cut -f 2 -d , | sed -e "s/.*'\\(.*\\)'.*/\\1/"
)
CHANGELOG_VERSION=$(
  grep '##' "$dir"/CHANGELOG.md | head -1 |
    cut -f 2 -d ' '
)

rv=0

echo "git version = $GIT_VERSION"
echo "npm version = $NPM_VERSION"
echo "player version = $PLAYER_VERSION"
echo "changelog version = $CHANGELOG_VERSION"
echo

if echo "$GIT_VERSION" | grep -q dirty; then
  echo "Git version is dirty!" 1>&2
  rv=1
elif echo "$GIT_VERSION" | egrep -q '(-|unknown)'; then
  echo "Git version is not a tag!" 1>&2
  rv=1
elif ! echo "$GIT_VERSION" | grep -q '^v[0-9]\+\.[0-9]\+\.[0-9]\+$'; then
  echo "Git version is a malformed release version!" 1>&2
  echo "It should be three ints separated by dots, with a 'v' prepended." 1>&2
  rv=1
else
  if [ "v$NPM_VERSION" != "$GIT_VERSION" ]; then
    echo "NPM version does not match git version!" 1>&2
    rv=1
  fi

  if [ "$PLAYER_VERSION" != "$GIT_VERSION-debug" ]; then
    echo "Player version does not match git version!" 1>&2
    rv=1
  fi

  if [ "v$CHANGELOG_VERSION" != "$GIT_VERSION" ]; then
    echo "Changelog version does not match git version!" 1>&2
    rv=1
  fi
fi

exit $rv
