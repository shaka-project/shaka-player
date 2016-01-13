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
  if shakaBuildHelpers.isWindows():
    # Windows karma program has a different name; plus subprocess on Windows
    # ignores ENV so we cannot use it to help find karma.  So, we need to find
    # it manually.
    env = None
    path = os.path.join(base, 'node_modules', '.bin', 'karma.cmd')
    if os.path.isfile(path):
      cmd = [path, 'start', '--single-run']
    else:
      # Not found locally, assume it can be found in PATH.
      cmd = ['karma.cmd', 'start', '--single-run']
  else:
    # Modify the environment path to include the local karma installation.
    nodeBin = os.path.join(base, 'node_modules', '.bin')
    env = os.environ
    env['PATH'] = env['PATH'] + ':' + nodeBin
    cmd = ['karma', 'start', '--single-run']

  # Determine the system.
  browsers = None
  system = platform.uname()[0]
  if system == 'Linux':
    # If we are running tests on Linux, run inside a virtual framebuffer.
    cmd = ['xvfb-run', '--auto-servernum'] + cmd
    # FIXME: Avoid Opera on Linux until we can figure out how to run with MP4
    # enabled.
    browsers = 'Chrome,FirefoxWithMSE'
  elif system == 'Darwin':
    browsers = 'Chrome,FirefoxWithMSE,Safari'
  elif shakaBuildHelpers.isWindows() or shakaBuildHelpers.isCygwin():
    browsers = 'Chrome,FirefoxWithMSE,IE'
  else:
    print >> sys.stderr, 'Unrecognized system', system
    return 1

  if len(args) == 0:
    # Run tests in all available browsers.
    cmdLine = cmd + ['--browsers', browsers]
    shakaBuildHelpers.printCmdLine(cmdLine)
    code = subprocess.call(cmdLine, env=env)
    if code != 0:
      return code

    # Run a basic coverage report in Chrome only.
    cmdLine = cmd + ['--reporters', 'coverage']
    shakaBuildHelpers.printCmdLine(cmdLine)
    return subprocess.call(cmdLine, env=env)
  else:
    # Run with command-line arguments from the user.
    cmdLine = cmd + args
    shakaBuildHelpers.printCmdLine(cmdLine)
    return subprocess.call(cmdLine, env=env)

if __name__ == '__main__':
  shakaBuildHelpers.runMain(runTests)
