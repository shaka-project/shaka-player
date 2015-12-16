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

name=compiled
rm -f "$dir"/dist/shaka-player.${name}.*
mkdir -p "$dir"/dist

(library_sources_0; closure_sources_0) | compile_0 \
  $arguments \
  --create_source_map "$dir"/dist/shaka-player.${name}.debug.map \
  --js_output_file "$dir"/dist/shaka-player.${name}.debug.js

# Fork the non-debug version before appending debug info.
cp "$dir"/dist/shaka-player.${name}{.debug,}.js

# Add a special source-mapping comment so that Chrome and Firefox can map line
# and character numbers from the compiled library back to the original source
# locations.
echo "//# sourceMappingURL=shaka-player.${name}.debug.map" >> \
  "$dir"/dist/shaka-player.${name}.debug.js
