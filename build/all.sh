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

"$dir"/build/gendeps.sh
"$dir"/build/lint.sh

# Compile once with demo app files so they get checked.  Don't keep the output.
(library_sources_0; closure_sources_0) | compile_0 \
  $arguments \
  --summary_detail_level 3 \
  "$dir"/{app,controls,sender,receiver,receiverApp,appUtils}.js \
  > /dev/null
# NOTE: --js_output_file /dev/null results in a non-zero return value and
# stops execution of this script.

# Default build, all features enabled
"$dir"/build/build.sh
# MP4 VOD content only, no offline, live, or WebM
"$dir"/build/build.sh vod --disable-http --disable-offline --disable-webm --disable-live
# MP4 live content only, no offline, WebM, or SIDX
"$dir"/build/build.sh live --disable-http --disable-offline --disable-webm --disable-containers
