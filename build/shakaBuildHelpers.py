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

"""Contains helper functions used in the build scripts.  This uses two
environment variables to help with debugging the scripts:

  PRINT_ARGUMENTS - If set, will print any arguments to subprocess.
  RAISE_INTERRUPT - Will raise keyboard interrupts rather than swallowing them.
"""

import os
import platform
import re
import subprocess
import sys

def _parseVersion(s):
  return tuple([int(i) for i in s.split('.')])

def getSourceBase():
  """Returns the absolute path to the source code base."""
  return os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def isLinux():
  """Determines if the system is Linux."""
  return platform.uname()[0] == 'Linux'

def isDarwin():
  """Determines if the system is a Mac."""
  return platform.uname()[0] == 'Darwin'

def isWindows():
  """Determines if the system is native Windows (i.e. not Cygwin)."""
  return platform.uname()[0] == 'Windows'

def isCygwin():
  """Determines if the system is Cygwin (i.e. not native Windows)."""
  return 'CYGWIN' in platform.uname()[0]

def quoteArgument(arg):
  """Quotes shell arguments so that printCmdLine output can be copied and pasted
  into a shell."""
  if '"' in arg:
    assert "'" not in arg
    return "'" + arg + "'"
  if "'" in arg:
    assert '"' not in arg
    return '"' + arg + '"'
  if ' ' in arg:
    return '"' + arg + '"'
  return arg

def printCmdLine(args):
  """Prints the given command line if the environment variable PRINT_ARGUMENTS
  is set."""
  if os.environ.get('PRINT_ARGUMENTS'):
    print ' '.join([quoteArgument(x) for x in args])

def cygwinSafePath(path):
  """If the system is Cygwin, converts the given Cygwin path to a Windows path;
  this does nothing if not Cygwin"""
  if isCygwin():
    cmdLine = ['cygpath', '-w', path]
    printCmdLine(cmdLine)
    return subprocess.check_output(cmdLine).strip()
  else:
    return path

def gitVersion():
  """Gets the version of the library from git."""
  try:
    # Check git tags for a version number, noting if the sources are dirty.
    cmdLine = ['git', '-C', getSourceBase(), 'describe', '--tags', '--dirty']
    printCmdLine(cmdLine)
    return subprocess.check_output(cmdLine).strip()
  except subprocess.CalledProcessError:
    raise RuntimeError('Unable to determine library version!')

def npmVersion(isDirty=False):
  """Gets the version of the library from NPM."""
  try:
    base = cygwinSafePath(getSourceBase())
    cmd = 'npm.cmd' if isWindows() else 'npm'
    cmdLine = [cmd, '--prefix', base, 'ls', 'shaka-player']
    printCmdLine(cmdLine)
    text = subprocess.check_output(cmdLine)
  except subprocess.CalledProcessError as e:
    text = e.output
  match = re.search(r'shaka-player@(.*) ', text)
  if match:
    return match.group(1) + ('-npm-dirty' if isDirty else '')
  raise RuntimeError('Unable to determine library version!')

def calculateVersion():
  """Returns the version of the library."""
  # Fall back to NPM's installed package version, and assume the sources
  # are dirty since the build scripts are being run at all after install.
  try:
    return gitVersion()
  except RuntimeError:
    # If there is an error in |gitVersion|, ignore it and try NPM.  If there
    # is an error with NPM, propagate the error.
    return npmVersion(isDirty=True)

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
  ret.sort()
  return ret

def getNodeBinaryPath(name):
  # Try local modules first.
  base = getSourceBase()
  path = os.path.join(base, 'node_modules', '.bin', name)
  if os.path.isfile(path):
    return path

  # Not found locally, assume it can be found in os.environ['PATH'].
  return name

def updateNodeModules():
  base = cygwinSafePath(getSourceBase())
  cmd = 'npm.cmd' if isWindows() else 'npm'

  # Check the version of npm.
  cmdLine = [cmd, '-v']
  printCmdLine(cmdLine)
  version = subprocess.check_output(cmdLine)
  if _parseVersion(version) < _parseVersion('1.3.12'):
    print >> sys.stderr, 'npm version is too old, please upgrade.  e.g.:'
    print >> sys.stderr, '  npm install -g npm'
    return False

  # Update the modules.
  cmdLine = [cmd, '--prefix', base, 'update']
  printCmdLine(cmdLine)
  subprocess.check_call(cmdLine)
  return True

def runMain(main):
  """Executes the given function with the current command-line arguments,
  calling exit with the return value.  This ignores keyboard interrupts."""
  try:
    sys.exit(main(sys.argv[1:]))
  except KeyboardInterrupt:
    if os.environ.get('RAISE_INTERRUPT'):
      raise
    print >> sys.stderr  # Clear the current line that has ^C on it.
    print >> sys.stderr, 'Keyboard interrupt'
    sys.exit(1)
