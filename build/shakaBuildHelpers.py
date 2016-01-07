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

"""Contains helper functions used in the build scripts."""

import os
import re
import subprocess
import sys

def getSourceBase():
  """Returns the absolute path to the source code base."""
  return os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def calculateVersion():
  """Returns the version of the library."""
  try:
    # Check git tags for a version number, noting if the sources are dirty.
    return subprocess.check_output(['git', '-C', getSourceBase(), 'describe',
        '--tags', '--dirty']).strip()
  except subprocess.CalledProcessError:
    try:
      # Fall back to NPM's installed package version, and assume the sources
      # are dirty since the build scripts are being run at all after install.
      text = subprocess.check_output(['npm', '--prefix', getSourceBase(), 'ls'])
      match = re.search(r'shaka-player@(.*) ', text)
      if match:
        return match[1] + '-npm-dirty'
    except subprocess.CalledProcessError:
      pass
    raise RuntimeError('Unable to determine library version!')

def getAllFiles(dirPath, exp):
  """Returns an array of absolute paths to all the files at the given path that
  match the given regex (if given).

  Arguments:
    dirPath - The string path to search.
    exp - A regex to match, can be None.

  Returns:
    An array of absolute paths to all the files.
  """
  ret = []
  for root, _, files in os.walk(dirPath):
    for f in files:
      if not exp or exp.match(f):
        ret.append(os.path.join(root, f))
  return ret

def runMain(main):
  """Executes the given function with the current command-line arguments,
  calling exit with the return value.  This ignores keyboard interrupts."""
  try:
    sys.exit(main(sys.argv[1:]))
  except KeyboardInterrupt:
    sys.exit(1)

