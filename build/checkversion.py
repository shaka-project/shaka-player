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

"""Checks that all the versions match."""

import os
import re
import sys

import shakaBuildHelpers


def player_version():
  """Gets the version of the library from player.js."""
  path = os.path.join(shakaBuildHelpers.get_source_base(), 'lib', 'player.js')
  with open(path, 'r') as f:
    match = re.search(r'goog\.define\(\'GIT_VERSION\', \'(.*)\'\)', f.read())
    return match.group(1) if match else ''


def changelog_version():
  """Gets the version of the library from the CHANGELOG."""
  path = os.path.join(shakaBuildHelpers.get_source_base(), 'CHANGELOG.md')
  with open(path, 'r') as f:
    match = re.search(r'## (.*) \(', f.read())
    return match.group(1) if match else ''


def check_version(_):
  """Checks that all the versions in the library match."""
  changelog = changelog_version()
  player = player_version()
  git = shakaBuildHelpers.git_version()
  npm = shakaBuildHelpers.npm_version()

  print 'git version:', git
  print 'npm version:', npm
  print 'player version:', player
  print 'changelog version:', changelog

  ret = 0
  if 'dirty' in git:
    print >> sys.stderr, 'Git version is dirty.'
    ret = 1
  elif 'unknown' in git:
    print >> sys.stderr, 'Git version is not a tag.'
    ret = 1
  elif not re.match(r'^v[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9]+)?$', git):
    print >> sys.stderr, 'Git version is a malformed release version.'
    print >> sys.stderr, 'It should be a \'v\', followed by three numbers'
    print >> sys.stderr, 'separated by dots, optionally followed by a hyphen'
    print >> sys.stderr, 'and a pre-release identifier.  See http://semver.org/'
    ret = 1

  if 'v' + npm != git:
    print >> sys.stderr, 'NPM version does not match git version.'
    ret = 1
  if player != git + '-debug':
    print >> sys.stderr, 'Player version does not match git version.'
    ret = 1
  if 'v' + changelog != git:
    print >> sys.stderr, 'Changelog version does not match git version.'
    ret = 1

  return ret


if __name__ == '__main__':
  shakaBuildHelpers.run_main(check_version)
