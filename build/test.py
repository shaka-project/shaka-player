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

"""Runs unit and integrations tests on the library."""

import argparse
import json
import logging
import platform

import build
import gendeps
import shakaBuildHelpers

def int_greater_than_zero(x):
  i = int(x)
  if i <= 0:
    raise argparse.ArgumentTypeError('%s is not greater than zero' % x)
  return i

parser = argparse.ArgumentParser(description='Shaka Player Test Runner Script')

standard_karma_commands = parser.add_argument_group(
    'Standard Karma Commands',
    'These commands are standard Karma commands that will be passed directly '
        'to Karma.')
custom_karma_commands = parser.add_argument_group(
    'Custom Karma Commands',
    'These commands are custom Karma commands that will be passed to Karma '
        'and handled by karma.conf.js.')
launcher_commands = parser.add_argument_group(
    'Launcher Commands',
    'These commands are handled by this script.')

standard_karma_commands.add_argument(
    '--auto-watch',
    help='Auto watch source files and run on change.',
    action='store_true')
standard_karma_commands.add_argument(
    '--capture-timeout',
    help='Kill the browser if it does not capture in the given time [ms].',
    type=int)
standard_karma_commands.add_argument(
    '--colors',
    '--colours',
    help='Use colors when reporting and printing logs.',
    action='store_true',
    dest='colors')
standard_karma_commands.add_argument(
    '--log-level',
    help='Set the type of log messages that Karma will print.',
    choices=['disable', 'error', 'warn', 'info', 'debug'],
    default='error')
standard_karma_commands.add_argument(
    '--no-auto-watch',
    help='Do not watch source files',
    action='store_true')
standard_karma_commands.add_argument(
    '--no-colors',
    '--no-colours',
    help='Do not use colors when reporting or printing logs',
    action='store_true',
    dest='no_colors')
standard_karma_commands.add_argument(
    '--no-single-run',
    help='Disable single-run',
    action='store_true')
standard_karma_commands.add_argument(
   '--port',
    help='Port where the server is running.',
    type=int)
standard_karma_commands.add_argument(
    '--report-slower-than',
    help='Report tests that are slower than the given time [ms].',
    type=int)
standard_karma_commands.add_argument(
    '--single-run',
    help='Run the test when browsers capture and exit.',
    action='store_true')
custom_karma_commands.add_argument(
    '--reporters',
    help='Specify which reporters to use as a space-separated or '
         'comma-separated list. Possible options are dots, progress, junit, '
         'growl, or coverage.',
    nargs='+')
custom_karma_commands.add_argument(
    '--html-coverage-report',
    help='Generate HTML-formatted code coverage reports in the "coverage" '
         'folder.',
    action='store_true')
custom_karma_commands.add_argument(
    '--quick',
    help='Skip integration tests.',
    action='store_true')
custom_karma_commands.add_argument(
    '--enable-logging',
    help='Print log messages from tests and limits the type of log messages '
         'printed. If no value is given "info" will be used. If '
         '--endable-logging is not used, logging will default to "none".',
    choices=['none', 'error', 'warning', 'info', 'debug', 'v1', 'v2'],
    default='none',
    const='info',
    dest='logging',
    nargs='?')
custom_karma_commands.add_argument(
    '--external',
    help='Run tests that require external resources. This will require a fast '
         'connection to the open internet.',
    action='store_true')
custom_karma_commands.add_argument(
    '--drm',
    help='Run tests that require DRM.',
    action='store_true')
custom_karma_commands.add_argument(
    '--quarantined',
    help='Run tests that have been quarantined.',
    action='store_true')
custom_karma_commands.add_argument(
    '--uncompiled',
    help='Use the uncompiled source code when running the tests. This can be '
         'used to make debugging easier.',
    action='store_true')
custom_karma_commands.add_argument(
    '--random',
    help='Run the tests in a random order. This can be used with --seed '
         'to control the random order. If used without --seed, a seed '
         'will be generated.',
    action='store_true')
custom_karma_commands.add_argument(
    '--seed',
    help='Set the seed that will be used by --random. If used without '
         '--random, this will have no effect.',
    type=int)
custom_karma_commands.add_argument(
    '-f',
    '--filter',
    help='Specify a regular expression to limit which tests run.',
    type=str,
    dest='filter')
custom_karma_commands.add_argument(
    '-b',
    '--browsers',
    help='Specify which browsers to run tests on as a space-separated or '
         'comma-separated list.',
    type=str,
    dest='browsers',
    nargs='+')
custom_karma_commands.add_argument(
    '--no-browsers',
    help='Instread of Karma starting browsers, Karma will wait for a browser'
         ' to connect to it.',
    action='store_true')
launcher_commands.add_argument(
    '--use-xvfb',
    help='Run tests without opening browser windows. Requires Linux and xvfb.',
    action='store_true')
