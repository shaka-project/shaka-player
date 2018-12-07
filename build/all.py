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

import apps
import build
import check
import compiler
import docs
import gendeps
import shakaBuildHelpers

import os
import re

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

  if gendeps.main([]) != 0:
    return 1

  check_args = []
  if parsed_args.fix:
    check_args += ['--fix']
  if parsed_args.force:
    check_args += ['--force']
  if check.main(check_args) != 0:
    return 1

  docs_args = []
  if parsed_args.force:
    docs_args += ['--force']
  if docs.main(docs_args) != 0:
    return 1

  match = re.compile(r'.*\.less$')
  base = shakaBuildHelpers.get_source_base()
  main_less_src = os.path.join(base, 'ui', 'controls.less')
  all_less_srcs = shakaBuildHelpers.get_all_files(
      os.path.join(base, 'ui'), match)
  output = os.path.join(base, 'dist', 'controls.css')

  less = compiler.Less(main_less_src, all_less_srcs, output)
  if not less.compile(parsed_args.force):
    return 1

  build_args_with_ui = ['--name', 'ui', '+@complete']
  build_args_without_ui = ['--name', 'compiled', '+@complete', '-@ui']

  if parsed_args.force:
    build_args_with_ui += ['--force']
    build_args_without_ui += ['--force']

  # Create the list of build modes to build with. If the list is empty
  # by the end, then populate it with every mode.
  modes = []
  modes += ['debug'] if parsed_args.debug else []
  modes += ['release'] if parsed_args.release else []

  # If --debug or --release are not given, build with everything.
  if not modes:
    modes += ['debug', 'release']

  for mode in modes:
    # Complete build includes the UI library, but it is optional and player lib
    # should build and work without it as well.
    # First, build the full build (UI included) and then build excluding UI.
    for build_args in [build_args_with_ui, build_args_without_ui]:
      if build.main(build_args + ['--mode', mode]) != 0:
        return 1

    is_debug = mode == 'debug'
    if not apps.build_all(parsed_args.force, is_debug):
      return 1

  return 0

if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
