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

"""Builds the dependencies, runs the checks, and compiles the library."""

import build
import check
import gendeps
import shakaBuildHelpers


def main(args):
  code = gendeps.gen_deps([])
  if code != 0:
    return code

  code = check.main([])
  if code != 0:
    return code

  build_args = ['--name', 'compiled', '+@complete']

  if '--force' in args:
    build_args.append('--force')

  return build.main(build_args)

if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
