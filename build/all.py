#!/usr/bin/env python3
#
# Copyright 2016 Google LLC
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

"""Builds the dependencies, runs the checks, and compiles the library."""

import argparse

import concurrent.futures

import apps
import build
import check
import compiler
import docs
import gendeps
import generateLocalizations
import shakaBuildHelpers

import os
import re
import subprocess
import sys

def compile_less(path_name, main_file_name, parsed_args):
  match = re.compile(r'.*\.less$')
  base = shakaBuildHelpers.get_source_base()
  main_less_src = os.path.join(base, path_name, main_file_name + '.less')
  all_less_srcs = shakaBuildHelpers.get_all_files(
      os.path.join(base, path_name), match)
  output = os.path.join(base, 'dist', main_file_name + '.css')

  less = compiler.Less(main_less_src, all_less_srcs, output)
  return less.compile(parsed_args.force)

def run_task(task):
  """Run a build subprocess and stream its output live."""
  cmd, env = task

  proc = subprocess.Popen(
      cmd,
      env=env,
      stdout=subprocess.PIPE,
      stderr=subprocess.PIPE,
      text=True
  )

  # Build a readable prefix for logs
  try:
      name_index = cmd.index("--name") + 1
      name = cmd[name_index]
  except ValueError:
      name = "unknown"

  try:
      mode_index = cmd.index("--mode") + 1
      mode = cmd[mode_index]
  except ValueError:
      mode = "unknown"

  prefix = f"[build:{name}-{mode}]"

  # Stream stdout
  for line in proc.stdout:
      print(f"{prefix} {line}", end='')

  # Stream stderr
  for line in proc.stderr:
      # Do not mark INFO lines as errors
      if line.startswith("[INFO]"):
          print(f"{prefix} {line}", end='')
      else:
          print(f"{prefix} [ERR] {line}", end='')

  proc.wait()
  return proc.returncode, cmd, "", ""

def main(args):
  parser = argparse.ArgumentParser(
      description='User facing build script for building the Shaka'
                  ' Player Project.')

  parser.add_argument(
      '--locales',
      type=str,
      nargs='+',
      default=generateLocalizations.DEFAULT_LOCALES,
      help='The list of locales to compile in (default %(default)r)')

  parser.add_argument(
      '--fix',
      help='Automatically fix style violations.',
      action='store_true')

  parser.add_argument(
      '--force',
      '-f',
      help='Force building the library even if no files have changed.',
      action='store_true')

  parser.add_argument(
      '--debug',
      help='Limit which build types to build. Will at least build the debug '
           'version.',
      action='store_true')

  parser.add_argument(
      '--release',
      help='Limit which build types to build. Will at least build the '
           'release version.',
      action='store_true')

  parser.add_argument(
     '--only-es5',
      help='If set, only compile ECMASCRIPT5 builds.',
      action='store_true',
      default=False)

  parser.add_argument(
      '--jobs', '-j',
      type=int,
      default=(os.cpu_count() or 1),
      help='Number of parallel builds (defaults to number of CPUs).')

  parsed_args = parser.parse_args(args)

  # Make the dist/ folder, ignore errors.
  base = shakaBuildHelpers.get_source_base()
  try:
    os.mkdir(os.path.join(base, 'dist'))
  except OSError:
    pass

  # Generate localizations before running gendeps, so the output is available
  # to the deps system.
  # TODO(#1858): It might be time to look at a third-party build system.
  localizations = compiler.GenerateLocalizations(parsed_args.locales)
  if not localizations.generate(parsed_args.force):
    return 1

  if gendeps.main([]) != 0:
    return 1

  check_args = []
  if parsed_args.fix:
    check_args += ['--fix']
  if parsed_args.force:
    check_args += ['--force']
  if check.main(check_args) != 0:
    return 1

  docs_args = []
  if parsed_args.force:
    docs_args += ['--force']
  if docs.main(docs_args) != 0:
    return 1

  if not compile_less('ui', 'controls', parsed_args):
    return 1;
  if not compile_less('demo', 'demo', parsed_args):
    return 1

  complete_non_experimental = ['+@complete', '-@msf']

  build_args_experimental = ['--name', 'experimental', '+@complete']
  build_args_experimental += ['--locales'] + parsed_args.locales
  build_args_with_ui = ['--name', 'ui', *complete_non_experimental]
  build_args_with_ui += ['--locales'] + parsed_args.locales
  build_args_without_ui = [
    '--name', 'compiled', *complete_non_experimental, '-@ui', '-@polyfillForUI',
  ]
  build_args_only_dash_without_ui = [
    '--name', 'dash',
    *complete_non_experimental, '-@ui', '-@polyfillForUI', '-@queue',
    '-@hls', '-@transmuxer', '-@offline', '-@cast', '-@optionalText', '-@ads',
  ]
  build_args_only_hls_without_ui = [
    '--name', 'hls',
    *complete_non_experimental, '-@ui', '-@polyfillForUI', '-@queue',
    '-@dash', '-@offline', '-@cast', '-@optionalText', '-@ads',
  ]

  if parsed_args.force:
    build_args_experimental += ['--force']
    build_args_with_ui += ['--force']
    build_args_without_ui += ['--force']
    build_args_only_dash_without_ui += ['--force']
    build_args_only_hls_without_ui += ['--force']

  # Create the list of build modes to build with. If the list is empty
  # by the end, then populate it with every mode.
  modes = []
  modes += ['debug'] if parsed_args.debug else []
  modes += ['release'] if parsed_args.release else []

  # If --debug or --release are not given, build with everything.
  if not modes:
    modes += ['debug', 'release']

  builds = [
    build_args_experimental,
    build_args_with_ui,
    build_args_without_ui,
    build_args_only_dash_without_ui,
    build_args_only_hls_without_ui,
  ]

  if parsed_args.only_es5:
    language_variants = [
      ('ECMASCRIPT5', ''),
    ]
  else:
    language_variants = [
      ('ECMASCRIPT5', ''),
      ('ECMASCRIPT_2021', 'es2021'),
    ]

  # Run library builds in parallel per mode.
  for mode in modes:
    tasks = []

    for lang_out, suffix in language_variants:
      for build_args in builds:
        args = list(build_args)
        # If the build has a --name, append a suffix (e.g., -es2021) for clarity.
        if '--name' in args and suffix:
          idx = args.index('--name')
          original_name = args[idx + 1]
          args[idx + 1] = f"{original_name}-{suffix}"
        # Add language and mode flags.
        args += ['--langout', lang_out]
        args += ['--mode', mode]

        # Prepare environment and command for a separate process.
        env = os.environ.copy()
        cmd = [sys.executable, os.path.join(base, 'build', 'build.py')] + args
        tasks.append((cmd, env))

    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, parsed_args.jobs)) as executor:
      for rc, cmd, out, err in executor.map(run_task, tasks):
        if rc != 0:
          failures.append((rc, cmd, out, err))

    if failures:
      # Print the first failure for quick diagnosis and abort.
      rc, cmd, out, err = failures[0]
      print("ERROR running build:", cmd)
      print("STDOUT:\n", out)
      print("STDERR:\n", err, file=sys.stderr)
      return 1

    # Build the demo/apps once per mode, after all library builds succeed.
    is_debug = mode == 'debug'
    if not apps.build_all(parsed_args.force, is_debug):
      return 1

  return 0

if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
