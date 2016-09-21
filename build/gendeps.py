#!/usr/bin/python
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

"""Creates the Closure dependencies file required to run in uncompiled mode."""

import os
import subprocess
import sys

import shakaBuildHelpers


deps_args = [
    '--root_with_prefix=lib ../../../lib',
    '--root_with_prefix=third_party/closure ../../../third_party/closure'
]


def gen_deps(_):
  """Generates the uncompiled dependencies files."""
  print 'Generating Closure dependencies...'

  # Make the dist/ folder, ignore errors.
  base = shakaBuildHelpers.get_source_base()
  try:
    os.mkdir(os.path.join(base, 'dist'))
  except OSError:
    pass
  os.chdir(base)
  deps_writer = os.path.join('third_party', 'closure', 'deps', 'depswriter.py')

  try:
    cmd_line = [sys.executable or 'python', deps_writer] + deps_args
    shakaBuildHelpers.print_cmd_line(cmd_line)
    deps = subprocess.check_output(cmd_line)
    with open(os.path.join(base, 'dist', 'deps.js'), 'w') as f:
      f.write(deps)
    return 0
  except subprocess.CalledProcessError as e:
    return e.returncode


if __name__ == '__main__':
  shakaBuildHelpers.run_main(gen_deps)
