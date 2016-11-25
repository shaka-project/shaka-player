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

"""A program for analyzing the Shaka compiled sources.

This can be used to find areas that can be removed if not needed.  This uses
the source map (i.e. shaka-player.compiled.debug.map) to find the compiled code
size, see:
    https://github.com/mattrobenolt/python-sourcemap
    http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/

This script can output four different stats in two different formats:
- The size of functions and namespaces.
- The dependencies between types (in plain or DOT format).
- The dependencies between functions (in plain or DOT format).
- All tokens in the source map.

The dependencies can be outputted in DOT format which can be used with graph
programs to display a visual layout of the dependencies.
"""

import json
import math
import os
import string
import sys

import shakaBuildHelpers


# A Base64 VLQ digit can represent 5 bits, so it is Base32.
VLQ_BASE_SHIFT = 5
VLQ_BASE = 1 << VLQ_BASE_SHIFT

# A mask of bits for a VLQ digit (11111), 31 decimal
VLQ_BASE_MASK = VLQ_BASE - 1

# The continuation bit is the 6th bit
VLQ_CONTINUATION_BIT = VLQ_BASE

# Don't use Base64 lib since it is not a real Base64 string; it simply
# decodes each character to a single Base64 number.
B64 = dict((c, i) for i, c in
           enumerate('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
                     '0123456789+/'))


def from_vlq_signed(value):
  """Converts a VLQ number to a normal signed number.

  Args:
    value: A number decoded from a VLQ string.

  Returns:
    an integer.
  """
  negative = (value & 1) == 1
  value >>= 1
  return -value if negative else value


class Segment(object):
  """Defines an entry in the source map.

  Members:
    dst_col_offset - The offset of the destination column from the previous
      segment.
    name_offset - If not None, the offset of the name index from the previous
      segment.
  """

  def __init__(self, data):
    self.dst_col_offset = data[0]
    self.name_offset = data[4] if len(data) > 4 else None


def decode_segment(segment):
  """Decodes VLQ values from the given segment.

  Args:
    segment: A string containing the encoded segment text.

  Returns:
    the parsed Segment.
  """

  values = []
  cur, shift = 0, 0

  for c in segment:
    digit = B64[c]
    cont = (digit & VLQ_CONTINUATION_BIT) != 0
    digit &= VLQ_BASE_MASK
    cur += digit << shift
    shift += VLQ_BASE_SHIFT

    if not cont:
      values.append(from_vlq_signed(cur))
      cur, shift = 0, 0

  # A valid VLQ string should not have dangling bits.
  assert cur == 0
  assert shift == 0
  return Segment(values)


class Token(object):
  """A Token represents one JavaScript symbol.

  For example, this can be a variable or an equals sign.  If this is a variable
  or the keyword 'function' it will usually have a name which indicates what it
  originally was defined. But there are also tokens such as ; and ( which appear
  as tokens in the map but to not have explicit name (see isFunction).

  Members:
      dst_line - Line index in compiled code
      dst_col - Column index in compiled code
      name - Name of the token; or None
  """

  def __init__(self, dst_line, dst_col, name=None):
    self.dst_line = dst_line
    self.dst_col = dst_col
    self.name = name

  def __str__(self):
    return str(self.name)


def decode_mappings(line_data, names):
  """Decodes a mappings line of text.

  Args:
    line_data: A string containing the mapping line.
    names: An array of strings containing the names of the objects.

  Returns:
    a list of Tokens
  """

  tokens = []

  lines = line_data.split(';')
  name_id = 0
  for dst_line, line in enumerate(lines):
    dst_col = 0
    segments = line.split(',')
    for segment in segments:
      if not segment:
        continue

      segment = decode_segment(segment)
      dst_col += segment.dst_col_offset

      # segment.dst_col can be negative (more useful in names below); however
      # after applying a negative offset, the result must still be positive.
      assert dst_col >= 0

      name = None
      if segment.name_offset is not None:
        name_id += segment.name_offset
        assert name_id >= 0
        name = names[name_id]

      tokens.append(Token(dst_line, dst_col, name))

  return tokens


def is_function(token, lines):
  """Determines if the given token is the start of a function.

  All function definitions are assumed to have a name field and the token in
  the compiled source is the keyword 'function'. Sometimes the function is
  defined on the previous semicolon and sometimes that semicolon appears on
  the previous line.

  Args:
    token: The Token to check.
    lines: An array of compiled code lines.

  Returns:
    whether the token is a function.
  """

  # All functions have a name.
  if not token.name:
    return False

  # Sometimes a function token starts with the previous ;
  # Also sometimes the token starts on the ; that is on the previous
  # line.
  partial_line = lines[token.dst_line][token.dst_col:]
  if partial_line == ';\n':
    if len(lines) == token.dst_line + 1:
      return False
    else:
      return lines[token.dst_line + 1].startswith('function')
  else:
    return (partial_line.startswith('function') or
            partial_line.startswith(';function'))


