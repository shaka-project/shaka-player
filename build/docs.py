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

import logging
import os
import shutil
import sys

import shakaBuildHelpers


def build_docs(_):
  """Builds the source code documentation."""
  logging.info('Building the docs...')

  base = shakaBuildHelpers.get_source_base()
  shutil.rmtree(os.path.join(base, 'docs', 'api'), ignore_errors=True)
  os.chdir(base)

  jsdoc = shakaBuildHelpers.get_node_binary('jsdoc')
  cmd_line = jsdoc + ['-c', 'docs/jsdoc.conf.json']
  return shakaBuildHelpers.execute_get_code(cmd_line)


if __name__ == '__main__':
  shakaBuildHelpers.run_main(build_docs)
