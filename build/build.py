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

"""Creates a build from the given commands.  A command is either an addition or
a subtraction.  An addition is prefixed with a +; a subtraction is when
prefixed with a -.  After the character, there is a name of a file or a @ sign
and the name of a build file.

Build files are the files found in build/types.  These files are simply a
new-line separated list of commands to execute.  So if the "+@complete" command
is given, it will open the complete file and run it (which may in turn open
other build files).  Subtracting a build file will reverse all actions applied
by the given file.  So "-@networking" will remove all the networking plugins.

The core library is always included so does not have to be listed.  The default
is to use the name 'compiled'; if no commands are given, it will build the
complete build.

Examples:
  # Equivalent to +@complete
  build.py

  build.py +@complete
  build.py +@complete -@networking
  build.py --name custom +@manifests +@networking +../my_plugin.js"""

import os
import re
import shakaBuildHelpers
import shutil
import subprocess
import sys

closure_opts = [
  '--language_in', 'ECMASCRIPT5',
  '--language_out', 'ECMASCRIPT3',

  '--jscomp_error=*',

  # 'deprecatedAnnotations' controls complains about @expose, but the new
  # @nocollapse annotation does not do the same job for properties.
  # So since we can't use the new annotations, we have to ignore complaints
  # about the old one.
  '--jscomp_off=deprecatedAnnotations',

  # 'analyzerChecks' complains about countless instances of implicitly nullable
  # types, plus a few other issues.  Even the closure library doesn't pass
  # these checks, and the implicit nullability check in particular is over-
  # zealous and unhelpful.  So we disable the whole category of
  # 'analyzerChecks'.
  '--jscomp_off=analyzerChecks',

  '--extra_annotation_name=listens',
  '--extra_annotation_name=exportDoc',

  '--conformance_configs', '%s/build/conformance.textproto' % \
      shakaBuildHelpers.cygwinSafePath(shakaBuildHelpers.getSourceBase()),

  '-O', 'ADVANCED',
  '--generate_exports',
  '--output_wrapper_file=%s/build/wrapper.template.js' % \
      shakaBuildHelpers.cygwinSafePath(shakaBuildHelpers.getSourceBase()),

  '-D', 'COMPILED=true',
  '-D', 'goog.DEBUG=false',
  '-D', 'goog.STRICT_MODE_COMPATIBLE=true',
  '-D', 'goog.ENABLE_DEBUG_LOADER=false',
  '-D', 'goog.asserts.ENABLE_ASSERTS=false',
  '-D', 'shaka.log.MAX_LOG_LEVEL=0',
  '-D', 'GIT_VERSION="%s"' % shakaBuildHelpers.calculateVersion()
]

