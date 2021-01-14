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


class _HandleMixedListsAction(argparse.Action):
  '''Action to handle comma-separated and space-separated lists.

     When input can be given as a comma-separated list or a space-
     separated list, default actions and types don't work. For example
     if you had |'a,b,c' 'd'| you can get |['a,b,c', 'd']| or
     |[['a','b','c'], 'd']|.

     This action will expand the comma-separated lists and merge then with
     the space separated lists so you will get |['a', 'b', 'c', 'd']|.
  '''

  def __call__(self, parser, namespace, new_values, option_string=None):
    merged = getattr(namespace, self.dest) or []
    for value in new_values:
      merged += value.split(',')
    setattr(namespace, self.dest, merged)


class _HandleKeyValuePairs(argparse.Action):
  '''Action to handle key-value pairs and convert to a dictionary.

     Input is a key-value pair separated by '='.
     These keys and values are stored in a dictionary which can accumulate
     multiple values from the command-line.
  '''

  def __call__(self, parser, namespace, new_argument, option_string=None):
    merged = getattr(namespace, self.dest) or {}
    key, value = new_argument.split('=', 1)
    merged[key] = value
    setattr(namespace, self.dest, merged)


def _IntGreaterThanZero(x):
  i = int(x)
  if i <= 0:
    raise argparse.ArgumentTypeError('%s is not greater than zero' % x)
  return i


def _GetDefaultBrowsers():
  """Use the platform name to get which browsers can be tested."""

  if shakaBuildHelpers.is_linux():
    # For MP4 support on Linux Firefox, install gstreamer1.0-libav.
    # Opera on Linux only supports MP4 for Ubuntu 15.04+, so it is not in the
    # default list of browsers for Linux at this time.
    return ['Chrome','Firefox']

  if shakaBuildHelpers.is_darwin():
    return ['Chrome','Firefox','Safari']

  if shakaBuildHelpers.is_windows() or shakaBuildHelpers.is_cygwin():
    return ['Chrome','Firefox','IE']

  raise Error('Unrecognized system: %s' % platform.uname()[0])


