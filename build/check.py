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
  def get(arg):
    return shakaBuildHelpers.get_all_files(os.path.join(base, arg), match)
  return get('test') + get('lib') + get('externs') + get('demo')


def check_lint():
  """Runs the linter over the library files."""
  logging.info('Running Closure linter...')

  jsdoc3_tags = ','.join([
      'static', 'summary', 'namespace', 'event', 'description', 'property',
      'fires', 'listens', 'example', 'exportDoc', 'exportInterface',
      'tutorial'])
  args = ['--nobeep', '--custom_jsdoc_tags', jsdoc3_tags, '--strict']
  base = shakaBuildHelpers.get_source_base()
  cmd = os.path.join(base, 'third_party', 'gjslint', 'gjslint')

  # Even though this is python, don't import and execute since gjslint expects
  # command-line arguments using argv.  Have to explicitly execute python so
  # it works on Windows.
  cmd_line = [sys.executable or 'python', cmd] + args + get_lint_files()
  return shakaBuildHelpers.execute_get_code(cmd_line) == 0


def check_html_lint():
  """Runs the HTML linter over the HTML files.

  Returns:
    True on success, False on failure.
  """
  # Update node modules if needed.
  if not shakaBuildHelpers.update_node_modules():
    return False

  logging.info('Running htmlhint...')
  htmlhint_path = shakaBuildHelpers.get_node_binary_path('htmlhint')
  base = shakaBuildHelpers.get_source_base()
  files = ['index.html', 'demo/index.html', 'support.html']
  file_paths = [os.path.join(base, x) for x in files]
  config_path = os.path.join(base, '.htmlhintrc')
  cmd_line = [htmlhint_path, '--config=' + config_path] + file_paths
  return shakaBuildHelpers.execute_get_code(cmd_line) == 0


def check_complete():
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


def check_tests():
  """Runs an extra compile pass over the test code to check for type errors.

  Returns:
    True on success, False on failure.
  """
  logging.info('Checking the tests for type errors...')

  match = re.compile(r'.*\.js$')
  base = shakaBuildHelpers.get_source_base()
  def get(*args):
    return shakaBuildHelpers.get_all_files(os.path.join(base, *args), match)
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


def check_externs():
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


def usage():
  print 'Usage:', sys.argv[0]
  print
  print __doc__


def main(args):
  for arg in args:
    if arg == '--help':
      usage()
      return 0
    else:
      logging.error('Unknown option: %s', arg)
      usage()
      return 1

  steps = [
    check_lint,
    check_html_lint,
    check_complete,
    check_tests,
    check_externs,
  ]
  for step in steps:
    if not step():
      return 1
  return 0


if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