class Build:
  """Defines a build that has been parsed from a build file.  This has
  exclude files even though it will not be used at the top-level.  This allows
  combining builds.  A file will only exist in at most one set.

  Members:
    include - A set of files to include.
    exclude - A set of files to remove.
  """

  def __init__(self, include=None, exclude=None):
    self.include = include or set()
    self.exclude = exclude or set()

  def _getBuildFilePath(self, name, root):
    """Gets the full path to a build file, if it exists.  Returns None if not.

    Arguments:
      name - The string name to check.

    Returns:
      The full path to the build file.
    """
    sourceBase = shakaBuildHelpers.getSourceBase()
    localPath = os.path.join(root, name)
    buildPath = os.path.join(sourceBase, 'build', 'types', name)
    if (os.path.isfile(localPath) and os.path.isfile(buildPath)
        and localPath != buildPath):
      print >> sys.stderr, 'Build file "%s" is ambiguous' % name
      return None
    elif os.path.isfile(localPath):
      return localPath
    elif os.path.isfile(buildPath):
      return buildPath
    else:
      print >> sys.stderr, 'Build file not found: ' + name
      return None

  def _reverse(self):
    return Build(self.exclude, self.include)

  def _combine(self, other):
    includeAll = self.include | other.include
    excludeAll = self.exclude | other.exclude
    self.include = includeAll - excludeAll
    self.exclude = excludeAll - includeAll

  def _addCore(self):
    """Adds the core library."""
    # Add externs and closure dependencies.
    sourceBase = shakaBuildHelpers.getSourceBase()
    match = re.compile(r'.*\.js$')
    self.include = self.include | set(
        shakaBuildHelpers.getAllFiles(
            os.path.join(sourceBase, 'externs'), match) +
        shakaBuildHelpers.getAllFiles(
            os.path.join(sourceBase, 'third_party', 'closure'), match))

    # Check that there are no files in 'core' that are removed
    coreBuild = Build()
    coreBuild.parseBuild(['+@core'], os.getcwd())
    coreFiles = coreBuild.include
    if len(self.exclude & coreFiles) > 0:
      print >> sys.stderr, 'Cannot exclude files from core'
    self.include = self.include | coreFiles

  def parseBuild(self, lines, root):
    """Parses a Build object from the given lines of commands.  This will
    recursively read and parse builds.

    Arguments:
      lines - An array of strings defining commands.
      root - The full path to the base directory.

    Returns:
      True on success, False otherwise.
    """
    for line in lines:
      # Strip comments
      try:
        line = line[:line.index('#')]
      except ValueError:
        pass

      # Strip whitespace and ignore empty lines.
      line = line.strip()
      if not line:
        continue

      isNeg = False
      if line[0] == '+':
        line = line[1:].strip()
      elif line[0] == '-':
        isNeg = True
        line = line[1:].strip()
      else:
        print >> sys.stderr, 'Operation (+/-) required'
        return False

      if line[0] == '@':
        line = line[1:].strip()

        buildPath = self._getBuildFilePath(line, root)
        if not buildPath:
          return False
        lines = open(buildPath).readlines()
        subRoot = os.path.dirname(buildPath)

        # If this is a build file, then recurse and combine the builds.
        subBuild = Build()
        if not subBuild.parseBuild(lines, subRoot):
          return False

        if isNeg:
          self._combine(subBuild._reverse())
        else:
          self._combine(subBuild)
      else:
        if not os.path.isabs(line):
          line = os.path.abspath(os.path.join(root, line))
        if not os.path.isfile(line):
          print >> sys.stderr, 'Unable to find file ' + line
          return False

        if isNeg:
          self.include.discard(line)
          self.exclude.add(line)
        else:
          self.include.add(line)
          self.exclude.discard(line)

    return True

  def buildRaw(self, extra_opts):
    """Builds the files in |self.include| using the given extra Closure options.

    Arguments:
      extra_opts - An array of extra options to give to Closure.

    Returns:
      True on success; False on failure.
    """
    jar = os.path.join(shakaBuildHelpers.getSourceBase(),
        'third_party', 'closure', 'compiler.jar')
    jar = shakaBuildHelpers.cygwinSafePath(jar)
    files = map(shakaBuildHelpers.cygwinSafePath, list(self.include))

    try:
      cmdLine = ['java', '-jar', jar] + closure_opts + extra_opts + files
      shakaBuildHelpers.printCmdLine(cmdLine)
      subprocess.check_call(cmdLine)
      return True
    except subprocess.CalledProcessError:
      print >> sys.stderr, 'Build failed'
      return False

  def buildLibrary(self, name, rebuild):
    """Builds Shaka Player using the files in |self.include|.

    Arguments:
      name - The name of the build.
      rebuild - True to rebuild, False to ignore if no changes are detected.

    Returns:
      True on success; False on failure.
    """
    self._addCore()

    sourceBase = shakaBuildHelpers.getSourceBase()
    resultPrefix = shakaBuildHelpers.cygwinSafePath(
        os.path.join(sourceBase, 'dist', 'shaka-player.' + name))
    resultFile = resultPrefix + '.js'
    resultDebug = resultPrefix + '.debug.js'
    resultMap = resultPrefix + '.debug.map'

    # Detect changes to the library and only build if changes have been made.
    if not rebuild and os.path.isfile(resultFile):
      buildTime = os.path.getmtime(resultFile)
      completeBuild = Build()
      if completeBuild.parseBuild(['+@complete'], os.getcwd()):
        completeBuild._addCore()
        # Get a list of files modified since the build file was.
        editedFiles = filter(lambda x: os.path.getmtime(x) > buildTime,
                             completeBuild.include)
        if len(editedFiles) == 0:
          print 'No changes detected, not building.  Use --force to override.'
          return True

    opts = ['--create_source_map', resultMap, '--js_output_file', resultDebug,
            '--source_map_location_mapping', sourceBase + '|..']
    if not self.buildRaw(opts):
      return False

    shutil.copyfile(resultDebug, resultFile)

    # Add a special source-mapping comment so that Chrome and Firefox can map
    # line and character numbers from the compiled library back to the original
    # source locations.
    with open(resultDebug, 'a') as f:
      f.write('//# sourceMappingURL=shaka-player.' + name + '.debug.map')

    return True

def usage():
  print 'Usage:', sys.argv[0], """[options] [commands]

Options:
 --force          : Build the library even if no changes are detected.
 --help           : Prints this help page.
 --name           : Sets the name of the build, uses 'compiled' if not given.
"""
  print __doc__

def main(args):
  name = 'compiled'
  lines = []
  rebuild = False
  i = 0
  while i < len(args):
    if args[i] == '--name':
      i = i + 1
      if i == len(args):
        print >> sys.stderr, '--name requires an argument'
        return 1
      name = args[i]
    elif args[i] == '--force':
      rebuild = True
    elif args[i] == '--help':
      usage()
      return 0
    elif args[i].startswith('--'):
      print >> sys.stderr, 'Unknown option', args[i]
      usage()
      return 1
    else:
      lines.append(args[i])
    i = i + 1

  if len(lines) == 0:
    lines = ['+@complete']

  print 'Compiling the library...'
  customBuild = Build()
  if not customBuild.parseBuild(lines, os.getcwd()):
    return 1
  return 0 if customBuild.buildLibrary(name, rebuild) else 1

if __name__ == '__main__':
  shakaBuildHelpers.runMain(main)

