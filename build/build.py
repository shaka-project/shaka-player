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

"""Creates a build from the given commands.

A command is either an addition or a subtraction.  An addition is prefixed with
a +; a subtraction is when prefixed with a -.  After the character, there is a
name of a file or a @ sign and the name of a build file.

Build files are the files found in build/types.  These files are simply a
newline separated list of commands to execute.  So if the "+@complete" command
is given, it will open the complete file and run it (which may in turn open
other build files).  Subtracting a build file will reverse all actions applied
by the given file.  So "-@networking" will remove all the networking plugins.

The core library is always included so does not have to be listed.  The default
is to use the name 'compiled'; if no commands are given, it will build the
complete build.

Examples:
  # Equivalent to +@complete
  build.py

  build.py +@complete
  build.py +@complete -@networking
  build.py --name custom +@manifests +@networking +../my_plugin.js
"""

import os
import re
import shutil
import subprocess
import sys

import shakaBuildHelpers


closure_opts = [
    '--language_in', 'ECMASCRIPT5',
    '--language_out', 'ECMASCRIPT3',

    '--jscomp_error=*',

    # 'deprecatedAnnotations' controls complains about @expose, but the new
    # @nocollapse annotation does not do the same job for properties.
    # So since we can't use the new annotations, we have to ignore complaints
    # about the old one.
    '--jscomp_off=deprecatedAnnotations',

    '--extra_annotation_name=listens',
    '--extra_annotation_name=exportDoc',

    '--conformance_configs',
    ('%s/build/conformance.textproto' %
     shakaBuildHelpers.cygwin_safe_path(shakaBuildHelpers.get_source_base())),

    '-O', 'ADVANCED',
    '--generate_exports',
    ('--output_wrapper_file=%s/build/wrapper.template.js' %
     shakaBuildHelpers.cygwin_safe_path(shakaBuildHelpers.get_source_base())),

    '-D', 'COMPILED=true',
    '-D', 'goog.DEBUG=false',
    '-D', 'goog.STRICT_MODE_COMPATIBLE=true',
    '-D', 'goog.ENABLE_DEBUG_LOADER=false',
    '-D', 'goog.asserts.ENABLE_ASSERTS=false',
    '-D', 'shaka.log.MAX_LOG_LEVEL=0',
    '-D', 'GIT_VERSION="%s"' % shakaBuildHelpers.calculate_version()
]


