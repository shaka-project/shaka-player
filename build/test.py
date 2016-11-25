#!/usr/bin/python
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

"""Runs unit and integrations tests on the library."""

import platform
import subprocess
import sys

import build
import gendeps
import shakaBuildHelpers


def run_tests(args):
  """Runs all the karma tests."""
  # Update node modules if needed.
  if not shakaBuildHelpers.update_node_modules():
    return 1

  # Generate dependencies and compile library.
  # This is required for the tests.
  if gendeps.gen_deps([]) != 0:
    return 1

  build_args = []
  if '--force' in args:
    build_args.append('--force')
    args.remove('--force')

  if '--no-build' in args:
    args.remove('--no-build')
  else:
    if build.main(build_args) != 0:
      return 1

  karma_path = shakaBuildHelpers.get_node_binary_path('karma')
  cmd = [karma_path, 'start']

  # Get the browsers supported on the local system.
  browsers = _get_browsers()
  if not browsers:
    print >> sys.stderr, 'Unrecognized system "%s"' % platform.uname()[0]
    return 1

  print 'Starting tests...'
  if not args:
    # Run tests in all available browsers.
    print 'Running with platform default:', '--browsers', browsers
    cmd_line = cmd + ['--browsers', browsers]
    shakaBuildHelpers.print_cmd_line(cmd_line)
    return subprocess.call(cmd_line)
  else:
    # Run with command-line arguments from the user.
    if '--browsers' not in args:
      print 'No --browsers specified.'
      print 'In this mode, browsers must be manually connected to karma.'
    cmd_line = cmd + args
    shakaBuildHelpers.print_cmd_line(cmd_line)
    return subprocess.call(cmd_line)


def _get_browsers():
  """Uses the platform name to configure which browsers will be tested."""
  browsers = None
  if shakaBuildHelpers.is_linux():
    # For MP4 support on Linux Firefox, install gstreamer1.0-libav.
    # Opera on Linux only supports MP4 for Ubuntu 15.04+, so it is not in the
    # default list of browsers for Linux at this time.
    browsers = 'Chrome,Firefox'
  elif shakaBuildHelpers.is_darwin():
    browsers = 'Chrome,Firefox,Safari'
  elif shakaBuildHelpers.is_windows() or shakaBuildHelpers.is_cygwin():
    browsers = 'Chrome,Firefox,IE'
  return browsers


if __name__ == '__main__':
  shakaBuildHelpers.run_main(run_tests)
