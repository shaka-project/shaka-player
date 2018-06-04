#!/usr/bin/env python
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

import argparse
import json
import logging
import os
import shakaBuildHelpers
import sys
import webbrowser

try:
    # python 3
    from http.server import SimpleHTTPRequestHandler
except ImportError:
    # python 2
    from SimpleHTTPServer import SimpleHTTPRequestHandler

from server import StoppableHTTPServer

def main(args):

  os.chdir(shakaBuildHelpers.get_source_base())

  args = get_arg_parser().parse_args()

  if (args.which == 'register'):
    PluginRegistry().register_plugin(args.name, args.src)

  if (args.which == 'launch'):
    host = args.address[0].strip() if args.address else None
    port = args.port[0] if args.port else None
    PluginLauncher(host=host or "127.0.0.1", port=port or 8080).run(args.name)


def get_arg_parser():
  parser = argparse.ArgumentParser(
    description=__doc__,
    formatter_class=argparse.RawDescriptionHelpFormatter)

  subparsers = parser.add_subparsers(help='Subcommand -h/--help for full description:')

  # arguments and help text for the launch subcommand
  register_parser = subparsers.add_parser(
    'register',
    help='''Register an application plugin. This stores the plugin name
      and source url in plugin_registry.json to later be loaded by the
      browser when launching the demo app for use with a specific plugin.''')
  register_parser.set_defaults(which='register')
  register_parser.add_argument(
    'name',
    help='The name of the plugin to register')
  register_parser.add_argument(
    'src',
    help='The source url of the plugin to register')

  # arguments and help text for the launch subcommand
  launch_parser = subparsers.add_parser(
    'launch',
    help='''Launch the demo application and load the specified plugin.
      This will start a local server and launch the system default browser.
      The selected plugin script will be automatically added to the page
      by the app.''')
  launch_parser.set_defaults(which='launch')
  launch_parser.add_argument(
    'name',
    help='The name of the plugin to launch.')
  launch_parser.add_argument(
    '-p', '--port',
    nargs=1,
    metavar=('port'),
    type=int,
    help='Specify the port for the server to listen on (default 8080).')
  launch_parser.add_argument(
    '-a', '--address',
    nargs=1,
    metavar=('address'),
    help='Launch the demo application on a specific host address (default 127.0.0.1).')


  return parser

"""
Starts a local StoppableHttpServer and launches the demo
application with the appropriate application plugin enabled
"""

class PluginLauncher:

  def __init__(self, host, port):
    self.host = host
    self.port = port
    self.base_url = "http://{}:{}/demo/index.html".format(self.host, self.port)
    self.server = StoppableHTTPServer((self.host, self.port), SimpleHTTPRequestHandler)

  def run(self, name):
    self.launch_demo_app(name)
    self.server.start()

  def launch_demo_app(self, name):
    url = self.base_url + "#plugin={}".format(PluginRegistry().get_src(name))
    logging.info("Launching {}".format(url))
    webbrowser.open(url)


class PluginRegistry:
  def __init__(self):
    self.registry_path = shakaBuildHelpers.get_source_base() + '/demo/plugin/plugin_registry.json'

  def open_registry(self, mode):
    try:
      return open(self.registry_path, mode)
    except IOError: # file doesn't exist, create it
      return open(self.registry_path, 'w')

  def is_empty(self):
    with self.open_registry('r') as registry:
      return registry.read().strip() == ''

  def read_json(self):
    with self.open_registry('r') as registry:
      if (self.is_empty()):
        return {}
      else:
        return json.load(registry) # will error out if file is improperly formatted

  def write_json(self, data):
    with self.open_registry('w') as registry:
      if registry: json.dump(data, registry, indent=1)

  def register_plugin(self, name, src):
    plugin_data = self.read_json()
    plugin_data[name] = src
    self.write_json(plugin_data)
    logging.info("Added plugin {} to {}".format(name, self.registry_path))

  def get_src(self, name):
    plugin_data = self.read_json()
    try:
      return plugin_data[name]
    except KeyError:
      return ''



if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
