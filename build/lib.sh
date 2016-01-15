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

dir=$(dirname "$BASH_SOURCE")/..

function calculate_version() {
  cd "$dir"
  # Check git tags for a version number, noting if the sources are dirty.
  if ! git describe --tags --dirty 2>/dev/null; then
    # Fall back to NPM's installed package version, and assume the sources
    # are dirty since the build scripts are being run at all after install.
    npm ls | grep shaka-player | sed -e 's/.*@\(.*\?\) .*/\1-npm-dirty/'
  fi
}

GIT_VERSION=$(calculate_version)

# 'deprecatedAnnotations' controls complaints about @expose, but the new
# @nocollapse annotation does not do the same job for properties.
# So since we can't use the new annotations, we have to ignore complaints
# about the old one.

# 'lintChecks' complains about countless instances of implicitly nullable
# types, plus a few other issues.  Even the closure library doesn't pass
# these checks, and the implicit nullability check in particular is over-
# zealous and unhelpful.  So we disable the whole category of 'lintChecks'.

closure_opts="
  --language_in ECMASCRIPT5
  --language_out ECMASCRIPT3

  --jscomp_error='*'
  --jscomp_off=deprecatedAnnotations
  --jscomp_off=lintChecks

  --extra_annotation_name=listens
  --extra_annotation_name=exportDoc

  -O ADVANCED
  --generate_exports
  --output_wrapper_file="$dir"/build/wrapper.template.js

  -D COMPILED=true
  -D goog.DEBUG=false
  -D goog.STRICT_MODE_COMPATIBLE=true
  -D goog.ENABLE_DEBUG_LOADER=false
  -D shaka.asserts.ENABLE_ASSERTS=false
  -D shaka.log.MAX_LOG_LEVEL=0
"
#  -D GIT_VERSION='$GIT_VERSION' # FIXME

set -e

function library_sources_0() {
  find \
    "$dir"/lib \
    "$dir"/externs \
    -name '*.js' -print0
}

function test_sources_0() {
  find \
    "$dir"/test \
    -name '*.js' -print0
}

function closure_sources_0() {
  find \
    "$dir"/third_party/closure \
    -name '*.js' -print0
}

function compile_0() {
  xargs -0 java -jar "$dir"/third_party/closure/compiler.jar $closure_opts "$@"
}

function lint_0() {
  # Allow JSDoc3 tags not normally recognized by the linter, but be strict
  # otherwise.
  jsdoc3_tags=static,summary,namespace,event,description,property,fires,listens,example,exportDoc
  xargs -0 "$dir"/third_party/gjslint/gjslint \
    --nobeep \
    --custom_jsdoc_tags $jsdoc3_tags \
    --strict "$@" 1>&2
}

