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

"""Contains helper functions used in the build scripts.

This uses two environment variables to help with debugging the scripts:

  PRINT_ARGUMENTS - If set, will print any arguments to subprocess.
  RAISE_INTERRUPT - Will raise keyboard interrupts rather than swallowing them.
"""

import os
import platform
import re
import subprocess
import sys


def _parse_version(version):
  """Converts the given string version to a tuple of numbers."""
  return tuple([int(i) for i in version.split('.')])


def get_source_base():
  """Returns the absolute path to the source code base."""
  return os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


def is_linux():
  """Determines if the system is Linux."""
  return platform.uname()[0] == 'Linux'


def is_darwin():
  """Determines if the system is a Mac."""
  return platform.uname()[0] == 'Darwin'


def is_windows():
  """Determines if the system is native Windows (i.e. not Cygwin)."""
  return platform.uname()[0] == 'Windows'


def is_cygwin():
  """Determines if the system is Cygwin (i.e. not native Windows)."""
  return 'CYGWIN' in platform.uname()[0]


def quote_argument(arg):
  """Wraps the given argument in quotes if needed.

  This is so print_cmd_line output can be copied and pasted into a shell.

  Args:
    arg: The string to convert.

  Returns:
    The quoted argument.
  """
  if '"' in arg:
    assert "'" not in arg
    return "'" + arg + "'"
  if "'" in arg:
    assert '"' not in arg
    return '"' + arg + '"'
  if ' ' in arg:
    return '"' + arg + '"'
  return arg


def print_cmd_line(args):
  """Prints the given command line if needed.

  This uses the environment variable PRINT_ARGUMENTS.

  Args:
    args: The arguments to print.
  """
  if os.environ.get('PRINT_ARGUMENTS'):
    print ' '.join([quote_argument(x) for x in args])


def cygwin_safe_path(path):
  """Converts the given path to a Cygwin path, if needed."""
  if is_cygwin():
    cmd_line = ['cygpath', '-w', path]
    print_cmd_line(cmd_line)
    return subprocess.check_output(cmd_line).strip()
  else:
    return path


def git_version():
  """Gets the version of the library from git."""
  try:
    # Check git tags for a version number, noting if the sources are dirty.
    cmd_line = ['git', '-C', get_source_base(), 'describe', '--tags', '--dirty']
    print_cmd_line(cmd_line)
    return subprocess.check_output(cmd_line).strip()
  except subprocess.CalledProcessError:
    raise RuntimeError('Unable to determine library version!')


def npm_version(is_dirty=False):
  """Gets the version of the library from NPM."""
  try:
    base = cygwin_safe_path(get_source_base())
    cmd = 'npm.cmd' if is_windows() else 'npm'
    cmd_line = [cmd, '--prefix', base, 'ls', 'shaka-player']
    print_cmd_line(cmd_line)
    text = subprocess.check_output(cmd_line, stderr=subprocess.STDOUT)
  except subprocess.CalledProcessError as e:
    text = e.output
  match = re.search(r'shaka-player@(.*) ', text)
  if match:
    return match.group(1) + ('-npm-dirty' if is_dirty else '')
  raise RuntimeError('Unable to determine library version!')


def calculate_version():
  """Returns the version of the library."""
  # Fall back to NPM's installed package version, and assume the sources
  # are dirty since the build scripts are being run at all after install.
  try:
    return git_version()
  except RuntimeError:
    # If there is an error in |git_version|, ignore it and try NPM.  If there
    # is an error with NPM, propagate the error.
    return npm_version(is_dirty=True)


def get_all_files(dir_path, exp=None):
  """Returns an array of absolute paths to all the files at the given path.

  This optionally will filter the output using the given regex.

  Args:
    dir_path: The string path to search.
    exp: A regex to match, can be None.

  Returns:
    An array of absolute paths to all the files.
  """
  ret = []
  for root, _, files in os.walk(dir_path):
    for f in files:
      if not exp or exp.match(f):
        ret.append(os.path.join(root, f))
  ret.sort()
  return ret


def get_node_binary_path(name):
  # Windows binaries go by a different name.
  if is_windows():
    name += '.cmd'

  # Try local modules first.
  base = get_source_base()
  path = os.path.join(base, 'node_modules', '.bin', name)
  if os.path.isfile(path):
    return path

  # Not found locally, assume it can be found in os.environ['PATH'].
  return name


def update_node_modules():
  """Updates the node modules using 'npm'."""
  base = cygwin_safe_path(get_source_base())
  cmd = 'npm.cmd' if is_windows() else 'npm'

  # Check the version of npm.
  cmd_line = [cmd, '-v']
  print_cmd_line(cmd_line)
  version = subprocess.check_output(cmd_line)
  if _parse_version(version) < _parse_version('1.3.12'):
    print >> sys.stderr, 'npm version is too old, please upgrade.  e.g.:'
    print >> sys.stderr, '  npm install -g npm'
    return False

  # Update the modules.
  cmd_line = [cmd, '--prefix', base, 'update']
  print_cmd_line(cmd_line)
  subprocess.check_call(cmd_line)
  return True


def run_main(main):
  """Executes the given function with the current command-line arguments.

  This calls exit with the return value.  This ignores keyboard interrupts.

  Args:
    main: The main function to call.
  """
  try:
    sys.exit(main(sys.argv[1:]))
  except KeyboardInterrupt:
    if os.environ.get('RAISE_INTERRUPT'):
      raise
    print >> sys.stderr  # Clear the current line that has ^C on it.
    print >> sys.stderr, 'Keyboard interrupt'
    sys.exit(1)
