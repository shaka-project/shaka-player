#!/usr/bin/python
#
# Copyright 2016 Google Inc.
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

import build
import gendeps
import os
import platform
import shakaBuildHelpers
import subprocess
import sys

def runTests(args):
  """Runs all the karma tests."""
  # Update node modules if needed.
  if not shakaBuildHelpers.updateNodeModules():
    return 1

  # Generate dependencies and compile library.
  # This is required for the tests.
  if gendeps.genDeps([]) != 0:
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

  karma_command_name = 'karma'
  if shakaBuildHelpers.isWindows():
    # Windows karma program has a different name
    karma_command_name = 'karma.cmd'

  karma_path = shakaBuildHelpers.getNodeBinaryPath(karma_command_name)
  cmd = [karma_path, 'start']

  # Get the browsers supported on the local system.
  browsers = _GetBrowsers()
  if not browsers:
    print >> sys.stderr, 'Unrecognized system "%s"' % platform.uname()[0]
    return 1

  print 'Starting tests...'
  if len(args) == 0:
    # Run tests in all available browsers.
    print 'Running with platform default:', '--browsers', browsers
    cmdLine = cmd + ['--browsers', browsers]
    shakaBuildHelpers.printCmdLine(cmdLine)
    return subprocess.call(cmdLine)
  else:
    # Run with command-line arguments from the user.
    if '--browsers' not in args:
      print 'No --browsers specified.'
      print 'In this mode, browsers must be manually connected to karma.'
    cmdLine = cmd + args
    shakaBuildHelpers.printCmdLine(cmdLine)
    return subprocess.call(cmdLine)


def _GetBrowsers():
  """Uses the platform name to configure which browsers will be tested."""
  browsers = None
  if shakaBuildHelpers.isLinux():
    # For MP4 support on Linux Firefox, install gstreamer1.0-libav.
    # Opera on Linux only supports MP4 for Ubuntu 15.04+, so it is not in the
    # default list of browsers for Linux at this time.
    browsers = 'Chrome,Firefox'
  elif shakaBuildHelpers.isDarwin():
    browsers = 'Chrome,Firefox,Safari'
  elif shakaBuildHelpers.isWindows() or shakaBuildHelpers.isCygwin():
    browsers = 'Chrome,Firefox,IE'
  return browsers


if __name__ == '__main__':
  shakaBuildHelpers.runMain(runTests)
