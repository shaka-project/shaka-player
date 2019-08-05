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

import build
import compiler
import shakaBuildHelpers


def get_lint_files():
  """Returns the absolute paths to all the files to run the linter over."""
  match = re.compile(r'.*\.js$')
  base = shakaBuildHelpers.get_source_base()
  def get(*path_components):
    return shakaBuildHelpers.get_all_files(
        os.path.join(base, *path_components), match)
  return get('test') + get('lib') + get('externs') + get('demo') + get('ui')


def check_js_lint(args):
  """Runs the JavaScript linter."""
  # TODO: things not enforced: property doc requirements
  logging.info('Linting JavaScript...')

  base = shakaBuildHelpers.get_source_base()
  config_path = os.path.join(base, '.eslintrc.js')

  linter = compiler.Linter(get_lint_files(), config_path)
  return linter.lint(fix=args.fix, force=args.force)


def check_css_lint(args):
  """Runs the CSS linter."""
  logging.info('Linting CSS...')

  match = re.compile(r'.*\.(less|css)$')
  base = shakaBuildHelpers.get_source_base()
  def get(*path_components):
    return shakaBuildHelpers.get_all_files(
        os.path.join(base, *path_components), match)
  files = (get('ui') + get('demo'));
  config_path = os.path.join(base, '.csslintrc')

  linter = compiler.CssLinter(files, config_path)
  return linter.lint(fix=args.fix, force=args.force)


def check_html_lint(args):
  """Runs the HTML linter."""
  logging.info('Linting HTML...')

  base = shakaBuildHelpers.get_source_base()
  files = ['index.html', os.path.join('demo', 'index.html'), 'support.html']
  file_paths = [os.path.join(base, x) for x in files]
  config_path = os.path.join(base, '.htmlhintrc')

  htmllinter = compiler.HtmlLinter(file_paths, config_path)
  return htmllinter.lint(force=args.force)


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
  all_files = set()
  all_files.update(shakaBuildHelpers.get_all_files(os.path.join(base, 'lib'), match))
  all_files.update(shakaBuildHelpers.get_all_files(os.path.join(base, 'ui'), match))
  missing_files = all_files - complete.include

  if missing_files:
    logging.error('There are files missing from the complete build:')
    for missing in missing_files:
      # Convert to a path relative to source base.
      logging.error('  ' + os.path.relpath(missing, base))
    return False
  return True


def check_tests(args):
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
  files = set(get('lib') + get('externs') + get('test') + get('ui') +
              get('third_party', 'closure') +
              get('third_party', 'language-mapping-list'))
  files.add(os.path.join(base, 'demo', 'common', 'asset.js'))
  files.add(os.path.join(base, 'demo', 'common', 'assets.js'))

  localizations = compiler.GenerateLocalizations(None)
  localizations.generate(args.force)
  files.add(localizations.output)

  closure_opts = build.common_closure_opts + build.common_closure_defines
  closure_opts += build.debug_closure_opts + build.debug_closure_defines

  # Ignore missing goog.require since we assume the whole library is
  # already included.
  closure_opts += [
      '--jscomp_off=missingRequire', '--jscomp_off=strictMissingRequire',
      '--checks-only', '-O', 'SIMPLE'
  ]

  # Set up a build with the build name of "dummy".  With output_compiled_bundle
  # set to False, the build name is irrelevant, since we won't generate any
  # compiled output.
  closure = compiler.ClosureCompiler(files, 'dummy')
  closure.output_compiled_bundle = False
  # Instead of creating a compiled bundle, we will touch a timestamp file to
  # keep track of how recently we've run this check.
  closure.timestamp_file = os.path.join(base, 'dist', '.testcheckstamp')
  return closure.compile(closure_opts, args.force)


def main(args):
  parser = argparse.ArgumentParser(
      description=__doc__,
      formatter_class=argparse.RawDescriptionHelpFormatter)
  parser.add_argument(
      '--fix',
      help='Automatically fix style violations.',
      action='store_true')
  parser.add_argument(
      '--force',
      '-f',
      help='Force checks even if no files have changed.',
      action='store_true')

  parsed_args = parser.parse_args(args)

  # Update node modules if needed.
  if not shakaBuildHelpers.update_node_modules():
    return 1

  steps = [
      check_js_lint,
      check_html_lint,
      check_css_lint,
      check_complete,
      check_tests,
  ]
  for step in steps:
    if not step(parsed_args):
      return 1
  return 0


if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
