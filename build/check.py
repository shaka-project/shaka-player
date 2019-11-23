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
import ast
import logging
import os
import re

import build
import compiler
import shakaBuildHelpers


_CHECKS = []

def _Check(name):
  """A decorator for checks."""
  def decorator(func):
    _CHECKS.append((name, func))
    return func
  return decorator

def complete_build_files():
  """Returns a complete set of build files."""
  complete = build.Build()
  # Normally we don't need to include @core, but because we look at the build
  # object directly, we need to include it here.  When using main(), it will
  # call addCore which will ensure core is included.
  if not complete.parse_build(['+@complete', '+@core'], os.getcwd()):
    logging.error('Error parsing complete build')
    return False
  return complete.include

def get_lint_files():
  """Returns the absolute paths to all the files to run the linter over."""
  match = re.compile(r'.*\.js$')
  base = shakaBuildHelpers.get_source_base()
  def get(*path_components):
    return shakaBuildHelpers.get_all_files(
        os.path.join(base, *path_components), match)
  main_sources = (get('test') + get('lib') + get('externs') + get('demo') +
      get('ui') + get('build'))
  main_sources.remove(os.path.join(base, 'build', 'wrapper.template.js'))
  tool_sources = [
      os.path.join(base, '.eslintrc.js'),
      os.path.join(base, 'docs', 'jsdoc-plugin.js'),
      os.path.join(base, 'karma.conf.js'),
  ]
  return main_sources + tool_sources


@_Check('js_lint')
def check_js_lint(args):
  """Runs the JavaScript linter."""
  # TODO: things not enforced: property doc requirements
  logging.info('Linting JavaScript...')

  base = shakaBuildHelpers.get_source_base()
  config_path = os.path.join(base, '.eslintrc.js')

  linter = compiler.Linter(get_lint_files(), config_path)
  return linter.lint(fix=args.fix, force=args.force)


@_Check('css_lint')
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


@_Check('html_lint')
def check_html_lint(args):
  """Runs the HTML linter."""
  logging.info('Linting HTML...')

  base = shakaBuildHelpers.get_source_base()
  files = ['index.html', os.path.join('demo', 'index.html'), 'support.html']
  file_paths = [os.path.join(base, x) for x in files]
  config_path = os.path.join(base, '.htmlhintrc')

  htmllinter = compiler.HtmlLinter(file_paths, config_path)
  return htmllinter.lint(force=args.force)


@_Check('complete')
def check_complete(_):
  """Checks whether the 'complete' build references every file.

  This is used by the build script to ensure that every file is included in at
  least one build type.

  Returns:
    True on success, False on failure.
  """
  logging.info('Checking that the build files are complete...')

  complete_build = complete_build_files()
  if not complete_build:
    return False

  match = re.compile(r'.*\.js$')
  base = shakaBuildHelpers.get_source_base()
  all_files = set()
  all_files.update(shakaBuildHelpers.get_all_files(
      os.path.join(base, 'lib'), match))
  all_files.update(shakaBuildHelpers.get_all_files(
      os.path.join(base, 'ui'), match))
  missing_files = all_files - complete_build

  if missing_files:
    logging.error('There are files missing from the complete build:')
    for missing in missing_files:
      # Convert to a path relative to source base.
      logging.error('  ' + os.path.relpath(missing, base))
    return False
  return True


@_Check('spelling')
def check_spelling(_):
  """Checks that source files don't have any common misspellings."""
  logging.info('Checking for common misspellings...')

  complete_build = complete_build_files()
  if not complete_build:
    return False

  base = shakaBuildHelpers.get_source_base()
  complete_build.update(shakaBuildHelpers.get_all_files(
      os.path.join(base, 'test'), re.compile(r'.*\.js$')))
  complete_build.update(shakaBuildHelpers.get_all_files(
      os.path.join(base, 'demo'), re.compile(r'.*\.js$')))
  complete_build.update(shakaBuildHelpers.get_all_files(
      os.path.join(base, 'build'), re.compile(r'.*\.(js|py)$')))

  with shakaBuildHelpers.open_file(
      os.path.join(base, 'build', 'misspellings.txt')) as f:
    misspellings = ast.literal_eval(f.read())
  has_error = False
  for path in complete_build:
    with shakaBuildHelpers.open_file(path) as f:
      for i, line in enumerate(f):
        for regex, replace_pattern in misspellings.items():
          for match in re.finditer(regex, line):
            repl = match.expand(replace_pattern)
            if match.group(0).lower() == repl:
              continue  # No-op suggestion

            if not has_error:
              logging.error('The following file(s) have misspellings:')
            logging.error(
                '  %s:%d:%d: Did you mean %r?' %
                (os.path.relpath(path, base), i + 1, match.start() + 1, repl))
            has_error = True

  return not has_error


