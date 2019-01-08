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

"""This is used to validate that the library is correct.

This checks:
 * All files in lib/ appear when compiling +@complete
 * Runs a compiler pass over the test code to check for type errors
 * Run the linter to check for style violations.
"""

import argparse
import logging
import os
import re
import sys

import build
import shakaBuildHelpers


def get_lint_files():
  """Returns the absolute paths to all the files to run the linter over."""
  match = re.compile(r'.*\.js$')
  base = shakaBuildHelpers.get_source_base()
  def get(*path_components):
    return shakaBuildHelpers.get_all_files(
        os.path.join(base, *path_components), match)
  return get('test') + get('lib') + get('externs') + get('demo')


def check_js_lint(args):
  """Runs the JavaScript linter."""
  # TODO: things not enforced: property doc requirements
  logging.info('Running eslint...')

  eslint = shakaBuildHelpers.get_node_binary('eslint')
  cmd_line = eslint + get_lint_files()
  if args.fix:
    cmd_line += ['--fix']
  return shakaBuildHelpers.execute_get_code(cmd_line) == 0


def check_html_lint(_):
  """Runs the HTML linter over the HTML files.

  Returns:
    True on success, False on failure.
  """
  logging.info('Running htmlhint...')
  htmlhint = shakaBuildHelpers.get_node_binary('htmlhint')
  base = shakaBuildHelpers.get_source_base()
  files = ['index.html', os.path.join('demo', 'index.html'), 'support.html']
  file_paths = [os.path.join(base, x) for x in files]
  config_path = os.path.join(base, '.htmlhintrc')
  cmd_line = htmlhint + ['--config=' + config_path] + file_paths
  return shakaBuildHelpers.execute_get_code(cmd_line) == 0


def check_complete(_):
  """Checks whether the 'complete' build references every file.

  This is used by the build script to ensure that every file is included in at
  least one build type.

  Returns:
    True on success, False on failure.
  """
  logging.info('Checking that the build files are complete...')

  complete = build.Build()
  # Normally we don't need to include @core, but because we look at the build
  # object directly, we need to include it here.  When using main(), it will
  # call addCore which will ensure core is included.
  if not complete.parse_build(['+@complete', '+@core'], os.getcwd()):
    logging.error('Error parsing complete build')
    return False

  match = re.compile(r'.*\.js$')
  base = shakaBuildHelpers.get_source_base()
  all_files = shakaBuildHelpers.get_all_files(os.path.join(base, 'lib'), match)
  missing_files = set(all_files) - complete.include

  if missing_files:
    logging.error('There are files missing from the complete build:')
    for missing in missing_files:
      # Convert to a path relative to source base.
      logging.error('  ' + os.path.relpath(missing, base))
    return False
  return True


def check_tests(_):
  """Runs an extra compile pass over the test code to check for type errors.

  Returns:
    True on success, False on failure.
  """
  logging.info('Checking the tests for type errors...')

  match = re.compile(r'.*\.js$')
  base = shakaBuildHelpers.get_source_base()
  def get(*path_components):
    return shakaBuildHelpers.get_all_files(
        os.path.join(base, *path_components), match)
  files = set(get('lib') + get('externs') + get('test') +
              get('third_party', 'closure'))
  files.add(os.path.join(base, 'demo', 'common', 'assets.js'))
  test_build = build.Build(files)

  closure_opts = build.common_closure_opts + build.common_closure_defines
  closure_opts += build.debug_closure_opts + build.debug_closure_defines

  # Ignore missing goog.require since we assume the whole library is
  # already included.
  closure_opts += [
      '--jscomp_off=missingRequire', '--jscomp_off=strictMissingRequire',
      '--checks-only', '-O', 'SIMPLE'
  ]
  return test_build.build_raw(closure_opts)


def check_externs(_):
  """Runs an extra compile pass over the generated externs to ensure that they
  are usable.

  Returns:
    True on success, False on failure.
  """
  logging.info('Checking the usability of generated externs...')

  # Create a complete "build" object.
  externs_build = build.Build()
  if not externs_build.parse_build(['+@complete'], os.getcwd()):
    return False
  externs_build.add_core()

  # Use it to generate externs for the next check.
  if not externs_build.generate_externs('check'):
    return False

  # Create a custom "build" object, add all manually-written externs, then add
  # the generated externs we just generated.
  source_base = shakaBuildHelpers.get_source_base()
  manual_externs = shakaBuildHelpers.get_all_files(
      os.path.join(source_base, 'externs'), re.compile(r'.*\.js$'))
  generated_externs = os.path.join(
      source_base, 'dist', 'shaka-player.check.externs.js')

  check_build = build.Build()
  check_build.include = set(manual_externs)
  check_build.include.add(generated_externs)

  # Build with the complete set of externs, but without any application code.
  # This will help find issues in the generated externs, independent of the app.
  # Since we have no app, don't use the defines.  Unused defines cause a
  # compilation error.
  closure_opts = build.common_closure_opts + build.debug_closure_opts + [
      '--checks-only', '-O', 'SIMPLE'
  ]
  ok = check_build.build_raw(closure_opts)

  # Clean up the temporary externs we just generated.
  os.unlink(generated_externs)

  # Return the success/failure of the build above.
  return ok


def main(args):
  parser = argparse.ArgumentParser(
      description=__doc__,
      formatter_class=argparse.RawDescriptionHelpFormatter)
  parser.add_argument('--fix',
                      help='Automatically fix style violations.',
                      action='store_true')

  parsed_args = parser.parse_args(args)

  # Update node modules if needed.
  if not shakaBuildHelpers.update_node_modules():
    return 1

  steps = [
      check_js_lint,
      check_html_lint,
      check_complete,
      check_tests,
      check_externs,
  ]
  for step in steps:
    if not step(parsed_args):
      return 1
  return 0


if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
