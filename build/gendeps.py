#!/usr/bin/env python
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

"""Creates the Closure dependencies file required to run in uncompiled mode."""

import logging
import os
import subprocess
import sys

import shakaBuildHelpers


def main(_):
  """Generates the uncompiled dependencies files."""
  # Update node modules if needed.
  if not shakaBuildHelpers.update_node_modules():
    return 1

  logging.info('Generating Closure dependencies...')

  # Make the dist/ folder, ignore errors.
  base = shakaBuildHelpers.get_source_base()
  try:
    os.mkdir(os.path.join(base, 'dist'))
  except OSError:
    pass
  os.chdir(base)

  make_deps = shakaBuildHelpers.get_node_binary(
      'google-closure-deps', 'closure-make-deps')

  try:
    cmd_line = make_deps + [
      # Folders to search for sources using goog.require/goog.provide
      '-r', 'demo', 'lib', 'ui', 'third_party',
      # Individual files to add to those
      '-f', 'dist/locales.js',
      # The path to the folder containing the Closure library's base.js
      '--closure-path', 'node_modules/google-closure-library/closure/goog',
    ]
    deps = shakaBuildHelpers.execute_get_output(cmd_line)
    with open(os.path.join(base, 'dist', 'deps.js'), 'wb') as f:
      f.write(deps)
    return 0
  except subprocess.CalledProcessError as e:
    return e.returncode


if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