@_Check('eslint_disable')
def check_eslint_disable(_):
  """Checks that source files correctly use "eslint-disable".

  - Rules are disabled/enabled in nested blocks.
  - Rules are not disabled multiple times.
  - Rules are enabled again by the end of the file.

  Returns:
    True on success, False on failure.
  """
  logging.info('Checking correct usage of eslint-disable...')

  complete_build = complete_build_files()
  if not complete_build:
    return False

  base = shakaBuildHelpers.get_source_base()
  complete_build.update(shakaBuildHelpers.get_all_files(
      os.path.join(base, 'test'), re.compile(r'.*\.js$')))
  complete_build.update(shakaBuildHelpers.get_all_files(
      os.path.join(base, 'demo'), re.compile(r'.*\.js$')))

  has_error = False
  for path in complete_build:
    # The stack of rules that are disabled.
    disabled = []

    with shakaBuildHelpers.open_file(path, 'r') as f:
      rel_path = os.path.relpath(path, base)
      for i, line in enumerate(f):
        match = re.match(r'^\s*/\* eslint-(disable|enable) ([\w-]*) \*/$', line)
        if match:
          if match.group(1) == 'disable':
            # |line| disables a rule; validate it isn't already disabled.
            if match.group(2) in disabled:
              logging.error('%s:%d Rule %r already disabled',
                            rel_path, i + 1, match.group(2))
              has_error = True
            else:
              disabled.append(match.group(2))
          else:
            # |line| enabled a rule; validate it's already disabled and it's
            # enabled in the correct order.
            if not disabled or match.group(2) not in disabled:
              logging.error("%s:%d Rule %r isn't disabled",
                            rel_path, i + 1, match.group(2))
              has_error = True
            elif disabled[-1] != match.group(2):
              logging.error('%s:%d Rule %r enabled out of order',
                            rel_path, i + 1, match.group(2))
              has_error = True
              disabled = [x for x in disabled if x != match.group(2)]
            else:
              disabled = disabled[:-1]
        else:
          # |line| is not a normal eslint-disable or eslint-enable line.  Verify
          # we don't have this text elsewhere where eslint will ignore it.
          if re.search(r'eslint-(disable|enable)(?!-(next-)?line)', line):
            logging.error('%s:%d Invalid eslint-disable',
                          rel_path, i + 1)
            has_error = True

      for rule in disabled:
        logging.error('%s:%d Rule %r still disabled at end of file',
                      rel_path, i + 1, rule)
        has_error = True

  return not has_error


@_Check('test_type')
def check_tests(args):
  """Runs an extra compile pass over the test code to check for type errors.

  Returns:
    True on success, False on failure.
  """
  logging.info('Checking the tests for type errors...')

  complete_build = complete_build_files()
  if not complete_build:
    return False

  match = re.compile(r'.*\.js$')
  base = shakaBuildHelpers.get_source_base()
  def get(*path_components):
    return shakaBuildHelpers.get_all_files(
        os.path.join(base, *path_components), match)

  files = complete_build
  files.update(set(get('externs') + get('test') +
                   get('third_party', 'closure')))
  files.add(os.path.join(base, 'demo', 'common', 'asset.js'))
  files.add(os.path.join(base, 'demo', 'common', 'assets.js'))
  files.add(os.path.join(base, 'demo', 'common', 'message_ids.js'))

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
  parser.add_argument(
      '--filter',
      metavar='CHECK',
      nargs='+',
      choices=[i[0] for i in _CHECKS],
      help='Run only the given checks (choices: %(choices)s).')

  parsed_args = parser.parse_args(args)

  # Update node modules if needed.
  if not shakaBuildHelpers.update_node_modules():
    return 1

  for name, step in _CHECKS:
    if not parsed_args.filter or name in parsed_args.filter:
      if not step(parsed_args):
        return 1
  return 0


if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