def read_function(token_iter, prev, prev_index, lines, callback):
  """Reads a function from the token stream.

  The function token should already be consumed.

  Args:
    token_iter: An iterator of the tokens.
    prev: The token containing the function definition.
    prev_index: The index of the previous token.
    lines: An array of compiled code lines.
    callback: A callback type used to create the data.  See traverse_tokens.

  Returns:
    an array of State objects in a format controlled by the callback (see
    traverse_tokens).
  """

  brackets = 0
  read = False
  ret = []

  partial_line = lines[prev.dst_line][prev.dst_col:]
  state = callback(prev, prev_index)

  try:
    while not read or brackets > 0:
      index, token = next(token_iter)
      partial_line = lines[token.dst_line][token.dst_col:]

      # Recursively read functions.  Sometimes functions are defined nested.
      # This doesn't happen that often, and never for Shaka methods, so it does
      # not count it twice since the size of this method includes the nested
      # function.
      if is_function(token, lines):
        ret += read_function(token_iter, token, index, lines, callback)
      else:
        state.add(token, index)

      if partial_line.startswith('{}'):
        read = True
      elif partial_line[0] == '{':
        brackets += 1
        read = True
      elif partial_line[0] == '}':
        brackets -= 1
  # When we run out of tokens, simply ignore it.  A parent call will not see
  # this error; but it will continue and the next call to 'next' will fail
  # with another StopIteration.  This ensures that the last State object
  # is included for invalid content.
  except StopIteration:
    pass

  temp = state.build()
  if temp:
    ret.append(temp)

  return ret


def traverse_tokens(tokens, lines, callback):
  """Traverses a list of tokens to identify functions.

  Then uses a callback to perform some work on the functions.  Each function
  seen gets a new State object created from the given callback method; there is
  a single State for global code which is given None in the constructor.  Then,
  each token seen is passed to the 'add' method of the State.  This is used by
  the State to either calculate sizes, print tokens, or detect dependencies.
  The 'build' method is called at the end of the function to create a result
  object that is returned as an array at the end.

  Args:
    tokens: An array of Tokens.
    lines: An array of compiled code lines.
    callback: A constructor that returns a state object.  It takes a start
        token or None if outside a function.  It has two member functions
          add - accepts the current token and the token's index.
          build - returns an object to be added to the results.

  Returns:
    an array of State objects in a format controlled by the callback.
  """

  ret = []
  state = callback(None, None)
  # Create a token iterator.  This is used to read tokens from the array.  We
  # cannot use a for loop because the iterator is passed to readFunction.
  token_iter = enumerate(tokens)
  try:
    while True:
      index, token = next(token_iter)

      if is_function(token, lines):
        ret += read_function(token_iter, token, index, lines, callback)
      else:
        state.add(token, index)
  except StopIteration:
    pass

  temp = state.build()
  if temp:
    ret.append(temp)
  return ret


class FunctionSize(object):
  """Contains information about a function's size."""

  def __init__(self, name, size):
    self.name = name
    self.size = size


def print_tokens(tokens, lines, funcs):
  """Prints the given tokens.

  Args:
    tokens: An array of Tokens.
    lines: An array of compiled code lines.
    funcs: An array of FunctionSize.
  """

  class State(object):
    """Defines the current parser state."""

    def __init__(self, token, index):
      # The start of a function, or the global start.
      self.name = token.name if token else None
      if token:
        self._print_token('>', token, index)

    def _print_token(self, prefix, token, index):
      partial_line = lines[token.dst_line][token.dst_col:]
      if len(tokens) > index + 1:
        next_ = tokens[index + 1]
        if next_.dst_line == token.dst_line:
          partial_line = lines[token.dst_line][token.dst_col:next_.dst_col]
      token_text = partial_line[:10].replace('\n', '').rjust(12)
      print '%s %4d %4d %12s %s' % (prefix, token.dst_line, token.dst_col,
                                    token_text, token.name)

    def add(self, token, index):
      """Parses the given token.

      Args:
        token: The token to add.
        index: The index of the token in the original array.
      """
      prefix = None
      if not self.name:
        prefix = '!'
      elif lines[token.dst_line][token.dst_col:token.dst_col+2] == '{}':
        prefix = ' '
      elif lines[token.dst_line][token.dst_col] == '{':
        prefix = '+'
      elif lines[token.dst_line][token.dst_col] == '}':
        prefix = '-'
      else:
        prefix = ' '

      self._print_token(prefix, token, index)

    def build(self):
      if not self.name:
        return

      # The end of a function.  Print the size of this function.
      size = 0
      this_func = [t for t in funcs if t.name == self.name]
      if this_func:
        size = this_func[0].size
      print 'X', self.name, size

  traverse_tokens(tokens, lines, State)


