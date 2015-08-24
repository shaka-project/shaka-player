#!/bin/bash
#
# Copyright 2014 Google Inc.
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

name=
arguments=
function argsHelper() {
  local arg=$1
  local choices=
  shift

  while [[ $# -ne 0 ]]; do
    if [[ $1 == $arg ]]; then
      arguments="$arguments -D shaka.features.$2=false"
      return 0
    fi
    choices="$choices [$1]"
    shift 2
  done

  if [[ -z $name ]] && [[ $arg != -* ]]; then
    name=$arg
  else
    # There is an extra space at the beginning of $choices
    echo "Usage: build.sh$choices [name]"
    exit 1 # Exit here
  fi
}

while [[ $# -ne 0 ]]; do
  argsHelper "$1" --disable-dash "Dash" \
      --disable-offline "Offline" \
      --disable-http "Http" \
      --disable-live "Live"
  shift
done

if [[ -z $name ]]; then
  name=compiled
fi

# This was the old name.
rm -f "$dir"/lib.js{,.map}

# These are the new names.
rm -f "$dir"/shaka-player.${name}.debug.{js,map}
rm -f "$dir"/shaka-player.${name}.js

# Compile once with app/controls.js so they get checked.  Don't keep the output.
(library_sources_0; closure_sources_0) | compile_0 \
  $arguments \
  --summary_detail_level 3 "$dir"/{app,controls}.js > /dev/null
# NOTE: --js_output_file /dev/null results in a non-zero return value and
# stops execution of this script.

# Compile without app/controls.js and output the minified library only.
# Including shaka-player.uncompiled makes sure that nothing gets stripped which
# should be exported.  Otherwise, things unused internally may be seen as dead
# code.
(library_sources_0; closure_sources_0) | compile_0 \
  $arguments \
  "$dir"/shaka-player.uncompiled.js \
  --create_source_map "$dir"/shaka-player.${name}.debug.map \
  --js_output_file "$dir"/shaka-player.${name}.debug.js

# Fork the non-debug version before appending debug info.
cp "$dir"/shaka-player.${name}{.debug,}.js

# Add a special source-mapping comment so that Chrome and Firefox can map line
# and character numbers from the compiled library back to the original source
# locations.
echo "//# sourceMappingURL=shaka-player.${name}.debug.map" >> \
  "$dir"/shaka-player.${name}.debug.js

