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

"""Update the screenshots in our layout tests based on the latest run."""

import os
import shutil

import shakaBuildHelpers


def main(args):
  base = shakaBuildHelpers.get_source_base()

  screenshotsFolder = os.path.join(
      base, 'test', 'test', 'assets', 'screenshots')
  imageSimilarityTool = os.path.join(
      base, 'build', 'imageSimilarity.js');

  for platform in os.listdir(screenshotsFolder):
    # This is a subfolder with actual screenshots.
    platformFolder = os.path.join(screenshotsFolder, platform)

    if not os.path.isdir(platformFolder):
      # Skip hidden files like .gitignore and non-folders
      continue

    for child in os.listdir(platformFolder):
      # If any args were specified, use them to filter.  Either the platform or
      # base of the filename must match the filter.
      if args and not platform in args and not child.split('.')[0] in args:
        continue

      fullPath = os.path.join(platformFolder, child)
      # If this has the "-new" suffix, it was just written by the layout tests.
      # Rename it to overwrite the "official" version, which is stored in
      # git-lfs.
      if fullPath.endswith('-new'):
        officialPath = fullPath[:-4]

        # Finally, check to see if the pixels have changed before updating it.
        # The png file itself can be slightly different byte-for-byte even when
        # the image is visibly the same, and the git repo history will carry
        # every revision forever, getting larger with each change.  So we only
        # want to update the image if the new one is _visibly_ different.  For
        # this, we use the same tools we use to measure screenshot differences
        # in Karma.
        if os.path.exists(officialPath):
          output = shakaBuildHelpers.execute_get_output([
              'node',
              imageSimilarityTool,
              officialPath,
              fullPath,
          ])
          similarity = float(output)
        else:
          # No original?  Then everything has changed!
          similarity = 0

        if similarity >= 0.95:
          # Similar enough to pass tests, so don't update the image.  This will
          # keep the git history from getting bigger for no reason.
          continue

        shutil.move(fullPath, officialPath)
        print('Updated: ' + officialPath)

  return 0


if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