class FunctionDependencies(object):
  """Contains information about a function's dependencies."""

  def __init__(self, name, deps):
    self.name = name
    self.deps = deps


def process_deps(tokens, lines, is_class):
  """Processes the tokens into function or class dependencies.

  Args:
    tokens: An array of Tokens.
    lines: An array of compiled code lines.
    is_class: Whether to create a class graph instead of a function graph.

  Returns:
    an array of FunctionDependencies.
  """

  class State(object):
    """Defines the current parser state."""

    def __init__(self, token, _):
      self.deps = []
      self.name, self.parts = self._create_parts(token)

    def _create_parts(self, token):
      """Creates an array of name parts.

      Args:
        token: The token to create the name from.

      Returns:
        A tuple of the name and the array of name parts.
      """
      if not token or not token.name:
        return (None, None)
      parts = token.name.split('.')
      name = token.name

      # Instance methods are the same as static methods.
      if len(parts) > 2 and parts[-2] == 'prototype':
        del parts[-2]

      # Strip function names if class graph; also remove it from the name.
      if is_class:
        if parts[-1][0] in string.lowercase:
          del parts[-1]
          name = '.'.join(parts)

      return (name, parts)

    def add(self, token, _):
      """Parses the given token.

      Args:
        token: The token to parse.
      """
      # Ignore symbols outside a function.  Only care about function
      # references and only those that reference our code.
      if not self.name or not token.name or not token.name.startswith('shaka.'):
        return

      name, other_parts = self._create_parts(token)

      # Get the index of the first different namespace.
      count = min(len(self.parts), len(other_parts))
      i = 0
      while i < count and self.parts[i] == other_parts[i]:
        i += 1

      # Ignore use of members of the same object:
      # OfflineVideoSource.configure and OfflineVideoSource.store
      if (i == count - 1 or i == count) and len(self.parts) == len(other_parts):
        return

      # Ignore use of the constructor of the same type:
      # OfflineVideoSource and OfflineVideoSource.store
      if i == count and abs(len(self.parts) - len(other_parts)) == 1:
        return

      # Add the dependency.
      if name not in self.deps:
        self.deps.append(name)

    def build(self):
      return FunctionDependencies(self.name, self.deps) if self.name else None

  ret = traverse_tokens(tokens, lines, State)
  assert ret
  ret = sorted(ret, key=lambda key: key.name)

  # We need to collapse duplicates.
  i = 0
  while i + 1 < len(ret):
    if ret[i].name == ret[i + 1].name:
      for dep in ret[i + 1].deps:
        if dep not in ret[i].deps:
          ret[i].deps.append(dep)
      del ret[i + 1]
    else:
      i += 1

  return ret


def process_sizes(tokens, lines):
  """Processes an array of tokens into function lengths.

  Args:
    tokens: An array of Tokens.
    lines: An array of compiled code lines.

  Returns:
    an array of FunctionSizes sorted on name.
  """

  class State(object):
    """Defines the current parser state."""

    def __init__(self, token, _):
      self.name = token.name if token else None
      self.size = 0
      self.start = token.dst_col if token else None
      self.line = token.dst_line if token else None

    def add(self, token, _):
      """Parses the given token.

      Args:
        token: The token to parse.
      """
      # Ignore outside a function
      if not self.name:
        return
      # If we skipped to the next line, include the code to the end of the line.
      # If we skipped multiple lines, include the whole line.  This will most
      # likely never happen since the compiled code usually has new lines on
      # function boundaries.
      assert token.dst_line >= self.line
      while token.dst_line != self.line:
        self.size += len(lines[self.line]) - self.start
        self.line += 1
        self.start = 0

      # Keep increasing the size.  We can't simply keep the start and measure
      # at the end since we are not given the end token in build().
      self.size += token.dst_col - self.start
      self.start = token.dst_col

    def build(self):
      return FunctionSize(self.name, self.size) if self.name else None

  ret = traverse_tokens(tokens, lines, State)
  assert ret

  ret = [k for k in ret if k.name and
         (k.name.startswith('shaka.') or k.name.startswith('goog.'))]
  ret = sorted(ret, key=lambda key: key.name)

  # We need to collapse duplicates.
  i = 0
  while i + 1 < len(ret):
    if ret[i].name == ret[i + 1].name:
      ret[i].size += ret[i + 1].size
      del ret[i + 1]
    else:
      i += 1

  return ret


