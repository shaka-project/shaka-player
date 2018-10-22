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

import argparse
import logging
import os
import re
import subprocess
import sys

import shakaBuildHelpers


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
    '-D', 'shaka.Player.version="%s-debug"' % (
          shakaBuildHelpers.calculate_version()),
]
release_closure_opts = [
    '-O', 'ADVANCED',
]
release_closure_defines = [
    '-D', 'goog.DEBUG=false',
    '-D', 'goog.asserts.ENABLE_ASSERTS=false',
    '-D', 'shaka.log.MAX_LOG_LEVEL=0',
    '-D', 'shaka.Player.version="%s"' % shakaBuildHelpers.calculate_version(),
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

  def _get_closure_jar_path(self):
    jar = os.path.join(shakaBuildHelpers.get_source_base(),
                       'third_party', 'closure', 'compiler.jar')
    return shakaBuildHelpers.cygwin_safe_path(jar)

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
      logging.error('Cannot exclude files from core')
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

  def build_raw(self, closure_opts):
    """Builds the files in |self.include| using the given extra Closure options.

    Args:
      closure_opts: An array of options to give to Closure.

    Returns:
      True on success; False on failure.
    """
    jar = self._get_closure_jar_path()
    files = [shakaBuildHelpers.cygwin_safe_path(f) for f in self.include]
    files.sort()

    cmd_line = ['java', '-jar', jar] + closure_opts + files
    if shakaBuildHelpers.execute_get_code(cmd_line) != 0:
      logging.error('Build failed')
      return False

    return True

  def generate_externs(self, name):
    """Generates externs for the files in |self.include|.

    Args:
      name: The name of the build.

    Returns:
      True on success; False on failure.
    """
    files = [shakaBuildHelpers.cygwin_safe_path(f) for f in self.include]

    extern_generator = shakaBuildHelpers.cygwin_safe_path(os.path.join(
        shakaBuildHelpers.get_source_base(), 'build', 'generateExterns.js'))

    output = shakaBuildHelpers.cygwin_safe_path(os.path.join(
        shakaBuildHelpers.get_source_base(), 'dist',
        'shaka-player.' + name + '.externs.js'))

    cmd_line = ['node', extern_generator, '--output', output] + files
    if shakaBuildHelpers.execute_get_code(cmd_line) != 0:
      logging.error('Externs generation failed')
      return False

    return True

  def build_library(self, name, rebuild, is_debug):
    """Builds Shaka Player using the files in |self.include|.

    Args:
      name: The name of the build.
      rebuild: True to rebuild, False to ignore if no changes are detected.
      is_debug: True to compile for debugging, false for release.

    Returns:
      True on success; False on failure.
    """
    self.add_core()

    # In the build files, we use '/' in the paths, however Windows uses '\'.
    # Although Windows supports both, the source mapping will not work.  So
    # use Linux-style paths for arguments.
    source_base = shakaBuildHelpers.get_source_base().replace('\\', '/')
    if is_debug:
      name += '.debug'

    result_file, result_map = compute_output_files('shaka-player.' + name)

    # Don't build if we don't have to.
    if not rebuild and not self.should_build(result_file):
      return True

    closure_opts = common_closure_opts + common_closure_defines
    if is_debug:
      closure_opts += debug_closure_opts + debug_closure_defines
    else:
      closure_opts += release_closure_opts + release_closure_defines
      # The output wrapper is only used in the release build.
      closure_opts += self.add_wrapper()

    closure_opts += [
        '--create_source_map', result_map, '--js_output_file', result_file,
        '--source_map_location_mapping', source_base + '|..'
    ]
    if not self.build_raw(closure_opts):
      return False

    self.add_source_map(result_file, result_map)

    if not self.generate_externs(name):
      return False

    return True

  def add_source_map(self, result_file, result_map):
    # Add a special source-mapping comment so that Chrome and Firefox can map
    # line and character numbers from the compiled library back to the original
    # source locations.
    with open(result_file, 'a') as f:
      f.write('//# sourceMappingURL=%s' % os.path.basename(result_map))

  def add_wrapper(self):
    """Prepares an output wrapper and returns a list of command line arguments
       for Closure Compiler to use it."""

    # Load the wrapper and use Closure to strip whitespace and comments.
    # This requires %output% in the template to be protected, so Closure doesn't
    # fail to parse it.
    base = shakaBuildHelpers.cygwin_safe_path(
        shakaBuildHelpers.get_source_base())
    wrapper_input_path = '%s/build/wrapper.template.js' % base
    wrapper_output_path = '%s/dist/wrapper.js' % base

    with open(wrapper_input_path, 'rb') as f:
      wrapper_code = f.read().decode('utf8').replace('%output%', '"%output%"')

    jar = self._get_closure_jar_path()
    cmd_line = ['java', '-jar', jar, '-O', 'WHITESPACE_ONLY']
    proc = shakaBuildHelpers.execute_subprocess(
        cmd_line, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE)
    stripped_wrapper_code = proc.communicate(wrapper_code.encode('utf8'))[0]

    if proc.returncode != 0:
      raise RuntimeError('Failed to strip whitespace from wrapper!')

    with open(wrapper_output_path, 'wb') as f:
      code = stripped_wrapper_code.decode('utf8')
      f.write(code.replace('"%output%"', '%output%').encode('utf8'))

    return ['--output_wrapper_file=%s' % wrapper_output_path]

  def should_build(self, result_file):
    if not os.path.isfile(result_file):
      # Nothing built, so we should definitely build.
      return True

    # Detect changes to the set of files that we intend to build.
    build_time = os.path.getmtime(result_file)
    # Get a list of files modified since the result file was created.
    edited_files = [f for f in self.include if os.path.getmtime(f) > build_time]
    if edited_files:
      # Some input files have changed, so we should build again.
      return True

    logging.warning('No changes detected, not building.  Use --force '
                    'to override.')
    return False


def compute_output_files(base_name):
  source_base = shakaBuildHelpers.get_source_base().replace('\\', '/')
  prefix = shakaBuildHelpers.cygwin_safe_path(
      os.path.join(source_base, 'dist', base_name))
  js_path = prefix + '.js'
  map_path = prefix + '.map'
  return js_path, map_path


def compile_demo(rebuild, is_debug):
  """Compile the demo application.

  Args:
    rebuild: True to rebuild, False to ignore if no changes are detected.
    is_debug: True to compile for debugging, false for release.

  Returns:
    True on success, False on failure.
  """
  logging.info('Compiling the demo app (%s)...',
               'debug' if is_debug else 'release')

  match = re.compile(r'.*\.js$')
  base = shakaBuildHelpers.get_source_base()
  def get(*args):
    return shakaBuildHelpers.get_all_files(os.path.join(base, *args), match)

  files = set(get('demo') + get('externs')) - set(get('demo/cast_receiver'))
  # Make sure we don't compile in load.js, which will be used to bootstrap
  # everything else.  If we build that into the output, we will get an infinite
  # loop of scripts adding themselves.
  files.remove(os.path.join(base, 'demo', 'load.js'))
  # Remove service_worker.js as well.  This executes in a different context.
  files.remove(os.path.join(base, 'demo', 'service_worker.js'))
  # Add in the generated externs, so that the demo compilation knows the
  # definitions of the library APIs.
  extern_name = ('shaka-player.compiled.debug.externs.js' if is_debug
                 else 'shaka-player.compiled.externs.js')
  files.add(os.path.join(base, 'dist', extern_name))

  demo_build = Build(files)

  name = 'demo.compiled' + ('.debug' if is_debug else '')
  result_file, result_map = compute_output_files(name)

  # Don't build if we don't have to.
  if not rebuild and not demo_build.should_build(result_file):
    return True

  source_base = shakaBuildHelpers.get_source_base().replace('\\', '/')
  closure_opts = common_closure_opts + debug_closure_opts
  closure_opts += [
      # Ignore missing goog.require since we assume the whole library is
      # already included.
      '--jscomp_off=missingRequire', '--jscomp_off=strictMissingRequire',
      '--create_source_map', result_map, '--js_output_file', result_file,
      '--source_map_location_mapping', source_base + '|..',
      '-D', 'COMPILED=true',
  ]

  if not demo_build.build_raw(closure_opts):
    return False

  demo_build.add_source_map(result_file, result_map)
  return True


def compile_receiver(rebuild, is_debug):
  """Compile the cast receiver application.

  Args:
    rebuild: True to rebuild, False to ignore if no changes are detected.
    is_debug: True to compile for debugging, false for release.

  Returns:
    True on success, False on failure.
  """
  logging.info('Compiling the receiver app (%s)...',
               'debug' if is_debug else 'release')

  match = re.compile(r'.*\.js$')
  base = shakaBuildHelpers.get_source_base()
  def get(*args):
    return shakaBuildHelpers.get_all_files(os.path.join(base, *args), match)

  files = set(get('demo/common') + get('demo/cast_receiver') + get('externs'))
  # Add in the generated externs, so that the receiver compilation knows the
  # definitions of the library APIs.
  extern_name = ('shaka-player.compiled.debug.externs.js' if is_debug
                 else 'shaka-player.compiled.externs.js')
  files.add(os.path.join(base, 'dist', extern_name))

  receiver_build = Build(files)

  name = 'receiver.compiled' + ('.debug' if is_debug else '')
  result_file, result_map = compute_output_files(name)

  # Don't build if we don't have to.
  if not rebuild and not receiver_build.should_build(result_file):
    return True

  source_base = shakaBuildHelpers.get_source_base().replace('\\', '/')
  closure_opts = common_closure_opts + debug_closure_opts
  closure_opts += [
      # Ignore missing goog.require since we assume the whole library is
      # already included.
      '--jscomp_off=missingRequire', '--jscomp_off=strictMissingRequire',
      '--create_source_map', result_map, '--js_output_file', result_file,
      '--source_map_location_mapping', source_base + '|..',
      '-D', 'COMPILED=true',
  ]

  if not receiver_build.build_raw(closure_opts):
    return False

  receiver_build.add_source_map(result_file, result_map)
  return True


def main(args):
  parser = argparse.ArgumentParser(
      description=__doc__,
      formatter_class=argparse.RawDescriptionHelpFormatter)

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
      help='Set the name of the build. Uses "compiled" if not given.',
      type=str,
      default='compiled')

  parsed_args, commands = parser.parse_known_args(args)

  # If no commands are given then use complete  by default.
  if len(commands) == 0:
    commands.append('+@complete')

  logging.info('Compiling the library (%s)...', parsed_args.mode)

  custom_build = Build()

  if not custom_build.parse_build(commands, os.getcwd()):
    return 1

  # Update node modules if needed.
  if not shakaBuildHelpers.update_node_modules():
    return 1

  name = parsed_args.name
  rebuild = parsed_args.force
  is_debug = parsed_args.mode == 'debug'

  if not custom_build.build_library(name, rebuild, is_debug):
    return 1

  if not compile_demo(rebuild, is_debug):
    return 1

  if not compile_receiver(rebuild, is_debug):
    return 1

  return 0

if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
