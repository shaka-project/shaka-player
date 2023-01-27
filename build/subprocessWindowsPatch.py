# Copyright 2021 Google LLC
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

"""Monkeypatch subprocess on Windows to find .CMD scripts.

Without this patch, subprocess fails to find .CMD scripts on Windows, even
though these are executables and should be treated as such according to the
PATHEXT environment variable.

Many people "work around" this issue on Windows with subprocess's shell=True
argument, but this comes with a risk of shell injection vulnerabilities.

Another solution is to explicitly add ".CMD" to the end of some commands on
Windows, but this breaks portability and requires "if windows" to be scattered
around a codebase.

This monkeypatch allows the caller of subprocess to stop worrying about Windows
nuances and to go back to the security best practice of shell=False.  Any .CMD
script that would be found by the Windows shell will now be found by
subprocess.  And because we're using the standard Windows PATHEXT environment
variable, this can be extended to other types of executable scripts, as well.
"""

import os
import subprocess
import sys


# NOTE: All of the higher-level methods eventually delegate to Popen, so we
# only patch that one method.
#   run => Popen
#   call => Popen
#   check_call => call => Popen
#   check_output => run => Popen

# These environment variables should almost certainly exist, but these are
# defaults in case they are missing.
DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD'
DEFAULT_PATH = r'C:\WINDOWS\system32;C:\WINDOWS'


def resolve(exe):
  """Resolve a command name into a full path to the executable."""

  if '/' in exe or '\\' in exe or ':' in exe:
    # This is a path, so don't modify it.
    return exe

  if '.' in exe:
    # This has an extension already.  Don't search for an extension.
    exe_names = [exe]
  else:
    # This is a command name without an extension, so check for every extension
    # in PATHEXT.
    extensions = os.environ.get('PATHEXT', DEFAULT_PATHEXT).split(';')
    exe_names = [exe + ext for ext in extensions]

  exe_paths = os.environ.get('PATH', DEFAULT_PATH).split(';')

  for path in exe_paths:
    for name in exe_names:
      candidate = os.path.join(path, name)
      if os.access(candidate, os.X_OK):  # If executable
        return candidate

  # Failed to resolve, so return the original name and let Popen fail with a
  # natural-looking error complaining that this command cannot be found.
  return exe


real_Popen = subprocess.Popen


def Popen(args, *more_args, **kwargs):
  """A patch to install over subprocess.Popen."""

  # If the first argument is a list, resolve the command name, which is the
  # first item in the list.
  if isinstance(args, list):
    args[0] = resolve(args[0])

  # Delegate to the real Popen implementation.
  return real_Popen(args, *more_args, **kwargs)


# Only patch win32, but not cygwin.  Cygwin works correctly already.
if sys.platform == 'win32':
  # Patch over Popen.
  subprocess.Popen = Popen
  # Copy the docstring from the real Popen into the patch, so that
  # help(subprocess.Popen) is still relatively sane with this patch installed.
  Popen.__doc__ = real_Popen.__doc__
