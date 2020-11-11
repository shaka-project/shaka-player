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

"""Build our various applications."""

import argparse
import logging
import os
import re

import build
import compiler
import shakaBuildHelpers


def compile_demo(force, is_debug):
  """Compile the demo application.

  Args:
    force: True to rebuild, False to ignore if no changes are detected.
    is_debug: True to compile for debugging, false for release.

  Returns:
    True on success, False on failure.
  """
  logging.info('Compiling the demo app (%s)...',
               'debug' if is_debug else 'release')

  match = re.compile(r'.*\.js$')
  base = shakaBuildHelpers.get_source_base()
  def get(*path_components):
    return shakaBuildHelpers.get_all_files(
        os.path.join(base, *path_components), match)

  files = set(get('demo') + get('externs') + get('ui', 'externs') + get('third_party', 'closure')) - set(get('demo', 'cast_receiver'))

  # Make sure we don't compile in load.js, which will be used to bootstrap
  # everything else.  If we build that into the output, we will get an
  # infinite loop of scripts adding themselves.
  files.remove(os.path.join(base, 'demo', 'load.js'))
  # Remove service_worker.js as well.  This executes in a different context.
  files.remove(os.path.join(base, 'demo', 'service_worker.js'))
  # Don't compile in the uncompiled require file.
  files.remove(os.path.join(base, 'demo', 'demo_uncompiled.js'))
  # Add lib/debug/asserts.js, which is required for goog.assert.
  # TODO: This file should be inside third_party/closure instead.
  files.add(os.path.join(base, 'lib', 'debug', 'asserts.js'))

  # Add in the generated externs, so that the demo compilation knows the
  # definitions of the library APIs.
  externs = ('shaka-player.ui.debug.externs.js' if is_debug
             else 'shaka-player.ui.externs.js')

  files.add(os.path.join(base, 'dist', externs))

  name = 'demo.compiled' + ('.debug' if is_debug else '')

  # TODO: Why do we always use debug_closure_opts?  Nobody remembers.
  closure_opts = build.common_closure_opts + build.debug_closure_opts
  closure_opts += [
      # Ignore missing goog.require since we assume the whole library is
      # already included.
      '--jscomp_off=missingRequire', '--jscomp_off=strictMissingRequire',
      '-D', 'COMPILED=true',
  ]

  closure = compiler.ClosureCompiler(files, name)
  # The output wrapper is only designed for the library.  It can't be used
  # for apps.  TODO: Should we add a simple function wrapper for apps?
  closure.add_wrapper = False
  if not closure.compile(closure_opts, force):
    return False

  return True


def compile_receiver(force, is_debug):
  """Compile the cast receiver application.

  Args:
    force: True to rebuild, False to ignore if no changes are detected.
    is_debug: True to compile for debugging, false for release.

  Returns:
    True on success, False on failure.
  """
  logging.info('Compiling the receiver app (%s)...',
               'debug' if is_debug else 'release')

  match = re.compile(r'.*\.js$')
  base = shakaBuildHelpers.get_source_base()
  def get(*path_components):
    return shakaBuildHelpers.get_all_files(
        os.path.join(base, *path_components), match)

  files = set(get('demo', 'common') +
              get('demo', 'cast_receiver') +
              get('externs') + get('ui', 'externs') +
              get('third_party', 'closure'))

  # Add in the generated externs, so that the receiver compilation knows the
  # definitions of the library APIs.
  externs = ('shaka-player.ui.debug.externs.js' if is_debug
             else 'shaka-player.ui.externs.js')

  files.add(os.path.join(base, 'dist', externs))
  files.add(os.path.join(base, 'lib', 'debug', 'asserts.js'))

  name = 'receiver.compiled' + ('.debug' if is_debug else '')

  # TODO: Why do we always use debug_closure_opts?  Nobody remembers.
  closure_opts = build.common_closure_opts + build.debug_closure_opts
  closure_opts += [
      # Ignore missing goog.require since we assume the whole library is
      # already included.
      '--jscomp_off=missingRequire', '--jscomp_off=strictMissingRequire',
      '-D', 'COMPILED=true',
  ]

  closure = compiler.ClosureCompiler(files, name)
  # The output wrapper is only designed for the library.  It can't be used
  # for apps.  TODO: Should we add a simple function wrapper for apps?
  closure.add_wrapper = False
  if not closure.compile(closure_opts, force):
    return False

  return True


def build_all(force, is_debug):
  if not compile_demo(force, is_debug):
    return False

  if not compile_receiver(force, is_debug):
    return False

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

  parsed_args = parser.parse_args(args)

  # Make the dist/ folder, ignore errors.
  base = shakaBuildHelpers.get_source_base()
  try:
    os.mkdir(os.path.join(base, 'dist'))
  except OSError:
    pass

  force = parsed_args.force

  # Update node modules if needed.
  if not shakaBuildHelpers.update_node_modules():
    return 1

  for is_debug in [True, False]:
    if not build_all(force, is_debug):
      return 1

  return 0


if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
