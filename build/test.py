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

"""Runs unit and integrations tests on the library."""

import platform
import sys

import build
import gendeps
import shakaBuildHelpers


def run_tests_single(args):
  """Runs all the karma tests."""
  karma_path = shakaBuildHelpers.get_node_binary_path('karma')
  cmd = [karma_path, 'start']

  if shakaBuildHelpers.is_linux() and '--use-xvfb' in args:
    cmd = ['xvfb-run', '--auto-servernum'] + cmd

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
    return shakaBuildHelpers.execute_get_code(cmd_line)
  else:
    # Run with command-line arguments from the user.
    if '--browsers' not in args:
      print 'No --browsers specified.'
      print 'In this mode, browsers must be manually connected to karma.'
    cmd_line = cmd + args
    return shakaBuildHelpers.execute_get_code(cmd_line)


def run_tests_multiple(args):
  """Runs multiple iterations of the tests when --runs is set."""
  index = args.index('--runs') + 1
  if index == len(args) or args[index].startswith('--'):
    print >> sys.stderr, 'Argument Error: --runs requires a value.'
    return 1
  try:
    runs = int(args[index])
  except ValueError:
    print >> sys.stderr, 'Argument Error: --runs value must be an integer.'
    return 1
  if runs <= 0:
    print >> sys.stderr, 'Argument Error: --runs value must be greater than 0.'
    return 1

  results = []
  print '\nRunning the tests %d times.' % runs
  for _ in range(runs):
    results.append(run_tests_single(args))

  print '\nAll runs completed.'
  print '%d passed out of %d total runs.' % (results.count(0), len(results))
  print 'Results (exit code): %r' % results
  return all(result == 0 for result in results)


def run_tests(args):
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

  if '--runs' in args:
    return run_tests_multiple(args)
  else:
    return run_tests_single(args)


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