class Launcher:
  """A stateful object for parsing arguments and running Karma commands.

     A launcher that holds the state of parsing arguments and builds and
     executes the resulting Karma command. The process is split into sections so
     that other scripts can inject their own logic between calls.

     For example:
       l = Launcher('Launch Karma tests')
       l.parser.add_argument('custom_flag')
       l.ParseArguments(args)
       l.ResolveBrowsers(['Chrome'])
       if l.parsed_args.custom_flag:
         do_custom_logic
      l.RunCommand(karma_conf_path)
  """

  def __init__(self, description):
    self.karma_config = {}
    self.parsed_args = None
    self.parser = argparse.ArgumentParser(
        description=description,
        formatter_class=argparse.RawDescriptionHelpFormatter)

    running_commands = self.parser.add_argument_group(
        'Running',
        'These commands affect how tests are ran.')
    logging_commands = self.parser.add_argument_group(
        'Logging',
        'These commands affect what gets logged and how the logs will appear.')
    networking_commands = self.parser.add_argument_group(
        'Networking',
        'These commands affect how Karma works over a network.')
    pre_launch_commands = self.parser.add_argument_group(
        'Pre-Launch',
        'These commands are handled before the tests start running.')


    running_commands.add_argument(
        '--browsers',
        help='Specify which browsers to run tests on as a space-separated or '
             'comma-separated list. Use "--browsers help" to see a list of '
             'available browsers on this platform.',
        action=_HandleMixedListsAction,
        nargs='+')
    running_commands.add_argument(
        '--exclude-browsers',
        help='Browsers to skip as a comma-separated or space-separated list.',
        action=_HandleMixedListsAction,
        nargs='+')
    running_commands.add_argument(
        '--no-browsers',
        help='Instead of Karma starting browsers, Karma will wait for a '
             'browser to connect to it.',
        action='store_true')
    running_commands.add_argument(
        '--single-run',
        help='Run the test when browsers capture and exit.',
        dest='single_run',
        action='store_true',
        default=True)
    running_commands.add_argument(
        '--no-single-run',
        help='Do not shut down Karma when tests are complete.',
        dest='single_run',
        action='store_false')
    running_commands.add_argument(
        '--random',
        help='Run the tests in a random order. This can be used with --seed '
             'to control the random order. If used without --seed, a seed '
             'will be generated.',
        action='store_true')
    running_commands.add_argument(
        '--seed',
        help='Set the seed that will be used by --random. If used without '
             '--random, this will have no effect.',
        type=int)
    running_commands.add_argument(
        '--filter',
        help='Specify a regular expression to limit which tests run.',
        type=str,
        dest='filter')
    running_commands.add_argument(
        '--use-xvfb',
        help='Run tests without opening browser windows. Requires Linux '
             'and xvfb.',
        action='store_true')
    running_commands.add_argument(
        '--quick',
        help='Skip integration tests.',
        action='store_true')
    running_commands.add_argument(
        '--external',
        help='Run tests that require external resources. This will require a '
             'fast connection to the open internet.',
        action='store_true')
    running_commands.add_argument(
        '--drm',
        help='Run tests that require DRM.',
        action='store_true')
    running_commands.add_argument(
        '--quarantined',
        help='Run tests that have been quarantined.',
        action='store_true')
    running_commands.add_argument(
        '--runs',
        help='Set the number of times each test should run. (default '
             '%(default)s) ',
        type=_IntGreaterThanZero,
        default=1,
        dest='runs')
    running_commands.add_argument(
        '--uncompiled',
        help='Use the uncompiled source code when running the tests. This can be '
             'used to make debugging easier.',
        action='store_true')
    running_commands.add_argument(
        '--auto-watch',
        help='Auto watch source files and run on change.',
        dest='auto_watch',
        action='store_true',
        default=False)
    running_commands.add_argument(
        '--no-auto-watch',
        help='Do not watch source files',
        dest='auto_watch',
        action='store_false')
    running_commands.add_argument(
        '--capture-timeout',
        help='Kill the browser if it does not capture in the given time [ms]. '
             '(default %(default)s)',
        type=int,
        default=60000)
    running_commands.add_argument(
        '--delay-tests',
        help='Insert an artificial delay between tests, in seconds. '
             'This can be helpful when tracking down asynchronous test '
             'pollution, in which an async process belonging to one test may '
             'trigger a failure after other tests have begun. '
             '(default %(const)s)',
        type=int,
        default=None,
        const=2,
        nargs='?')
    running_commands.add_argument(
        '--test-custom-asset',
        help='Run asset playback tests on a custom manifest URI.',
        type=str,
        default=None)
    running_commands.add_argument(
        '--test-custom-license-server',
        help='Configure license servers for the custom asset playback test. '
             'May be specified multiple times to configure multiple key '
             'systems.',
        type=str,
        metavar='KEY_SYSTEM_ID=LICENSE_SERVER_URI',
        action=_HandleKeyValuePairs)
    running_commands.add_argument(
        '--test-timeout',
        help='Sets the test timeout value [ms] (default %(default)s)',
        dest='test_timeout',
        default=120000,
        type=int)


    logging_commands.add_argument(
        '--colors',
        help='Use colors when reporting and printing logs.',
        action='store_true',
        dest='colors',
        default=True)
    logging_commands.add_argument(
        '--no-colors',
        help='Do not use colors when reporting or printing logs',
        action='store_false',
        dest='colors')
    logging_commands.add_argument(
        '--log-level',
        help='Set the type of log messages that Karma will print.',
        choices=['disable', 'error', 'warn', 'info', 'debug'],
        default='error')
    logging_commands.add_argument(
        '--html-coverage-report',
        help='Generate HTML-formatted code coverage reports in the "coverage" '
             'folder.',
        action='store_true')
    logging_commands.add_argument(
        '--enable-logging',
        help='Print log messages from tests and limits the type of log '
             'messages printed. If --enable-logging is not given, no logs '
             'will be printed.  (default %(const)s)',
        choices=['none', 'error', 'warning', 'info', 'debug', 'v1', 'v2'],
        default='none',
        const='info',
        dest='logging',
        nargs='?')
    logging_commands.add_argument(
        '--reporters',
        help='Specify which reporters to use as a space-separated or '
             'comma-separated list. Possible options are dots, progress, junit, '
             'growl, or coverage.',
        action=_HandleMixedListsAction,
        nargs='+')
    logging_commands.add_argument(
        '--report-slower-than',
        help='Report tests that are slower than the given time [ms].',
        type=int)


    networking_commands.add_argument(
       '--port',
        help='Port where the server is running.',
        type=int)
    networking_commands.add_argument(
        '--hostname',
        help='Specify the hostname to be used when capturing browsers. This '
             'defaults to localhost.',
        default='localhost')


    pre_launch_commands.add_argument(
        '--force',
        help='Force a rebuild of the project before running tests. This will '
             'have no effect if --no-build is set.',
        action='store_true')
    pre_launch_commands.add_argument(
        '--no-build',
        help='Skip building the project before running tests.',
        action='store_false',
        dest='build',
        default=True)
    pre_launch_commands.add_argument(
        '--print-command',
        help='Print the command passed to Karma before passing it to Karma.',
        action='store_true')


  def ParseArguments(self, args):
    """Parse the given arguments.

       Uses the parser definition to parse |args| and populates
       |self.karma_config|.
    """

    self.parsed_args = self.parser.parse_args(args)
    self.karma_config = {}

    pass_through = [
      'auto_watch',
      'capture_timeout',
      'colors',
      'drm',
      'external',
      'filter',
      'hostname',
      'html_coverage_report',
      'log_level',
      'logging',
      'port',
      'quarantined',
      'quick',
      'random',
      'report_slower_than',
      'seed',
      'single_run',
      'uncompiled',
      'delay_tests',
      'test_custom_asset',
      'test_custom_license_server',
      'test_timeout',
    ]

    # Check each value before setting it to avoid passing null values.
    for name in pass_through:
      value = getattr(self.parsed_args, name, None)
      if value is not None:
        self.karma_config[name] = value

    if self.parsed_args.reporters:
      self.karma_config['reporters'] = self.parsed_args.reporters

  def ResolveBrowsers(self, default_browsers):
    """Decide what browsers we should use.

       This is separate from ParseArguments so that other tools can insert
       additional logic to derive a browser list from the parsed arguments.
    """
    assert(default_browsers and len(default_browsers))

    if self.parsed_args.no_browsers:
      logging.warning('In this mode browsers must manually connect to karma.')
    elif self.parsed_args.browsers:
      self.karma_config['browsers'] = self.parsed_args.browsers
    else:
      logging.warning('Using default browsers: %s', default_browsers)
      self.karma_config['browsers'] = default_browsers

    # Check if there are any browsers that we should remove
    if self.parsed_args.exclude_browsers and 'browsers' in self.karma_config:
      all_browsers = set(self.karma_config['browsers'])
      bad_browsers = set(self.parsed_args.exclude_browsers)
      if bad_browsers - all_browsers:
        raise RuntimeError('Attempting to exclude unselected browsers: %s' %
                           ','.join(bad_browsers - all_browsers))

      good_browsers = all_browsers - bad_browsers
      self.karma_config['browsers'] = list(good_browsers)

  def RunCommand(self, karma_conf):
    """Build a command and send it to Karma for execution.

       Uses |self.parsed_args| and |self.karma_config| to build and run a Karma
       command.
    """
    if self.parsed_args.use_xvfb and not shakaBuildHelpers.is_linux():
      logging.error('xvfb can only be used on Linux')
      return 1

    if not shakaBuildHelpers.update_node_modules():
      logging.error('Failed to update node modules')
      return 1

    karma = shakaBuildHelpers.get_node_binary('karma')
    cmd = ['xvfb-run', '--auto-servernum'] if self.parsed_args.use_xvfb else []
    cmd += karma + ['start']
    cmd += [karma_conf] if karma_conf else []
    cmd += ['--settings', json.dumps(self.karma_config)]

    # There is no need to print a status here as the gendep and build
    # calls will print their own status updates.
    if self.parsed_args.build:
      if gendeps.main([]) != 0:
        logging.error('Failed to generate project dependencies')
        return 1

      if build.main(['--force'] if self.parsed_args.force else []) != 0:
        logging.error('Failed to build project')
        return 1

    # Before Running the command, print the command.
    if self.parsed_args.print_command:
      logging.info('Karma Run Command')
      logging.info('%s', cmd)

    # Run the command.
    results = []
    for run in range(self.parsed_args.runs):
      logging.info('Running test (%d / %d, %d failed so far)...',
          run + 1, self.parsed_args.runs, len(results) - results.count(0))
      results.append(shakaBuildHelpers.execute_get_code(cmd))

    # Print a summary of the results.
    if self.parsed_args.runs > 1:
      logging.info('All runs completed. %d / %d runs passed.',
                   results.count(0),
                   len(results))
      logging.info('Results (exit code): %r', results)
    else:
      logging.info('Run complete')
      logging.info('Result (exit code): %d', results[0])

    return 0 if all(result == 0 for result in results) else 1


def Run(args):
  launcher = Launcher('Shaka Player Test Runner Script')
  launcher.ParseArguments(args)
  launcher.ResolveBrowsers(_GetDefaultBrowsers())
  return launcher.RunCommand(None)


def main(args):
  return Run(args)


if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