class Build(object):
  """Defines a build that has been parsed from a build file.

  This has exclude files even though it will not be used at the top-level.  This
  allows combining builds.  A file will only exist in at most one set.

  Members:
    include - A set of files to include.
    exclude - A set of files to remove.
  """

  def __init__(self, include=None, exclude=None):
    self.include = include or set()
    self.exclude = exclude or set()

  def _get_build_file_path(self, name, root):
    """Gets the full path to a build file, if it exists.

    Args:
      name: The string name to check.
      root: The full path to the base directory.

    Returns:
      The full path to the build file, or None if not found.
    """
    source_base = shakaBuildHelpers.get_source_base()
    local_path = os.path.join(root, name)
    build_path = os.path.join(source_base, 'build', 'types', name)
    if (os.path.isfile(local_path) and os.path.isfile(build_path)
        and local_path != build_path):
      print >> sys.stderr, 'Build file "%s" is ambiguous' % name
      return None
    elif os.path.isfile(local_path):
      return local_path
    elif os.path.isfile(build_path):
      return build_path
    else:
      print >> sys.stderr, 'Build file not found: ' + name
      return None

  def _combine(self, other):
    include_all = self.include | other.include
    exclude_all = self.exclude | other.exclude
    self.include = include_all - exclude_all
    self.exclude = exclude_all - include_all

  def reverse(self):
    return Build(self.exclude, self.include)

  def add_core(self):
    """Adds the core library."""
    # Add externs and closure dependencies.
    source_base = shakaBuildHelpers.get_source_base()
    match = re.compile(r'.*\.js$')
    self.include |= set(
        shakaBuildHelpers.get_all_files(
            os.path.join(source_base, 'externs'), match) +
        shakaBuildHelpers.get_all_files(
            os.path.join(source_base, 'third_party', 'closure'), match))

    # Check that there are no files in 'core' that are removed
    core_build = Build()
    core_build.parse_build(['+@core'], os.getcwd())
    core_files = core_build.include
    if self.exclude & core_files:
      print >> sys.stderr, 'Cannot exclude files from core'
    self.include |= core_files

  def parse_build(self, lines, root):
    """Parses a Build object from the given lines of commands.

    This will recursively read and parse builds.

    Args:
      lines: An array of strings defining commands.
      root: The full path to the base directory.

    Returns:
      True on success, False otherwise.
    """
    for line in lines:
      # Strip comments
      try:
        line = line[:line.index('#')]
      except ValueError:
        pass

      # Strip whitespace and ignore empty lines.
      line = line.strip()
      if not line:
        continue

      if line[0] == '+':
        is_neg = False
        line = line[1:].strip()
      elif line[0] == '-':
        is_neg = True
        line = line[1:].strip()
      else:
        print >> sys.stderr, 'Operation (+/-) required'
        return False

      if line[0] == '@':
        line = line[1:].strip()

        build_path = self._get_build_file_path(line, root)
        if not build_path:
          return False
        lines = open(build_path).readlines()
        sub_root = os.path.dirname(build_path)

        # If this is a build file, then recurse and combine the builds.
        sub_build = Build()
        if not sub_build.parse_build(lines, sub_root):
          return False

        if is_neg:
          self._combine(sub_build.reverse())
        else:
          self._combine(sub_build)
      else:
        if not os.path.isabs(line):
          line = os.path.abspath(os.path.join(root, line))
        if not os.path.isfile(line):
          print >> sys.stderr, 'Unable to find file ' + line
          return False

        if is_neg:
          self.include.discard(line)
          self.exclude.add(line)
        else:
          self.include.add(line)
          self.exclude.discard(line)

    return True

  def build_raw(self, extra_opts):
    """Builds the files in |self.include| using the given extra Closure options.

    Args:
      extra_opts: An array of extra options to give to Closure.

    Returns:
      True on success; False on failure.
    """
    jar = os.path.join(shakaBuildHelpers.get_source_base(),
                       'third_party', 'closure', 'compiler.jar')
    jar = shakaBuildHelpers.cygwin_safe_path(jar)
    files = [shakaBuildHelpers.cygwin_safe_path(f) for f in self.include]
    files.sort()

    try:
      cmd_line = ['java', '-jar', jar] + closure_opts + extra_opts + files
      shakaBuildHelpers.print_cmd_line(cmd_line)
      subprocess.check_call(cmd_line)
      return True
    except subprocess.CalledProcessError:
      print >> sys.stderr, 'Build failed'
      return False

  def build_library(self, name, rebuild):
    """Builds Shaka Player using the files in |self.include|.

    Args:
      name: The name of the build.
      rebuild: True to rebuild, False to ignore if no changes are detected.

    Returns:
      True on success; False on failure.
    """
    self.add_core()

    # In the build files, we use '/' in the paths, however Windows uses '\'.
    # Although Windows supports both, the source mapping will not work.  So
    # use Linux-style paths for arguments.
    source_base = shakaBuildHelpers.get_source_base().replace('\\', '/')

    result_prefix = shakaBuildHelpers.cygwin_safe_path(
        os.path.join(source_base, 'dist', 'shaka-player.' + name))
    result_file = result_prefix + '.js'
    result_debug = result_prefix + '.debug.js'
    result_map = result_prefix + '.debug.map'

    # Detect changes to the library and only build if changes have been made.
    if not rebuild and os.path.isfile(result_file):
      build_time = os.path.getmtime(result_file)
      complete_build = Build()
      if complete_build.parse_build(['+@complete'], os.getcwd()):
        complete_build.add_core()
        # Get a list of files modified since the build file was.
        edited_files = [f for f in complete_build.include
                        if os.path.getmtime(f) > build_time]
        if not edited_files:
          print 'No changes detected, not building.  Use --force to override.'
          return True

    opts = ['--create_source_map', result_map, '--js_output_file', result_debug,
            '--source_map_location_mapping', source_base + '|..',
            '--dependency_mode=LOOSE', '--js=shaka-player.uncompiled.js']
    if not self.build_raw(opts):
      return False

    shutil.copyfile(result_debug, result_file)

    # Add a special source-mapping comment so that Chrome and Firefox can map
    # line and character numbers from the compiled library back to the original
    # source locations.
    with open(result_debug, 'a') as f:
      f.write('//# sourceMappingURL=shaka-player.' + name + '.debug.map')

    return True


def usage():
  print 'Usage:', sys.argv[0], """[options] [commands]

Options:
 --force          : Build the library even if no changes are detected.
 --help           : Prints this help page.
 --name           : Sets the name of the build, uses 'compiled' if not given.
"""
  print __doc__


def main(args):
  name = 'compiled'
  lines = []
  rebuild = False
  i = 0
  while i < len(args):
    if args[i] == '--name':
      i += 1
      if i == len(args):
        print >> sys.stderr, '--name requires an argument'
        return 1
      name = args[i]
    elif args[i] == '--force':
      rebuild = True
    elif args[i] == '--help':
      usage()
      return 0
    elif args[i].startswith('--'):
      print >> sys.stderr, 'Unknown option', args[i]
      usage()
      return 1
    else:
      lines.append(args[i])
    i += 1

  if not lines:
    lines = ['+@complete']

  print 'Compiling the library...'
  custom_build = Build()
  if not custom_build.parse_build(lines, os.getcwd()):
    return 1
  return 0 if custom_build.build_library(name, rebuild) else 1

if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)

