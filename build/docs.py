#!/usr/bin/python
#
# Copyright 2016 Google Inc.
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

"""Builds the documentation from the source code.  This deletes the old
documentation first.
"""

import os
import shakaBuildHelpers
import shutil
import subprocess
import sys

def buildDocs(_):
  print 'Building the docs...'

  base = shakaBuildHelpers.getSourceBase()
  shutil.rmtree(os.path.join(base, 'docs', 'api'), ignore_errors=True)
  os.chdir(base)

  if shakaBuildHelpers.isWindows() or shakaBuildHelpers.isCygwin():
    # Windows has a different command name.  The Unix version does not seem to
    # work on Cygwin, but the windows one does.
    jsdoc = os.path.join('third_party', 'jsdoc', 'jsdoc.cmd')
  else:
    jsdoc = os.path.join('third_party', 'jsdoc', 'jsdoc')

  cmdLine = [jsdoc, '-c', 'docs/jsdoc.conf.json', '-R', 'docs/api-mainpage.md']
  shakaBuildHelpers.printCmdLine(cmdLine)
  return subprocess.call(cmdLine)

if __name__ == '__main__':
  shakaBuildHelpers.runMain(buildDocs)
