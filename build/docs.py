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

"""Builds the documentation from the source code.

This deletes the old documentation first.
"""

import argparse
import logging
import os

import compiler
import shakaBuildHelpers


def main(args):
  """Builds the source code documentation."""
  logging.info('Building the docs...')

  parser = argparse.ArgumentParser(
      description=__doc__,
      formatter_class=argparse.RawDescriptionHelpFormatter)
  parser.add_argument(
      '--force',
      '-f',
      help='Force the docs to be built, even if no files have changed.',
      action='store_true')

  parsed_args = parser.parse_args(args)

  base = shakaBuildHelpers.get_source_base()
  config_path = os.path.join(base, 'docs', 'jsdoc.conf.json')
  jsdoc = compiler.Jsdoc(config_path)
  if not jsdoc.build(parsed_args.force):
    return 1
  return 0


if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
