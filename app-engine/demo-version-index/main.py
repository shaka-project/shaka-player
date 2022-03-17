# Shaka Player Version Index - Appspot Entrypoint
# Copyright 2022 Google LLC
# SPDX-License-Identifier: Apache-2.0

# Generate an index of Shaka Player versions on appspot.

import collections
import google.appengine.api.modules
import jinja2
import os
import random
import re

from flask import Flask, render_template

DEMO_URL_TEMPLATE = 'https://{0}-dot-shaka-player-demo.appspot.com/'

# In Google Hosted Libraries
HOSTED_URL_TEMPLATE = 'https://ajax.googleapis.com/ajax/libs/shaka-player/{0}/shaka-player.{1}'

# Before Google Hosted Libraries, v1 appspot URLs
V1_URL_TEMPLATE = 'https://{0}-dot-shaka-player-demo.appspot.com/shaka-player.{1}'
# Before Google Hosted Libraries, v2 appspot URLs
V2_URL_TEMPLATE = 'https://{0}-dot-shaka-player-demo.appspot.com/dist/shaka-player.{1}'

def version_to_demo_url(v):
  return DEMO_URL_TEMPLATE.format(v.replace('.', '-'))

def version_to_lib_url(v):
  if v == 'nightly':
    return V2_URL_TEMPLATE.format(v, 'compiled.js')
  elif (version_key(v) == version_key('v1.6.5') or
      version_key(v) >= version_key('v2.0.6')):
    return HOSTED_URL_TEMPLATE.format(v.replace('v', ''), 'compiled.js')
  elif version_key(v) >= version_key('v2.0.0-beta'):
    return V2_URL_TEMPLATE.format(v.replace('.', '-'), 'compiled.js')
  else:
    return V1_URL_TEMPLATE.format(v.replace('.', '-'), 'compiled.js')

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

def is_release_version(name):
  return re.match(r'v\d+-\d+-\d+(?:-.+)?', name)

def appengine_version_to_package_version(version):
  # Replace the first two dashes with dots.  More dashes indicate a prerelease
  # version, as seen in "v2.0.0-beta3".
  return version.replace('-', '.', 2)

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

def get_appengine_versions():
  if os.getenv('SERVER_SOFTWARE', '').startswith('Google App Engine/'):
    # NOTE: this doesn't return anything useful in a local dev server.
    return google.appengine.api.modules.modules.get_versions()

  # For a local dev server, fake it so we can test sorting.
  fake_versions = [
    'v1-6-0', 'v1-6-1', 'v1-6-2', 'v1-6-3', 'v1-6-4', 'v1-6-5',
    'v2-0-0-beta', 'v2-0-0-beta2', 'v2-0-0-beta3', 'v2-0-0',
    'v2-1-0', 'v2-1-1', 'v2-1-2',
    'v2-2-1', 'v2-2-2-beta', 'v2-2-2-beta2', 'v2-2-2', 'v2-2-9', 'v2-2-10',
  ]
  random.shuffle(fake_versions)  # in-place shuffle
  return fake_versions


app = Flask(__name__)

@app.route('/')
def root():
  appengine_versions = get_appengine_versions()
  # Filter for release versions only.
  appengine_versions = filter(is_release_version, appengine_versions)

  # Now convert from appengine versions (v2-0-0) to package versions (v2.0.0).
  versions = list(map(appengine_version_to_package_version, appengine_versions))
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

  for i in version_metadata.values(): print(i)
  return render_template('index.html', versions=version_metadata.values())
