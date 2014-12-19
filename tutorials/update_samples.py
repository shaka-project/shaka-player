#!/usr/bin/python
#
# Copyright 2014 Google Inc.
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
"""Updates samples in HTML files.

The samples are maintained in .txt files by name.  These samples are escaped
and inserted into <code> tags whose id attribute matches the sample name.

Samples are also diffed against the previous sample.  If a sample is similar
to the previous one, it is marked up to highlight the new information.

Run this script any time you update sample text.
"""

import difflib
import os
import re
import sys


def html_escape(contents):
  """Escape HTML entities in the contents."""
  contents = contents.replace('&', '&amp;')
  contents = contents.replace('<', '&lt;')
  contents = contents.replace('>', '&gt;')
  return contents


def regex_escape(contents):
  """Escape regex special characters in the contents."""
  contents = contents.replace('\\', '\\\\')
  return contents


def mark_up_changes(old, new):
  """Mark up new text with highlights to show changes since the old text."""
  old = old.split('\n')
  new = new.split('\n')
  d = difflib.unified_diff(old, new, n=1000000, lineterm='')
  output = []
  num_highlights = 0
  headers_done = False

  for chunk in d:
    # Skip headers.
    if not headers_done:
      if chunk[0:2] == '@@':
        headers_done = True
      continue

    prefix = chunk[0]
    data = chunk[1:]

    # Skip things unique to the old contents.
    if prefix == '-':
      continue

    # Mark up things unique to the new contents.
    if prefix == '+':
      data = '<span class="newCode">' + data + '</span>'
      num_highlights += 1

    output.append(data)

  change_ratio = float(num_highlights) / len(output)
  if change_ratio < 0.8:
    # The contents have not changed too much.  Return highlighted text.
    return '\n'.join(output)

  # Too much has changed.  Return the new text without extra markup.
  return '\n'.join(new)


def get_sample_names(contents):
  """Extract sample names from the contents."""
  for m in re.finditer(r'<code id="(.*?)"', contents):
    yield m.group(1)


def update_samples(parent_dir, html_path):
  """Update all samples in an HTML file."""
  html_path = os.path.join(parent_dir, html_path)
  contents = file(html_path).read()

  previous_contents = ''
  for name in get_sample_names(contents):
    print 'Updating %s in %s' % (name, html_path)
    sample_path = os.path.join(parent_dir, name + '.txt')
    sample_contents = html_escape(file(sample_path).read())
    marked_up_contents = mark_up_changes(previous_contents, sample_contents)
    previous_contents = sample_contents
    contents = re.sub(r'(<code id="%s">).*?(</code>)' % name,
                      r'\1%s\2' % regex_escape(marked_up_contents), contents,
                      flags=re.DOTALL)

  file(html_path, 'w').write(contents)


if __name__ == '__main__':
  script_path = os.path.dirname(__file__)
  print 'Searching for HTML files in %s' % script_path
  # Find all html files in the same folder as this script and update them.
  for path in os.listdir(script_path):
    if os.path.splitext(path)[1] != '.html':
      continue
    update_samples(script_path, path)
  sys.exit(0)

