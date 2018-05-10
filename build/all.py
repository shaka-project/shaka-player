#!/usr/bin/env python
#
# Copyright 2016 Google Inc.  All Rights Reserved.
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

"""Builds the dependencies, runs the checks, and compiles the library."""

import argparse
import build
import check
import docs
import gendeps
import shakaBuildHelpers


def main(args):
  parser = argparse.ArgumentParser(
      description='User facing build script for building the Shaka'
                  ' Player Project.')

  parser.add_argument(
      '--fix',
      help='Automatically fix style violations.',
      action='store_true')

  parser.add_argument(
      '--force',
      '-f',
      help='Force building the library even if no files have changed.',
      action='store_true')

  parser.add_argument(
      '--debug',
      help='Limit which build types to build. Will at least build the debug '
           'version.',
      action='store_true')

  parser.add_argument(
      '--release',
      help='Limit which build types to build. Will at least build the '
           'release version.',
      action='store_true')

  parsed_args = parser.parse_args(args)

  code = gendeps.gen_deps([])
  if code != 0:
    return code

  check_args = ['--fix'] if parsed_args.fix else []
  code = check.main(check_args)
  if code != 0:
    return code

  docs_args = []
  code = docs.build_docs(docs_args)
  if code != 0:
    return code

  build_args = ['--name', 'compiled', '+@complete']

  if parsed_args.force:
    build_args += ['--force']

  # Create the list of build modes to build with. If the list is empty
  # by the end, then populate it with every mode.
  modes = []
  modes += ['debug'] if parsed_args.debug else []
  modes += ['release'] if parsed_args.release else []

  # If --debug or --release are not given, build with everything.
  if not modes:
    modes += ['debug', 'release']

  result = 0

  for mode in modes:
    result = build.main(build_args + ['--mode', mode])

    # If a build fails then there is no reason to build the other modes.
    if result:
      break

  return result

if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