def print_tree(results, indent, callback, end_callback):
  """Prints the results in an indented format.

  Args:
    results: An array of FunctionSizes sorted on name.
    indent: A number to indent.
    callback: A callback function to print the data.  Accepts a title, an
        indentation, and a sublist of the items in that group.
    end_callback: A callback function called after a group; can be None.
  """

  # This is used both when printing sizes and when printing dependencies in
  # DOT format.  This recursively creates groups of items with the same prefix.
  # e.g.
  # shaka
  #  shaka.util
  #   shaka.util.FailoverUri
  #   shaka.util.TypedBind
  #  shaka.player
  # ...

  if len(results) <= 1:
    callback(None, indent, results)
    return

  # We want to group-by prefixes for the elements.  Since it is sorted, we
  # can find the overall prefix length.
  first = results[0].name.split('.')
  last = results[-1].name.split('.')
  prefix = 0
  while (prefix < len(first) and prefix < len(last)
         and first[prefix] == last[prefix]):
    prefix += 1

  group = 0
  group_items = first
  if prefix == len(first):
    # This happens when the group has a first element of a class name and the
    # remaining are member functions.  Remove the first element from this
    # group.
    group_items = results[1].name.split('.')
    group = 1

  # Start with second element, and go one more so we make sure to process the
  # last group.
  for i in range(1, len(results) + 1):
    if i == len(results):
      items = [''] * (prefix + 1)
    else:
      items = results[i].name.split('.')
    if items[prefix] != group_items[prefix]:
      title = '.'.join(group_items[:(prefix + 1)])
      callback(title, indent, results[group:i])

      print_tree(results[group:i], indent + 1, callback, end_callback)

      # Set the start of the next group to the current element.
      group = i
      group_items = items

  if end_callback:
    end_callback(indent)


def print_sizes(sizes):
  """Prints the sizes in an indented format.

  Args:
    sizes: An array of FunctionSizes sorted on name.
  """
  # This callback is used to print the total sizes of each of the sub-groups.
  # Using the indent as padding allows to print a tree-like structure to
  # show how big each section is.
  def callback_factory(padding):
    # Use a factory so we capture the padding.
    def callback(title, indent, results):
      if title:
        size = sum([k.size for k in results])
        print '%s %*d %s' % (indent * '  ', padding, size, title)
    return callback

  total = sum([k.size for k in sizes])
  padding = int(math.ceil(math.log10(total)))

  print '%*d %s' % (padding, total, 'TOTAL')
  print_tree(sizes, 0, callback_factory(padding), None)


def print_deps(results, in_dot):
  """Prints the dependencies.

  Arguments:
    results: A sorted array of FunctionDependencies.
    in_dot: Whether to print in DOT format.
  """
  if not in_dot:
    for func in results:
      name, deps = func.name, func.deps

      # Ignore items with no dependencies.
      if deps:
        print name

      for dep in deps:
        print '  ', dep

    return

  dep_map = dict()

  # Use the printTree to produce clusters for each namespace and type.  This
  # will print boxes around each class and show dependencies between types.
  print 'digraph {'
  def callback_factory(dep_map, temp):
    """Creates a callback function."""
    def callback(title, indent, results):
      if title:
        if len(results) > 1:
          print '\t' * indent, 'subgraph', 'cluster' + str(len(temp)), '{'
          temp.append(1)
        else:
          print('\t' * indent, len(dep_map), '[',
                'label="' + results[0].name + '"', ']', ';')
          dep_map[results[0].name] = len(dep_map)

    return callback

  def end_callback(indent):
    if indent > 1:
      print '\t' * (indent - 1), '}'

  print_tree(results, 1, callback_factory(dep_map, []), end_callback)

  for func in results:
    name, deps = func.name, func.deps

    # Ignore items with no dependencies.
    if deps:
      if name not in dep_map:
        dep_map[name] = len(dep_map)
        print '\t', dep_map[name], '[', 'label="' + name + '"', ']', ';'

    for dep in deps:
      if dep not in dep_map:
        dep_map[dep] = len(dep_map)
        print '\t', dep_map[dep], '[', 'label="' + dep + '"', ']', ';'

      print '\t', dep_map[name], '->', dep_map[dep], ';'

  print '}'