launcher_commands.add_argument(
    '--force',
    help='Force a rebuild of the project before running tests. This will have'
         ' no effect if --no-build is set.',
    action='store_true')
launcher_commands.add_argument(
    '--no-build',
    help='Skip building the project before running tests.',
    action='store_false',
    dest='build')
launcher_commands.add_argument(
    '-r',
    '--runs',
    help='Set the number of times each test should run. The default is 1.',
    type=int_greater_than_zero,
    default=1,
    dest='runs')
launcher_commands.add_argument(
    '--print-command',
    help='Print the command passed to Karma before passing it to Karma.',
    action='store_true')


# This is a list of all arguments/flags that can be sent to the Karma start
# command.` This list is a subset of the arguments given when running
# |karma start --help|. Because of how argparse works, all '-' must be replaced
# with '_' here and will need to be changed back when building the command.
karma_flags = [
  'auto_watch',
  'colors',
  'no_auto_watch',
  'no_colors',
  'no_single_run',
  'single_run',
]

karma_args = [
  'capture_timeout',
  'log_level',
  'port',
  'report_slower_than',
]

# This is a list of all arguments that can be sent directly to Karma with no
# special handling at this layer. Make sure that the names here are the
# dest names and not the argument names.
custom_karma_args = [
  'drm',
  'external',
  'filter',
  'html_coverage_report',
  'logging',
  'quarantined',
  'quick',
  'random',
  'seed',
  'uncompiled',
]

# Uses the platform name to configure which browsers will be tested.
def get_browsers():
  if shakaBuildHelpers.is_linux():
    # For MP4 support on Linux Firefox, install gstreamer1.0-libav.
    # Opera on Linux only supports MP4 for Ubuntu 15.04+, so it is not in the
    # default list of browsers for Linux at this time.
    return 'Chrome,Firefox'

  if shakaBuildHelpers.is_darwin():
    return 'Chrome,Firefox,Safari'

  if shakaBuildHelpers.is_windows() or shakaBuildHelpers.is_cygwin():
    return 'Chrome,Firefox,IE'

  raise Error('Unrecognized system: %s' % platform.uname()[0])


def run_tests(args):
  config = parser.parse_args(args)
  config_vars = vars(config)

  if config.use_xvfb and not shakaBuildHelpers.is_linux():
    raise Error('xvfb can only be used on Linux')

  if not shakaBuildHelpers.update_node_modules():
    raise Error('Failed to update node modules')

  # There is no need to print a status here as the gendep and build
  # calls will print their own status updates.
  if config.build:
    if gendeps.gen_deps([]) != 0:
      raise Error('Failed to generate project dependencies')

    if build.main(['--force'] if config.force else []) != 0:
      raise Error('Failed to build project')

  karma_settings = {}

  # Move all karma arguments from our config to the karma config
  for arg in custom_karma_args:
    karma_settings[arg] = config_vars[arg]

  if config.reporters:
    # Because we want to support both comma-separated and lists, convert it
    # into comma separated string and then split - it is easier this way.
    karma_settings['reporters'] = ','.join(config.reporters).split(',')

  karma_path = shakaBuildHelpers.get_node_binary_path('karma')

  # Build the run command.
  run_cmd = []
  if config.use_xvfb:
    run_cmd += ['xvfb-run', '--auto-servernum']

  run_cmd += [karma_path, 'start', '--fail-on-empty-test-suite']

  if config.no_browsers:
    logging.warning('In this mode browsers must manually connect to karma.')
  elif config.browsers:
    run_cmd += ['--browsers', ','.join(config.browsers)]
  else:
    run_cmd += ['--browsers', get_browsers()]

  def var_to_flag(var):
      return '--%s' % var.replace('_', '-')

  run_cmd += [var_to_flag(f) for f in karma_flags if config_vars[f]]

  for arg in [a for a in karma_args if config_vars[a]]:
    run_cmd += [var_to_flag(arg), '%s' % config_vars[arg]]

  run_cmd += ['--settings', json.dumps(karma_settings)]

  # Before Running the command, print the config.
  if config.print_command:
    logging.info('Karma Run Command')
    logging.info('%s', run_cmd)

  # Run the command.
  results = []
  for run in range(config.runs):
    logging.info('Running test (%d / %d)...', run + 1, config.runs)
    results.append(shakaBuildHelpers.execute_get_code(run_cmd))

  # Print a summary of the results.
  if config.runs > 1:
    logging.info('All runs completed %d passed out of %d total runs.', results.count(0), len(results))
    logging.info('Results (exit code): %r', results)
    return 1 if all(result == 0 for result in results) else 0

  else:
    logging.info('Run complete')
    logging.info('Result (exit code): %d', results[0])
    return results[0]


if __name__ == '__main__':
  shakaBuildHelpers.run_main(run_tests)
