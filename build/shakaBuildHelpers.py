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

from __future__ import print_function

import errno
import json
import logging
import os
import platform
import re
import subprocess
import sys
import time

# Python 3 no longer has a separate unicode type.  For type-checking done in
# get_node_binary, create an alias to the str type.
if sys.version_info[0] == 3:
  unicode = str


def _node_modules_last_update_path():
  return os.path.join(get_source_base(), 'node_modules', '.last_update')


def _modules_need_update():
  try:
    last_update = os.path.getmtime(_node_modules_last_update_path())
    if last_update > time.time():
      # Update time in the future!  Something is wrong, so update.
      return True

    package_json_path = os.path.join(get_source_base(), 'package.json')
    last_json_change = os.path.getmtime(package_json_path)
    if last_json_change >= last_update:
      # The json file has changed, so update.
      return True
  except:
    # No such file, so we should update.
    return True

  return False


def _parse_version(version):
  """Converts the given string version to a tuple of numbers."""
  # Handle any prerelease or build metadata, such as -beta or -g1234
  if '-' in version:
    version, trailer = version.split('-')
  else:
    # Versions without a trailer should sort later than those with a trailer.
    # For example, 2.5.0-beta comes before 2.5.0.
    # To accomplish this, we synthesize a trailer which sorts later than any
    # _reasonable_ alphanumeric version trailer would.  These characters have a
    # high value in ASCII.
    trailer = '}}}'
  numeric_parts = [int(i) for i in version.split('.')]
  return tuple(numeric_parts + [trailer])


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

  This is so execute_subprocess output can be copied and pasted into a shell.

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


def open_file(*args, **kwargs):
  """Opens a file with the given mode and options."""
  if sys.version_info[0] == 2:
    # Python 2 returns byte strings even in text mode, so the encoding doesn't
    # matter.
    return open(*args, **kwargs)
  else:
    # Python 3 requires setting an encoding so it reads strings.  The default
    # is based on the platform, which on Windows, isn't UTF-8.
    return open(encoding='utf8', *args, **kwargs)


def execute_subprocess(args, **kwargs):
  """Executes the given command using subprocess.

  If PRINT_ARGUMENTS environment variable is set, this will first print the
  arguments.

  Args:
    args: A list of strings for the subprocess to run.
    kwargs: Extra keyword arguments to pass to Popen.

  Returns:
    The same value as subprocess.Popen.
  """
  # Windows can't run scripts directly, even if executable.  We need to
  # explicitly run the interpreter.
  if args[0].endswith('.js'):
    raise ValueError('Use "node" to run JavaScript scripts')
  if args[0].endswith('.py'):
    raise ValueError('Use sys.executable to run Python scripts')

  if os.environ.get('PRINT_ARGUMENTS'):
    logging.info(' '.join([quote_argument(x) for x in args]))
  try:
    return subprocess.Popen(args, **kwargs)
  except OSError as e:
    if e.errno == errno.ENOENT:
      logging.error('*** A required dependency is missing: %s', args[0])
      # Exit early to avoid showing a confusing stack trace.
      sys.exit(1)
    raise


def execute_get_code(args):
  """Calls execute_subprocess and gets return code."""
  obj = execute_subprocess(args)
  obj.communicate()
  return obj.returncode


def execute_get_output(args):
  """Calls execute_subprocess and get the stdout of the process."""
  obj = execute_subprocess(args, stdout=subprocess.PIPE)
  # This will block until the process terminates, storing the stdout in a string
  stdout = obj.communicate()[0]
  if obj.returncode != 0:
    raise subprocess.CalledProcessError(obj.returncode, args[0], stdout)
  return stdout


def cygwin_safe_path(path):
  """Converts the given path to a Cygwin path, if needed."""
  if is_cygwin():
    return execute_get_output(['cygpath', '-w', path]).strip()
  else:
    return path


