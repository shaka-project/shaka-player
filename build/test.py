#!/usr/bin/python
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

import gendeps
import os
import platform
import shakaBuildHelpers
import subprocess
import sys

def runTests(args):
  """Runs all the karma tests."""
  # Generate dependencies required for the tests.
  if gendeps.genDeps([]) != 0:
    return 1

  base = shakaBuildHelpers.getSourceBase()
  karma_command_name = 'karma'
  if shakaBuildHelpers.isWindows():
    # Windows karma program has a different name
    karma_command_name = 'karma.cmd'

  # Try local modules first.
  karma_path = os.path.join(base, 'node_modules', '.bin', karma_command_name)
  if not os.path.isfile(karma_path):
    # Not found locally, assume it can be found in os.environ['PATH'].
    karma_path = karma_command_name

  cmd = [karma_path, 'start']

  # Determine the system.
  system = platform.uname()[0]
  if system == 'Linux':
    # If we are running tests on Linux, run inside a virtual framebuffer.
    cmd = ['xvfb-run', '--auto-servernum'] + cmd
    # For MP4 support on Linux Firefox, install gstreamer1.0-libav.
    # Opera on Linux only supports MP4 for Ubuntu 15.04+, so it is not in the
    # default list of browsers for Linux at this time.
    browsers = 'Chrome,Firefox'
  elif system == 'Darwin':
    browsers = 'Chrome,Firefox,Safari'
  elif shakaBuildHelpers.isWindows() or shakaBuildHelpers.isCygwin():
    browsers = 'Chrome,Firefox,IE'
  else:
    print >> sys.stderr, 'Unrecognized system', system
    return 1

  if len(args) == 0:
    # Run tests in all available browsers.
    cmdLine = cmd + ['--browsers', browsers]
    shakaBuildHelpers.printCmdLine(cmdLine)
    code = subprocess.call(cmdLine)
    if code != 0:
      return code

    # Run a basic coverage report in Chrome only.
    cmdLine = cmd + ['--reporters', 'coverage']
    shakaBuildHelpers.printCmdLine(cmdLine)
    return subprocess.call(cmdLine)
  else:
    # Run with command-line arguments from the user.
    cmdLine = cmd + args
    shakaBuildHelpers.printCmdLine(cmdLine)
    return subprocess.call(cmdLine)

if __name__ == '__main__':
  shakaBuildHelpers.runMain(runTests)
