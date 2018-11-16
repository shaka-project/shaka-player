#!/usr/bin/env python
#
# Copyright 2018 Google Inc.  All Rights Reserved.
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

"""Generates Javascript to load localization data.

To generate code that will load your localization data into the localization
system you need to have your localization data in JSON format that follows the
format:
  {
    "aliases": {
      "BEST_WISHES": "ax32f",
      "MAY_YOUR_FORGE_BURN_BRIGHT": "by984",
      ...
    },
    "localizations": {
      "elfish-woodland": {
        "ax32f": "Merin sa haryalye alasse",
        ...
      },
      "dwarfish-north": {
        "by984": "tan menu selek lanun khun",
        ...
      },
      ...
    }
  }

For "aliases":
  - The key is the alias used to associate the use-case with the entry it
    should use.
  - The value is the translation id used to identify the text in the locale.

For "localizations":
  - The key is the locale code.
  - The value is a map of localization id to localized text.

For all values in "localizations":
  - The key should match a value in "aliases".
  - The value should be the localized text.

An input and an output are needed. If files are not provided for input and/or
output, std-in and std-out will be used.

Examples:
  Read from std-in and write to std-out:
    generate-locales.py
  Read from input file and write to std:
    generate-locales.py --source my-localizations.json
  Read from input file and write to output file:
    generate-locales.py --source my-localizations.json --output my_localizations.js
"""

from __future__ import print_function

import argparse
import codecs
import contextlib
import json
import string
import sys


_TAB_CHARACTER = '  '


def UsesConstantSyntax(value):
  """Check if |value| follows our style for JavaScript constants."""
  allowed_characters = set(string.ascii_uppercase + string.digits + '_')

  # This uses set difference to find any characters in |value| that don't appear
  # in |allowed_characters|.  Then it uses boolean logic to return True for an
  # empty set.
  return not set(value) - allowed_characters


def VerifyInputData(data):
  """Verifies all the localizations and IDs line-up.

  Returns:
    A list of (warning_id, args) where warning_id is a string identifier and
    args is a list of arguments for the warning.
  """
  alias_mapping = data['aliases']
  localizations = data['localizations']

  # Look for all the ids that are used across all locales. We will needs this
  # to ensure that we have at least one alias defined for each one.
  all_translation_ids = set()
  for entries in localizations.values():
    all_translation_ids.update(entries.keys())

  # Get the human readable aliases for each id.
  aliases = set(alias_mapping.keys())

  warnings = []

  # Check if the readable name for each id is JS-Constant compatible.
  for alias in aliases:
    if not UsesConstantSyntax(alias):
      warnings.append(('bad-alias', (alias,)))

  # Make sure that each translation id has an alias defined.
  aliases_ids = set(alias_mapping.values())
  for translation_id in all_translation_ids:
    if translation_id not in aliases_ids:
      warnings.append(('missing-alias', (translation_id,)))

  # Check if any locales are missing entries found in other locales.
  for locale, entries in localizations.items():
    for translation_id in all_translation_ids:
      if translation_id not in entries:
        warnings.append(('missing-localization', (locale, translation_id)))

  return warnings


class Doc(object):
  """A string builder class used to build out a tab-sensitive document."""

  def __init__(self):
    # All the lines that make-up this document.
    self._lines = []

    # Track each tab we need to insert ahead of the next line.
    self._tab_level = 0

  @contextlib.contextmanager
  def Block(self):
    """Starts a new tabbed block.

    This should be used with |with| to ensure that the block closes.
    """
    self._tab_level += 1
    yield
    self._tab_level -= 1

  def Code(self, block):
    """Insert a block of code with the current tab level.

    This will add the required leading white space to the line.
    """
    # Break the code block into each line of code
    lines = block.split('\n')

    for line in lines:
      # Right-strip the line to avoid trailing white space. We do this on the
      # full string so that tabbing will be removed if a blank line was added.
      new_line = (_TAB_CHARACTER * self._tab_level) + line
      self._lines.append(new_line.rstrip())

  def __str__(self):
    return '\n'.join(self._lines)


def AsQuotedString(input_string):
  """Convert |input_string| into a quoted string."""
  subs = [
      ('\n', '\\n'),
      ('\t', '\\t'),
      ("'", "\\'")
  ]

  # Go through each substitution and replace any occurrences.
  output_string = input_string
  for before, after in subs:
    output_string = output_string.replace(before, after)

  # Lastly wrap the string in quotes.
  return "'%s'" % output_string


