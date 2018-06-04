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
import os
import shakaBuildHelpers
import socket
import sys
import threading

try:
    # python 3
    from http.server import SimpleHTTPRequestHandler
    from http.server import HTTPServer
except ImportError:
    # python 2
    from SimpleHTTPServer import SimpleHTTPRequestHandler
    from BaseHTTPServer import HTTPServer

def main(args):
  os.chdir(shakaBuildHelpers.get_source_base())

  args = get_arg_parser().parse_args()
  host = args.address[0] if args.address else '127.0.0.1'
  port = args.port[0] if args.port else 8080

  StoppableHTTPServer((host, port), SimpleHTTPRequestHandler).start()

def get_arg_parser():
  parser = argparse.ArgumentParser(
    description=__doc__,
    formatter_class=argparse.RawDescriptionHelpFormatter)

  parser.add_argument(
    '-p', '--port',
    nargs=1,
    metavar=('port'),
    type=int,
    help='Specify the port for the server.')

  parser.add_argument(
    '-a', '--address',
    nargs=1,
    metavar=('address'),
    help='Specify the host address for the server.')

  return parser


"""
An extension of HTTPServer that allows easy termination of
the server from a KeyboardInterrupt event.
"""

class StoppableHTTPServer(HTTPServer):

  def server_bind(self):
    HTTPServer.server_bind(self)
    self.run = True

  def get_request(self):
    while self.run:
      try:
        sock, addr = self.socket.accept()
        sock.settimeout(None)
        return sock, addr
      except socket.timeout:
        pass

  def serve(self):
    while self.run:
      self.handle_request()

  def stop(self):
    self.run = False
    print("\nServer shutting down...")
    sys.exit(0) # TODO: should process exit here?

  def start(self):
    print("Serving shaka demo on {}:{}".format(self.server_address[0], self.server_port))
    server_thread = threading.Thread(target=self.serve)
    server_thread.daemon = True
    server_thread.start()
    try:
      prompt = "Press <RETURN> or <CTRL-C> to stop server\n"
      raw_input(prompt) if sys.version_info[0] < 3 else input(prompt)
      self.stop()
    except KeyboardInterrupt:
      self.stop()


if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)