class Options(object):
  """Defines options to the script."""

  def __init__(self):
    self.print_deps = False
    self.print_sizes = False
    self.print_tokens = False
    self.in_dot = False
    self.is_class = False


def process(text, options):
  """Decodes a JSON string containing source map data.

  Args:
    text: A JSON string containing source map data.
    options: An object containing the command-line options.
  """

  # The spec allows a map file to start with )]} to prevent javascript from
  # including it.
  if text.startswith(')]}\'\n') or text.startswith(')]}\n'):
    _, text = text.split('\n', 1)

  # Decode the JSON data and get the parts we need.
  data = json.loads(text)
  # Paths are relative to the output directory.
  base = os.path.join(shakaBuildHelpers.get_source_base(), 'dist')
  file_lines = open(os.path.join(base, data['file'])).readlines()
  names = data['names']
  mappings = data['mappings']
  tokens = decode_mappings(mappings, names)
  sizes = process_sizes(tokens, file_lines)

  # Print out one of the results.
  if options.print_tokens:
    print_tokens(tokens, file_lines, sizes)
  elif options.print_sizes:
    print_sizes(sizes)
  elif options.print_deps or options.is_class:
    temp = process_deps(tokens, file_lines, options.is_class)
    print_deps(temp, options.in_dot)


def print_help():
  """Prints the help docs.
  """

  print 'Usage:', sys.argv[0], """[options] [--] [source_map]

source_map must be either the path to the source map, or the name of the build
type.  You must build Shaka first.

Types(must include exactly one):
 -c --class-deps         : Prints the class dependencies
 -f --function-deps      : Prints the function dependencies
 -s --function-sizes     : Prints the function sizes (in number of characters)
 -t --all-tokens         : Prints all tokens in the source map

Options:
 -d --dot-format         : Prints in DOT format; only valid with \
--function-deps or --class-dep
 -h --help               : Prints this help page

Token Format:
 prefix line col token name => Token
 X functionName size        => end function

Prefixes:
 > - start a function
 ! - not in a function
 - - end curly brace
 + - start curly brace
   - other token

DOT Format:
  This can print the dependency graph in DOT format.  This can be used with
  graph programs to display a visual graph of dependencies.  For example
  using graphviz:

 """, sys.argv[0], """-c -d | fdp -Goverlap=prism | neato -n2 -Tsvg > out.svg"""


def main(args):
  options = Options()
  done_args = False
  name = 'shaka-player.compiled.debug.map'

  # Process the command-line arguments.
  for arg in args:
    if done_args or arg[0] != '-':
      name = arg
    elif arg == '-f' or arg == '--function-deps':
      options.print_deps = True
    elif arg == '-t' or arg == '--all-tokens':
      options.print_tokens = True
    elif arg == '-s' or arg == '--function-sizes':
      options.print_sizes = True
    elif arg == '-c' or arg == '--class-deps':
      options.is_class = True
    elif arg == '-d' or arg == '--dot-format':
      options.in_dot = True
    elif arg == '--':
      done_args = True
    elif arg == '-h' or arg == '--help':
      print_help()
      return 0
    else:
      print >> sys.stderr, 'Unrecognized argument:', arg
      print_help()
      return 1

  # Try to find the file
  if not os.path.isfile(name):
    # Get the source code base directory
    base = shakaBuildHelpers.get_source_base()

    # Supports the following searches:
    # * File name given, map in dist/
    # * Type given, map in working directory
    # * Type given, map in dist/
    if os.path.isfile(os.path.join(base, 'dist', name)):
      name = os.path.join(base, 'dist', name)
    elif os.path.isfile(
        os.path.join('shaka-player.' + name + '.debug.map')):
      name = os.path.join('shaka-player.' + name + '.debug.map')
    elif os.path.isfile(
        os.path.join(base, 'dist', 'shaka-player.' + name + '.debug.map')):
      name = os.path.join(base, 'dist', 'shaka-player.' + name + '.debug.map')
    else:
      print >> sys.stderr, name, 'not found; build Shaka first.'
      return 1

  # Verify arguments are correct.
  if (options.print_sizes + options.print_deps + options.print_tokens +
      options.is_class) != 1:
    print >> sys.stderr, 'Must include exactly one output type.'
    print_help()
    return 1
  elif options.in_dot and not options.print_deps and not options.is_class:
    line = '--dot-format only valid with --function-deps or --class-deps.'
    print >> sys.stderr, line
    return 1
  else:
    process(open(name).read(), options)
    return 0


if __name__ == '__main__':
  shakaBuildHelpers.run_main(main)
