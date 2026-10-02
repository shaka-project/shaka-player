#!/usr/bin/env python3
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

"""Serves the UI translations dashboard with the ability to save changes.

The dashboard (ui/locales/dashboard.html) also works as a read-only report
when served by any static web server.  This script adds a small local API so
that edits made in the dashboard are written straight to ui/locales/*.json:

  GET  /api/locales          List the locale files.
  PUT  /api/locales/<code>   Create or overwrite ui/locales/<code>.json.

The dashboard produces the exact file contents (key order, indentation and
escaping), so the server only validates and writes them.

The server only listens on localhost.
"""

import argparse
import http.server
import json
import logging
import os
import re
import webbrowser

import shakaBuildHelpers


_LOCALES_URL_PATH = '/ui/locales/'
_DASHBOARD_URL_PATH = _LOCALES_URL_PATH + 'dashboard.html'
_API_PATH = '/api/locales'
# Other files the dashboard needs.  The Tengwar font renders Sindarin (sjn).
_EXTRA_STATIC_PATHS = {'/demo/TengwarTelcontar.woff2'}

# BCP-47-ish: a 2-3 letter language, then optional subtags (region, script,
# private use like "XA").
_LOCALE_RE = re.compile(r'^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$')

# Never let the dashboard overwrite the message definitions.
_RESERVED_LOCALES = {'source'}

_MAX_BODY_SIZE = 1024 * 1024


def _locales_dir():
  return os.path.join(shakaBuildHelpers.get_source_base(), 'ui', 'locales')


def _list_locales():
  return sorted(
      name[:-len('.json')] for name in os.listdir(_locales_dir())
      if name.endswith('.json') and
      name[:-len('.json')] not in _RESERVED_LOCALES)


def _parse_translations(text):
  """Returns the parsed translations, or None if they are not valid."""
  try:
    data = json.loads(text)
  except ValueError:
    return None
  if not isinstance(data, dict):
    return None
  if not all(isinstance(k, str) and isinstance(v, str)
             for k, v in data.items()):
    return None
  return data


class _Handler(http.server.SimpleHTTPRequestHandler):
  """Serves ui/locales/ statically, plus the save API."""

  def __init__(self, *args, **kwargs):
    super().__init__(
        *args, directory=shakaBuildHelpers.get_source_base(), **kwargs)

  def end_headers(self):
    # Always show the files as they are on disk.
    self.send_header('Cache-Control', 'no-store')
    super().end_headers()

  def log_message(self, format, *args):  # pylint: disable=redefined-builtin
    logging.debug(format, *args)

  def _send_json(self, status, payload):
    body = json.dumps(payload).encode('utf-8')
    self.send_response(status)
    self.send_header('Content-Type', 'application/json; charset=utf-8')
    self.send_header('Content-Length', str(len(body)))
    self.end_headers()
    self.wfile.write(body)

  def _is_local_origin(self):
    # Refuse writes triggered by other web pages open in the browser,
    # including through DNS rebinding.
    host = self.headers.get('Host', '')
    if host.rsplit(':', 1)[0] not in ('localhost', '127.0.0.1'):
      return False
    origin = self.headers.get('Origin')
    return origin is None or origin == 'http://' + host

  def do_GET(self):  # pylint: disable=invalid-name
    path = self.path.split('?', 1)[0]
    if path == '/':
      self.send_response(302)
      self.send_header('Location', _DASHBOARD_URL_PATH)
      self.end_headers()
    elif path == _API_PATH:
      self._send_json(200, {'locales': _list_locales()})
    elif ((path.startswith(_LOCALES_URL_PATH) and '..' not in path) or
          path in _EXTRA_STATIC_PATHS):
      super().do_GET()
    else:
      self.send_error(404)

  def do_HEAD(self):  # pylint: disable=invalid-name
    self.send_error(405)

  def do_PUT(self):  # pylint: disable=invalid-name
    path = self.path.split('?', 1)[0]
    if not path.startswith(_API_PATH + '/'):
      self.send_error(404)
      return
    if not self._is_local_origin():
      self._send_json(403, {'error': 'Cross-origin writes are not allowed.'})
      return

    code = path[len(_API_PATH) + 1:]
    if not _LOCALE_RE.match(code) or code in _RESERVED_LOCALES:
      self._send_json(400, {'error': 'Invalid locale code: %s' % code})
      return

    length = int(self.headers.get('Content-Length', '0'))
    if length <= 0 or length > _MAX_BODY_SIZE:
      self._send_json(400, {'error': 'Invalid body size.'})
      return
    text = self.rfile.read(length).decode('utf-8')
    if _parse_translations(text) is None:
      self._send_json(400, {
          'error': 'The body must be a JSON object of string to string.',
      })
      return

    file_path = os.path.join(_locales_dir(), code + '.json')
    created = not os.path.exists(file_path)
    with open(file_path, 'w', encoding='utf-8', newline='\n') as f:
      f.write(text)
    logging.info('%s %s', 'Created' if created else 'Saved',
                 os.path.relpath(file_path, shakaBuildHelpers.get_source_base()))
    self._send_json(200, {'locale': code, 'created': created})


def main(args):
  parser = argparse.ArgumentParser(
      description=__doc__,
      formatter_class=argparse.RawDescriptionHelpFormatter)
  parser.add_argument(
      '--port',
      type=int,
      default=8137,
      help='The port to listen on (default %(default)s).')
  parser.add_argument(
      '--no-browser',
      action='store_true',
      help='Do not open the dashboard in a browser.')
  parsed_args = parser.parse_args(args)

  server = http.server.ThreadingHTTPServer(
      ('127.0.0.1', parsed_args.port), _Handler)
  url = 'http://localhost:%d%s' % (parsed_args.port, _DASHBOARD_URL_PATH)
  logging.info('Translations dashboard at %s', url)
  logging.info('Press Ctrl+C to stop.')
  if not parsed_args.no_browser:
    webbrowser.open(url)
  try:
    server.serve_forever()
  finally:
    server.server_close()
  return 0


if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
