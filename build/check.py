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

"""This is used to validate that the library is correct.

This checks:
 * All files in lib/ appear when compiling +@complete
 * Runs a compiler pass over the test code to check for type errors
 * Run the linter to check for style violations."""

import build
import os
import re
import shakaBuildHelpers
import subprocess
import sys

def getLintFiles():
  """Returns an array of absolute paths to all the files to run the linter
  over.
  """
  match = re.compile(r'.*\.js$')
  base = shakaBuildHelpers.getSourceBase()
  def get(arg):
    return shakaBuildHelpers.getAllFiles(os.path.join(base, arg), match)
  return get('test') + get('lib') + get('externs') + get('demo')

def checkLint():
  """Runs the linter over the library files."""
  print 'Running Closure linter...'

  jsdoc3_tags = ','.join([
      'static', 'summary', 'namespace', 'event', 'description', 'property',
      'fires', 'listens', 'example', 'exportDoc'])
  args = ['--nobeep', '--custom_jsdoc_tags', jsdoc3_tags, '--strict']
  base = shakaBuildHelpers.getSourceBase()
  cmd = os.path.join(base, 'third_party', 'gjslint', 'gjslint')

  # Even though this is python, don't import and execute since gjslint expects
  # command-line arguments using argv.  Have to explicitly execute python so
  # it works on Windows.
  cmdLine = ['python', cmd] + args + getLintFiles()
  shakaBuildHelpers.printCmdLine(cmdLine)
  return (subprocess.call(cmdLine) == 0)

def checkHtmlLint():
  """Runs the HTML linter over the HTML files.
  Skipped if htmlhint is not available.
  """
  htmlhint_path = shakaBuildHelpers.getNodeBinaryPath('htmlhint')
  if not os.path.exists(htmlhint_path):
    return True
  print 'Running htmlhint...'

  base = shakaBuildHelpers.getSourceBase()
  files = ['index.html', 'demo/index.html', 'support.html']
  file_paths = [os.path.join(base, x) for x in files]
  cmdLine = [htmlhint_path] + file_paths
  shakaBuildHelpers.printCmdLine(cmdLine)
  return (subprocess.call(cmdLine) == 0)

def checkComplete():
  """Checks whether the 'complete' build references every file.  This is used
  by the build script to ensure that every file is included in at least one
  build type.

  Returns:
    True on success, False on failure.
  """
  print 'Checking that the build files are complete...'

  complete = build.Build()
  # Normally we don't need to include @core, but because we look at the build
  # object directly, we need to include it here.  When using main(), it will
  # call addCore which will ensure core is included.
  if not complete.parseBuild(['+@complete', '+@core'], os.getcwd()):
    print >> sys.stderr, 'Error parsing complete build'
    return False

  match = re.compile(r'.*\.js$')
  base = shakaBuildHelpers.getSourceBase()
  allFiles = shakaBuildHelpers.getAllFiles(os.path.join(base, 'lib'), match)
  missingFiles = set(allFiles) - complete.include

  if len(missingFiles) > 0:
    print >> sys.stderr, 'There are files missing from the complete build:'
    for missing in missingFiles:
      # Convert to a path relative to source base.
      print >> sys.stderr, '  ' + os.path.relpath(missing, base)
    return False
  return True

def checkTests():
  """Runs an extra compile pass over the test code to check for type errors.

  Returns:
    True on success, False on failure.
  """
  print 'Checking the tests for type errors...'

  match = re.compile(r'.*\.js$')
  base = shakaBuildHelpers.getSourceBase()
  def get(*args):
    return shakaBuildHelpers.getAllFiles(os.path.join(base, *args), match)
  files = (get('lib') + get('externs') + get('test') + get('demo') +
      get('third_party', 'closure'))
  testBuild = build.Build(set(files))

  # Ignore missing goog.require since we assume the whole library is
  # already included.
  opts = ['--jscomp_off=missingRequire', '--checks-only', '-O', 'SIMPLE']
  return testBuild.buildRaw(opts)

def usage():
  print 'Usage:', sys.argv[0]
  print
  print __doc__

def main(args):
  for arg in args:
    if arg == '--help':
      usage()
      return 0
    else:
      print >> sys.stderr, 'Unknown option', arg
      usage()
      return 1

  if not checkLint():
    return 1
  elif not checkHtmlLint():
    return 1
  elif not checkComplete():
    return 1
  elif not checkTests():
    return 1
  else:
    return 0

if __name__ == '__main__':
  shakaBuildHelpers.runMain(main)

