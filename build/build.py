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

"""Creates a build from the given commands.

A command is either an addition or a subtraction.  An addition is prefixed with
a +; a subtraction is when prefixed with a -.  After the character, there is a
name of a file or a @ sign and the name of a build file.

Build files are the files found in build/types.  These files are simply a
newline separated list of commands to execute.  So if the "+@complete" command
is given, it will open the complete file and run it (which may in turn open
other build files).  Subtracting a build file will reverse all actions applied
by the given file.  So "-@networking" will remove all the networking plugins,
and "-@ui" will remove the UI.

The core library is always included so does not have to be listed.  The default
is to use the name 'ui'; if no commands are given, it will build the complete
build, including the UI.

Examples:
  # Equivalent to +@complete
  build.py

  build.py +@complete
  build.py +@complete -@networking
  build.py +@complete -@ui
  build.py --name custom +@manifests +@networking +../my_plugin.js
"""

import argparse
import logging
import os
import re

import compiler
import generateLocalizations
import shakaBuildHelpers


shaka_version = shakaBuildHelpers.calculate_version()

common_closure_opts = [
    '--language_out', 'ECMASCRIPT3',

    '--jscomp_error=*',

    # Turn off complaints like:
    #   "Private property foo_ is never modified, use the @const annotation"
    '--jscomp_off=jsdocMissingConst',

    '--extra_annotation_name=listens',
    '--extra_annotation_name=exportDoc',
    '--extra_annotation_name=exportInterface',

    '--conformance_configs',
    ('%s/build/conformance.textproto' %
     shakaBuildHelpers.cygwin_safe_path(shakaBuildHelpers.get_source_base())),

    '--generate_exports',
]
common_closure_defines = [
    '-D', 'COMPILED=true',
    '-D', 'goog.STRICT_MODE_COMPATIBLE=true',
    '-D', 'goog.ENABLE_DEBUG_LOADER=false',
]

debug_closure_opts = [
    # Don't use a wrapper script in debug mode so all the internals are visible
    # on the global object.
    '-O', 'SIMPLE',
]
debug_closure_defines = [
    '-D', 'goog.DEBUG=true',
    '-D', 'goog.asserts.ENABLE_ASSERTS=true',
    '-D', 'shaka.log.MAX_LOG_LEVEL=4',  # shaka.log.Level.DEBUG
    '-D', 'shaka.Player.version="%s-debug"' % shaka_version,
]

release_closure_opts = [
    '-O', 'ADVANCED',
]
release_closure_defines = [
    '-D', 'goog.DEBUG=false',
    '-D', 'goog.asserts.ENABLE_ASSERTS=false',
    '-D', 'shaka.log.MAX_LOG_LEVEL=0',
    '-D', 'shaka.Player.version="%s"' % shaka_version,
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
      logging.error('Build file "%s" is ambiguous', name)
      return None
    elif os.path.isfile(local_path):
      return local_path
    elif os.path.isfile(build_path):
      return build_path
    else:
      logging.error('Build file not found: %s', name)
      return None

  def _combine(self, other):
    include_all = self.include | other.include
    exclude_all = self.exclude | other.exclude
    self.include = include_all - exclude_all
    self.exclude = exclude_all - include_all

  def reverse(self):
    return Build(self.exclude, self.include)

  def add_closure(self):
    """Adds the closure library and externs."""
    # Add externs and closure dependencies.
    source_base = shakaBuildHelpers.get_source_base()
    match = re.compile(r'.*\.js$')
    self.include |= set(
        shakaBuildHelpers.get_all_files(
            os.path.join(source_base, 'externs'), match) +
        shakaBuildHelpers.get_all_files(
            os.path.join(source_base, 'third_party', 'closure'), match))

  def add_core(self):
    """Adds the core library."""
    # Check that there are no files in 'core' that are removed
    core_build = Build()
    core_build.parse_build(['+@core'], os.getcwd())
    core_files = core_build.include
    if self.exclude & core_files:
      logging.error('Cannot exclude files from core')
    self.include |= core_files

  def has_ui(self):
    """Returns True if the UI library is in the build."""
    for path in self.include:
      if 'ui' in path.split(os.path.sep):
        return True
    return False

  def generate_localizations(self, locales, force):
    localizations = compiler.GenerateLocalizations(locales)
    localizations.generate(force)
    self.include.add(os.path.abspath(localizations.output))

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
        logging.error('Operation (+/-) required')
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
          logging.error('Unable to find file: %s', line)
          return False

        if is_neg:
          self.include.discard(line)
          self.exclude.add(line)
        else:
          self.include.add(line)
          self.exclude.discard(line)

    return True

  def build_library(self, name, locales, force, is_debug):
    """Builds Shaka Player using the files in |self.include|.

    Args:
      name: The name of the build.
      locales: A list of strings of locale identifiers.
      force: True to rebuild, False to ignore if no changes are detected.
      is_debug: True to compile for debugging, false for release.

    Returns:
      True on success; False on failure.
    """
    self.add_closure()
    self.add_core()
    if self.has_ui():
      self.generate_localizations(locales, force)

    if is_debug:
      name += '.debug'

    build_name = 'shaka-player.' + name
    closure = compiler.ClosureCompiler(self.include, build_name)
    generator = compiler.ExternGenerator(self.include, build_name)

    closure_opts = common_closure_opts + common_closure_defines
    if is_debug:
      closure_opts += debug_closure_opts + debug_closure_defines
      # The output wrapper is only used in the release build.
      closure.add_wrapper = False
    else:
      closure_opts += release_closure_opts + release_closure_defines

    if not closure.compile(closure_opts, force):
      return False

    if not generator.generate(force):
      return False

    return True


def main(args):
  parser = argparse.ArgumentParser(
      description=__doc__,
      formatter_class=argparse.RawDescriptionHelpFormatter)

  parser.add_argument(
      '--locales',
      type=str,
      nargs='+',
      default=generateLocalizations.DEFAULT_LOCALES,
      help='The list of locales to compile in (requires UI, default %(default)r)')

  parser.add_argument(
      '--force',
      '-f',
      help='Force building the library even if no files have changed.',
      action='store_true')

  parser.add_argument(
      '--mode',
      help='Specify which build mode to use.',
      choices=['debug', 'release'],
      default='release')

  parser.add_argument(
      '--debug',
      help='Same as using "--mode debug".',
      action='store_const',
      dest='mode',
      const='debug')

  parser.add_argument(
      '--name',
      help='Set the name of the build. Uses "ui" if not given.',
      type=str,
      default='ui')

  parsed_args, commands = parser.parse_known_args(args)

  # If no commands are given then use complete  by default.
  if len(commands) == 0:
    commands.append('+@complete')

  logging.info('Compiling the library (%s, %s)...',
               parsed_args.name, parsed_args.mode)

  custom_build = Build()

  if not custom_build.parse_build(commands, os.getcwd()):
    return 1

  # Update node modules if needed.
  if not shakaBuildHelpers.update_node_modules():
    return 1

  name = parsed_args.name
  locales = parsed_args.locales
  force = parsed_args.force
  is_debug = parsed_args.mode == 'debug'

  if not custom_build.build_library(name, locales, force, is_debug):
    return 1

  return 0


if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