def GenerateLocales(alias_mapping, localizations, class_name):
  """Generates JavaScript code to insert the localization data.

  This creates a function called "apply" in the class called |class_name| that,
  when called, will insert the data from |localizations|.

  Args:
    id_mappings: A map of string tag to a string JavaScript constant name.
    localizations: A map of string locale name to a map of string tag to the
      string localization.
    class_name: A string name of the class to put generated code into.

  Returns:
    A string containing the generated code.
  """
  doc = Doc()

  doc.Code("""/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
""")

  doc.Code("""
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
// This file is auto-generated. DO NOT EDIT THIS FILE. If you need to:
//   - change which locales are in this file, update "build/locales.json"
//   - change an entry for a specific locale, update "build/locales.json"
//   - change anything else, update "build/generate-locales.py".
//
// To regenerate this file, run "build/generate-locales.py".
// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
""")

  doc.Code("goog.provide('%s');" % class_name)
  doc.Code("goog.provide('%s.Ids');" % class_name)
  doc.Code("goog.require('shaka.ui.Localization');")

  doc.Code("""
/**
 * Insert all localization data for the UI into |localization|. This should be
 * done BEFORE any listeners are added to the localization system (to avoid
 * callbacks for each insert) and should be done BEFORE changing to the initial
 * preferred locale (reduces the work needed to update the internal state after
 * each insert).
 *
 * @param {!shaka.ui.Localization} localization
 */
""")

  doc.Code('%s.apply = function(localization) {' % class_name)

  # Go through the locales in sorted order so that we will be consistent between
  # runs.
  for locale in sorted(localizations.keys()):
    localization = localizations[locale]

    with doc.Block():
      quoted_locale = AsQuotedString(locale)
      doc.Code('localization.insert(%s, new Map([' % quoted_locale)

      with doc.Block():
        # Make sure that we sort by the localization keys so that they will
        # always be in the same order.
        for key, value in sorted(localization.items()):
          quoted_key = AsQuotedString(key)
          quoted_value = AsQuotedString(value)
          doc.Code('[%s, %s],' % (quoted_key, quoted_value))

      doc.Code(']));')  # Close the call to insert.

  doc.Code('};')  # Close the function.

  # Convert the map to an array with the key and value reversed so
  # that we can sort them based on the alias.
  constants = []
  for alias, translation_id in alias_mapping.items():
    constants.append((alias, translation_id))
  constants.sort()

  for alias, translation_id in constants:
    doc.Code('')  # Make sure we have a blank line before each constant.
    doc.Code('/** @const {string} */')
    doc.Code('%s.Ids.%s = %s;' % (class_name,
                                  alias,
                                  AsQuotedString(translation_id)))

  doc.Code('')  # Need blank line at the end of the file

  return doc


def CreateParser():
  """Create the argument parser for this application."""
  parser = argparse.ArgumentParser(
      description=__doc__,
      formatter_class=argparse.RawDescriptionHelpFormatter)

  parser.add_argument(
      '--source',
      dest='source',
      type=str,
      help='The file path for JSON input. (default: std in).')

  parser.add_argument(
      '--output',
      dest='output',
      type=str,
      help='The file path for JavaScript output (default: std out).')

  parser.add_argument(
      '--class-name',
      dest='class_name',
      type=str,
      help='The fully qualified class name for the JavaScript output',
      default='shaka.ui.Locales')

  return parser


def main(args):
  parser = CreateParser()
  args = parser.parse_args(args)

  if args.source:
    with open(args.source, 'r') as f:
      blob = json.load(f)
  else:
    if sys.stdin.isatty():
      sys.stderr.write('Reading input JSON from stdin...\n')
    blob = json.load(sys.stdin)

  for warning_id, warning_args in VerifyInputData(blob):
    sys.stderr.write('WARNING: %s %s\n' % (warning_id, warning_args))

  doc = GenerateLocales(blob['aliases'], blob['localizations'], args.class_name)

  if args.output:
    with codecs.open(args.output, 'w', 'utf-8') as f:
      f.write(unicode(doc))
  else:
    sys.stdout.write(unicode(doc))


if __name__ == '__main__':
  main(sys.argv[1:])