def git_version():
  """Gets the version of the library from git."""
  # Check if the shaka-player source base directory has '.git' file.
  git_path = os.path.join(get_source_base(), '.git')
  if not os.path.exists(git_path):
    raise RuntimeError('no .git file is in the shaka-player repository.')
  else:
    try:
      # Check git tags for a version number, noting if the sources are dirty.
      cmd_line = ['git', '-C', get_source_base(), 'describe', '--tags', '--dirty']
      return execute_get_output(cmd_line).decode('utf8').strip()
    except subprocess.CalledProcessError:
      raise RuntimeError('Unable to determine library version!')


def npm_version(is_dirty=False):
  """Gets the version of the library from NPM."""
  try:
    base = cygwin_safe_path(get_source_base())
    cmd = 'npm.cmd' if is_windows() else 'npm'
    cmd_line = [cmd, '--prefix', base, 'ls', 'shaka-player']
    text = execute_get_output(cmd_line).decode('utf8')
  except subprocess.CalledProcessError as e:
    text = e.output.decode('utf8')
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


def get_node_binary(module_name, bin_name=None):
  """Returns an array to be used in the command-line execution of a node binary.

  For example, this may return ['eslint'] (global install)
  or ['node', 'path/to/node_modules/eslint/bin/eslint.js'] (local install).

  Arguments:
    module_name: A string, the name of the module.
    bin_name: An optional string, the name of the binary, which defaults to
              module_name if not provided.

  Returns:
    An array of strings which form the command-line to call the binary.
  """

  if not bin_name:
    bin_name = module_name

  # Check local modules first.
  base = get_source_base()
  path = os.path.join(base, 'node_modules', module_name)
  if os.path.isdir(path):
    json_path = os.path.join(path, 'package.json')
    package_data = json.load(open_file(json_path, 'r'))
    bin_data = package_data['bin']

    if type(bin_data) is str or type(bin_data) is unicode:
      # There's only one binary here.
      bin_rel_path = bin_data
    else:
      # It's a dictionary, so look up the specific binary we want.
      bin_rel_path = bin_data[bin_name]

    bin_path = os.path.join(path, bin_rel_path)
    return ['node', bin_path]

  # Not found locally, assume it can be found in os.environ['PATH'].
  return [bin_name]


class InDir(object):
  """A Context Manager that changes directories temporarily and safely."""
  def __init__(self, path):
    self.new_path = path

  def __enter__(self):
    self.old_path = os.getcwd()
    os.chdir(self.new_path)

  def __exit__(self, type, value, traceback):
    os.chdir(self.old_path)


def update_node_modules():
  """Updates the node modules using 'npm', if they have not already been
     updated recently enough."""
  if not _modules_need_update():
    return True

  base = cygwin_safe_path(get_source_base())
  cmd = 'npm.cmd' if is_windows() else 'npm'

  # Check the version of npm.
  version = execute_get_output([cmd, '-v']).decode('utf8')

  if _parse_version(version) < _parse_version('5.0.0'):
    logging.error('npm version is too old, please upgrade.  e.g.:')
    logging.error('  npm install -g npm')
    return False

  # Update the modules.
  # Actually change directories instead of using npm --prefix.
  # See npm/npm#17027 and google/shaka-player#776 for more details.
  with InDir(base):
    # npm update seems to be the wrong thing in npm v5, so use install.
    # See google/shaka-player#854 for more details.
    execute_get_output([cmd, 'install'])

  # Update the timestamp of the file that tracks when we last updated.
  open(_node_modules_last_update_path(), 'wb').close()
  return True


def run_main(main):
  """Executes the given function with the current command-line arguments.

  This calls exit with the return value.  This ignores keyboard interrupts.

  Args:
    main: The main function to call.
  """
  logging.getLogger().setLevel(logging.INFO)
  fmt = '[%(levelname)s] %(message)s'
  logging.basicConfig(format=fmt)

  try:
    sys.exit(main(sys.argv[1:]))
  except KeyboardInterrupt:
    if os.environ.get('RAISE_INTERRUPT'):
      raise
    print(file=sys.stderr)  # Clear the current line that has ^C on it.
    logging.error('Keyboard interrupt')
    sys.exit(1)
