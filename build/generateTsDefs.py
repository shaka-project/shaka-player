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

"""Generates TypeScript defs from Closure externs.

This uses the Clutz tool from https://github.com/angular/clutz and then performs
additional transformations to make the generated defs independent of Clutz.
"""

import argparse
import os
import re
import sys

import shakaBuildHelpers


def GenerateTsDefs(inputs, output):
  """Generates TypeScript defs from Closure externs.

  Args:
    inputs: A list of paths to Closure extern files.
    output: A path to a TypeScript def output file.
  """
  clutz = shakaBuildHelpers.get_node_binary('@teppeis/clutz', 'clutz')

  command = clutz + [
      '--closure_env', 'BROWSER',
      '--externs',
  ] + inputs + [
      '-o', '-',
  ]

  # Get the output of Clutz, then transform it to make it independent of Clutz
  # and usable directly in TypeScript projects.
  contents = shakaBuildHelpers.execute_get_output(command)

  # Remove the prefix clutz puts on all namespaces
  contents = contents.replace(b'\xe0\xb2\xa0_\xe0\xb2\xa0.clutz.', b'') # Linux
  contents = contents.replace(b'\xe0\xb2\xa0_\xe0\xb2\xa0.clutz ', b'shakaExterns ') # Linux
  contents = contents.replace(b'?_?.clutz.', b'') # Windows
  contents = contents.replace(b'?_?.clutz ', b'shakaExterns ') # Windows
  # Replace "GlobalObject" (from Clutz) with TypeScript-native "object".
  contents = re.sub(br'\bGlobalObject\b', b'object', contents)
  # Remove "Global" from Clutz's Global{Date,Element,Event,EventTarget} and use
  # their original definitions instead.
  contents = re.sub(
      br'\bGlobal(Date|Element|Event|EventTarget)\b', br'\1', contents)
  # Remove "protected", which appears on some fields, and is only supported on
  # methods.
  contents = re.sub(br'^\s*protected ', b'', contents, flags=re.MULTILINE)
  # Clutz really likes EventTargets, so it wants IAdManager to extend it twice.
  contents = contents.replace(
      b'extends EventTarget extends EventTarget',
      b'extends EventTarget')
  # Some types allow you to return a Promise or nothing, but the Clutz output of
  # "Promise | null | undefined" doesn't work in TypeScript.  We need to use
  # "Promise | void" instead.
  contents = contents.replace(b'| null | undefined', b'| void')
  # shaka.util.Error extends Error and implements shaka.extern.Error, but this
  # confuses TypeScript when both are called "Error" in context of the namespace
  # declaration for "shaka.util".  Therefore we need to declare this
  # "GlobalError" type, which is already referenced by Clutz but never defined.
  global_error_def = b'declare class GlobalError extends Error {}\n\n'
  contents = global_error_def + contents
  # There are some types that implement multiple interfaces, such as IReleasable
  # and Iteratable.  Also, there are tools used inside Google that (for some
  # reason) want to convert TS defs _BACK_ into Closure Compiler externs.  When
  # that happens, these multiple implementors generate externs with broken
  # @implements annotations.  Since this team can't control that process or
  # those tools, we need to adjust our TS defs instead.  In these particular
  # cases, thankfully, we can just remove the reference to the IReleasable
  # interface, which is not needed outside the library.
  # TODO: This only covers one very specific pattern, and could be brittle.
  contents = contents.replace(
      b'implements shaka.util.IReleasable , ', b'implements ')
  # Finally, Clutz includes a bunch of basic defs for a browser environment
  # generated from Closure compiler's builtins.  Remove these.
  sections = re.split(br'\n(?=// Generated from .*)', contents)
  sections = filter(
      lambda s: not s.startswith(b'// Generated from externs.zip'),
      sections)
  contents = b'\n'.join(sections) + b'\n'

  moduleDeclaration = b"""
declare module \'shaka-player\' {
  export = shaka;
}
"""

  license_header_path = os.path.join(
      shakaBuildHelpers.get_source_base(), 'build/license-header')

  with open(license_header_path, 'rb') as f:
    license_header = f.read()

  with open(output, 'wb') as f:
    f.write(license_header)
    f.write(moduleDeclaration)
    f.write(b'\n')
    f.write(contents)


def CreateParser():
  """Create the argument parser for this application."""
  base = shakaBuildHelpers.get_source_base()

  parser = argparse.ArgumentParser(
      description=__doc__,
      formatter_class=argparse.RawDescriptionHelpFormatter)

  parser.add_argument(
      '--output',
      type=str,
      help='The file path for TypeScripts defs output')

  parser.add_argument(
      'input',
      type=str,
      nargs='+',
      help='The Closure extern files to be converted to TypeScript defs')

  return parser


def main(args):
  parser = CreateParser()
  args = parser.parse_args(args)
  GenerateTsDefs(args.input, args.output)
  return 0


if __name__ == '__main__':
  main(sys.argv[1:])
