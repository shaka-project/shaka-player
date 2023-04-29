#!/usr/bin/env python3

# Shaka Player Version Index Generator
# Copyright 2022 Google LLC
# SPDX-License-Identifier: Apache-2.0

# Generate an index of Shaka Player versions on appspot.

import collections
import jinja2
import json
import os
import re
import subprocess

DEMO_URL_TEMPLATE = 'https://{0}-dot-shaka-player-demo.appspot.com/'

# In Google Hosted Libraries
HOSTED_URL_TEMPLATE = 'https://ajax.googleapis.com/ajax/libs/shaka-player/{0}/shaka-player.{1}'

# Before Google Hosted Libraries, v1 appspot URLs
V1_URL_TEMPLATE = 'https://{0}-dot-shaka-player-demo.appspot.com/shaka-player.{1}'
# Before Google Hosted Libraries, v2 appspot URLs
V2_URL_TEMPLATE = 'https://{0}-dot-shaka-player-demo.appspot.com/dist/shaka-player.{1}'

# Global list of deployed appspot versions, initialized in generate().
DEPLOYED_APPSPOT_VERSIONS = []

def tag_to_appspot_version(tag):
  return tag.replace('.', '-')

def version_to_demo_url(v):
  appspot_version = tag_to_appspot_version(v)

  if appspot_version in DEPLOYED_APPSPOT_VERSIONS:
    return DEMO_URL_TEMPLATE.format(appspot_version)
  else:
    return None

def version_to_lib_url(v):
  appspot_version = tag_to_appspot_version(v)

  if v == 'nightly':
    return V2_URL_TEMPLATE.format(v, 'compiled.js')
  elif (version_key(v) == version_key('v1.6.5') or
        version_key(v) >= version_key('v2.0.6')):
    return HOSTED_URL_TEMPLATE.format(v.replace('v', ''), 'compiled.js')
  elif appspot_version in DEPLOYED_APPSPOT_VERSIONS:
    if version_key(v) >= version_key('v2.0.0-beta'):
      return V2_URL_TEMPLATE.format(appspot_version, 'compiled.js')
    else:
      return V1_URL_TEMPLATE.format(appspot_version, 'compiled.js')
  else:
    return None

def version_to_ui_lib_url(v):
  if v == 'nightly':
    return V2_URL_TEMPLATE.format(v, 'ui.js')
  elif version_key(v) >= version_key('v2.5.0'):
    return HOSTED_URL_TEMPLATE.format(v.replace('v', ''), 'ui.js')
  else:
    return None

def version_to_lib_externs_url(v):
  if v == 'nightly':
    return V2_URL_TEMPLATE.format(v, 'compiled.externs.js')
  elif version_key(v) >= version_key('v2.0.6'):
    return HOSTED_URL_TEMPLATE.format(v.replace('v', ''), 'compiled.externs.js')
  else:
    return None

def version_to_ui_lib_externs_url(v):
  if v == 'nightly':
    return V2_URL_TEMPLATE.format(v, 'ui.externs.js')
  elif version_key(v) >= version_key('v2.5.0'):
    return HOSTED_URL_TEMPLATE.format(v.replace('v', ''), 'ui.externs.js')
  else:
    return None

def version_to_lib_defs_url(v):
  if v == 'nightly':
    return V2_URL_TEMPLATE.format(v, 'compiled.d.ts')
  elif version_key(v) >= version_key('v3.0.6'):
    return HOSTED_URL_TEMPLATE.format(v.replace('v', ''), 'compiled.d.ts')
  else:
    return None

def version_to_ui_lib_defs_url(v):
  if v == 'nightly':
    return V2_URL_TEMPLATE.format(v, 'ui.d.ts')
  elif version_key(v) >= version_key('v3.0.6'):
    return HOSTED_URL_TEMPLATE.format(v.replace('v', ''), 'ui.d.ts')
  else:
    return None

def version_to_metadata(v):
  return {
    'version': v,
    'best': False,  # Corrected later in another loop
    'demo': version_to_demo_url(v),
    'lib': version_to_lib_url(v),
    'ui_lib': version_to_ui_lib_url(v),
    'lib_externs': version_to_lib_externs_url(v),
    'ui_lib_externs': version_to_ui_lib_externs_url(v),
    'lib_defs': version_to_lib_defs_url(v),
    'ui_lib_defs': version_to_ui_lib_defs_url(v),
  }

def is_release_tag(name):
  matches = re.match(r'v\d+\.\d+\.\d+(-.+)?', name)
  # Doesn't match, not a version tag.
  if not matches:
    return False
  # A "master" (old) or "main" (new) tag, indicating the state of the main
  # branch at the time of a release.  Not an actual version in itself, though.
  if matches.group(1) == '-master' or matches.group(1) == '-main':
    return False
  # For historical reasons, these oldest few tags are not currently deployed to
  # appengine.  All other matching tags are, though.
  if name in ['v1.2.0', 'v1.2.1', 'v1.2.2', 'v1.2.3']:
    return False
  return True

def version_key(version):
  if version == 'nightly':
    # A false version number for nightly, greater than any actual release
    # version.
    return [float('inf')]

  assert version[0] == 'v'
  main_version, _, suffix = version[1:].partition('-')
  if not suffix:
    suffix = '}}}'  # this puts main releases after prerelease versions
  version_tuple = [int(x) for x in main_version.split('.')]
  return version_tuple + [suffix]

def get_release_tags():
  output = subprocess.check_output(['git', 'tag'], text=True)
  return list(filter(is_release_tag, output.split('\n')))

def get_appspot_versions():
  output = subprocess.check_output([
    'gcloud',
    '--project=shaka-player-demo',
    'app', 'versions', 'list',
    '--format=json',
  ], text=True)
  return list(map(lambda v: v['id'], json.loads(output)))

def generate():
  # Get all deployed appspot versions.  This global list is used in various
  # methods above as we process the metadata.
  global DEPLOYED_APPSPOT_VERSIONS
  DEPLOYED_APPSPOT_VERSIONS = get_appspot_versions()

  # Get all release tags.
  versions = get_release_tags()
  # Now sort, putting prerelease versions ahead of the corresponding release.
  versions.sort(key=version_key)

  version_metadata = collections.OrderedDict()
  latest_by_branch = {}
  for v in versions:
    version_metadata[v] = version_to_metadata(v)

    # Because |versions| is already sorted, we can just overwrite the entry
    # in the latest_by_branch dictionary.
    branch_key = tuple(version_key(v)[0:2])
    latest_by_branch[branch_key] = v

  for v in latest_by_branch.values():
    version_metadata[v]['best'] = True

  # Append nightly rather than filter for it, so that it always appears at the
  # end of the list.
  version_metadata['nightly'] = version_to_metadata('nightly')
  version_metadata['nightly']['best'] = True

  # Debug: uncomment to see a list of version metadata objects.
  #for i in version_metadata.values(): print(i)

  script_path = os.path.dirname(__file__)
  template_path = os.path.join(script_path, 'templates', 'index.html')
  output_path = os.path.join(script_path, 'static', 'index.html')

  os.makedirs(os.path.dirname(output_path), exist_ok=True)

  with open(template_path, 'r') as template_file:
    with open(output_path, 'w') as output_file:
      template = jinja2.Template(template_file.read())
      output = template.render(versions=version_metadata.values())
      output_file.write(output)

if __name__ == '__main__':
  generate()
