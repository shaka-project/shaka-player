#!/usr/bin/python
#
# Copyright 2016 Google Inc.
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

"""A program for analyzing the Shaka compiled sources to find areas that can
be removed if not needed.  This uses the source map
(i.e. shaka-player.compiled.debug.map) to find the compiled code
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
import shakaBuildHelpers
import string
import sys
import os

def fromVlqSigned(value):
  """Converts a VLQ number to a normal signed number.

  Arguments:
    value - A number decoded from a VLQ string.

  Returns:
    an integer.
  """
  negative = (value & 1) == 1
  value >>= 1
  return -value if negative else value

class Segment:
  """Defines an entry in the source map.

  Members:
    dstColOffset - The offset of the destination column from the previous
      segment.
    nameOffset - If not None, the offset of the name index from the previous
      segment.
  """
  def __init__(self, data):
    self.dstColOffset = data[0]
    self.nameOffset = data[4] if len(data) > 4 else None

def decodeSegment(segment):
  """Decodes VLQ values from the given segment.

  Arguments:
    segment - A string containing the encoded segment text.

  Returns:
    the parsed Segment.
  """

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

  values = []
  cur, shift = 0, 0

  for c in segment:
    digit = B64[c]
    cont = (digit & VLQ_CONTINUATION_BIT) != 0
    digit &= VLQ_BASE_MASK
    cur += digit << shift
    shift += VLQ_BASE_SHIFT

    if not cont:
      values.append(fromVlqSigned(cur))
      cur, shift = 0, 0

  # A valid VLQ string should not have dangling bits.
  assert cur == 0
  assert shift == 0
  return Segment(values)

class Token:
  """A Token represents one JavaScript symbol.  For example, this can be a
  variable or an equals sign.  If this is a variable or the keyword 'function'
  it will usually have a name which indicates what it originally was defined.
  But there are also tokens such as ; and ( which appear as tokens in the
  map but to not have explicit name (see isFunction).

  Members:
      dstLine - Line index in compiled code
      dstCol - Column index in compiled code
      name - Name of the token; or None
  """
  def __init__(self, dstLine, dstCol, name=None):
    self.dstLine = dstLine
    self.dstCol = dstCol
    self.name = name

  def __str__(self):
    return str(self.name)

def decodeMappings(lineData, names):
  """Decodes a mappings line of text.

  Arguments:
    lineData - A string containing the mapping line.
    names - An array of strings containing the names of the objects.

    Returns:
      a list of Tokens
  """

  tokens = []

  lines = lineData.split(';')
  nameId = 0
  for dstLine, line in enumerate(lines):
    dstCol = 0
    segments = line.split(',')
    for segment in segments:
      if not segment:
        continue

      segment = decodeSegment(segment)
      dstCol += segment.dstColOffset

      # segment.dstCol can be negative (more useful in names below); however
      # after applying a negative offset, the result must still be positive.
      assert dstCol >= 0

      name = None
      if segment.nameOffset != None:
        nameId += segment.nameOffset
        assert nameId >= 0
        name = names[nameId]

      tokens.append(Token(dstLine, dstCol, name))

  return tokens

def isFunction(token, lines):
  """Determines if the given token is the start of a function.

  All function definitions are assumed to have a name field and the token in
  the compiled source is the keyword 'function'. Sometimes the function is
  defined on the previous semicolon and sometimes that semicolon appears on
  the previous line.

  Arguments:
    token - The Token to check.
    lines - An array of compiled code lines.

  Returns:
    whether the token is a function.
  """

  # All functions have a name.
  if not token.name:
    return False

  # Sometimes a function token starts with the previous ;
  # Also sometimes the token starts on the ; that is on the previous
  # line.
  partialLine = lines[token.dstLine][token.dstCol:]
  if partialLine == ';\n':
    if len(lines) == token.dstLine + 1:
      return False
    else:
      return lines[token.dstLine + 1].startswith('function')
  else:
    return (partialLine.startswith('function') or
        partialLine.startswith(';function'))

def readFunction(tokenIter, prev, prevIndex, lines, callback):
  """Reads a function from the token stream.  The function token should
  already be consumed.

  Arguments:
    tokenIter - An iterator of the tokens.
    prev - The token containing the function definition.
    prevIndex - The index of the previous token.
    lines - An array of compiled code lines.
    callback - A callback type used to create the data.  See traverseTokens.

  Returns:
    an array of State objects in a format controlled by the callback (see
    traverseTokens).
  """

  brackets = 0
  read = False
  ret = []

  partialLine = lines[prev.dstLine][prev.dstCol:]
  state = callback(prev, prevIndex)

  try:
    while not read or brackets > 0:
      index, token = next(tokenIter)
      partialLine = lines[token.dstLine][token.dstCol:]

      # Recursively read functions.  Sometimes functions are defined nested.
      # This doesn't happen that often, and never for Shaka methods, so it does
      # not count it twice since the size of this method includes the nested
      # function.
      if isFunction(token, lines):
        ret += readFunction(tokenIter, token, index, lines, callback)
      else:
        state.add(token, index)

      if partialLine.startswith('{}'):
        read = True
      elif partialLine[0] == '{':
        brackets += 1
        read = True
      elif partialLine[0] == '}':
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

def traverseTokens(tokens, lines, callback):
  """Traverses a list of tokens to identify functions.  Then uses a callback
  to perform some work on the functions.  Each function seen gets a new State
  object created from the given callback method; there is a single State for
  global code which is given None in the constructor.  Then, each token seen
  is passed to the 'add' method of the State.  This is used by the State to
  either calculate sizes, print tokens, or detect dependencies.  The 'build'
  method is called at the end of the function to create a result object that
  is returned as an array at the end.

  Arguments:
    tokens - An array of Tokens.
    lines - An array of compiled code lines.
    callback - A constructor that returns a state object.  It takes a start
      token or None if outside a function.  It has two member
      functions:
        add - accepts the current token and the token's index.
        build - returns an object to be added to the results.

  Returns:
    an array of State objects in a format controlled by the callback.
  """

  ret = []
  state = callback(None, None)
  # Create a token iterator.  This is used to read tokens from the array.  We
  # cannot use a for loop because the iterator is passed to readFunction.
  tokenIter = enumerate(tokens)
  try:
    while True:
      index, token = next(tokenIter)

      if isFunction(token, lines):
        ret += readFunction(tokenIter, token, index, lines, callback)
      else:
        state.add(token, index)
  except StopIteration:
    pass

  temp = state.build()
  if temp:
    ret.append(temp)
  return ret

class FunctionSize:
  def __init__(self, name, size):
    self.name = name
    self.size = size

def printTokens(tokens, lines, funcs):
  """Prints the given tokens.

  Arguments:
    tokens - An array of Tokens.
    lines - An array of compiled code lines.
    funcs - An array of FunctionSize.
  """
  class State:
    def __init__(self, token, index):
      # The start of a function, or the global start.
      self.name = token.name if token else None
      if token:
        self._printToken('>', token, index)

    def _printToken(self, prefix, token, index):
      partialLine = lines[token.dstLine][token.dstCol:]
      if len(tokens) > index + 1:
        next_ = tokens[index + 1]
        if next_.dstLine == token.dstLine:
          partialLine = lines[token.dstLine][token.dstCol:next_.dstCol]
      tokenText = partialLine[:10].replace('\n', '').rjust(12)
      print '%s %4d %4d %12s %s' % (prefix, token.dstLine, token.dstCol,
          tokenText, token.name)

    def add(self, token, index):
        prefix = None
        if not self.name:
          prefix = '!'
        elif lines[token.dstLine][token.dstCol:token.dstCol+2] == '{}':
          prefix = ' '
        elif lines[token.dstLine][token.dstCol] == '{':
          prefix = '+'
        elif lines[token.dstLine][token.dstCol] == '}':
          prefix = '-'
        else:
          prefix = ' '

        self._printToken(prefix, token, index)

    def build(self):
      if not self.name:
        return

      # The end of a function.  Print the size of this function.
      size = 0
      thisFunc = filter(lambda key:key.name == self.name, funcs)
      if len(thisFunc) > 0:
        size = thisFunc[0].size
      print 'X', self.name, size

  traverseTokens(tokens, lines, State)

class FunctionDependencies:
  def __init__(self, name, deps):
    self.name = name
    self.deps = deps

def processDeps(tokens, lines, isClass):
  """Processes the tokens into function or class dependencies.

  Arguments:
    tokens - An array of Tokens.
    lines - An array of compiled code lines.
    isClass - Whether to create a class graph instead of a function graph.

  Returns:
    an array of FunctionDependencies.
  """
  class State:
    def __init__(self, token, _):
      self.deps = []
      self.name, self.parts = self._createParts(token)

    def _createParts(self, token):
      if not token or not token.name:
        return (None, None)
      parts = token.name.split('.')
      name = token.name

      # Instance methods are the same as static methods.
      if len(parts) > 2 and parts[-2] == 'prototype':
        del parts[-2]

      # Strip function names if class graph; also remove it from the name.
      if isClass:
        if parts[-1][0] in string.lowercase:
          del parts[-1]
          name = '.'.join(parts)

      return (name, parts)

    def add(self, token, _):
      # Ignore symbols outside a function.  Only care about function
      # references and only those that reference our code.
      if not self.name or not token.name or not token.name.startswith('shaka.'):
        return

      name, otherParts = self._createParts(token)

      # Get the index of the first different namespace.
      count = min(len(self.parts), len(otherParts))
      i = 0
      while i < count and self.parts[i] == otherParts[i]:
        i += 1

      # Ignore use of members of the same object:
      # OfflineVideoSource.configure and OfflineVideoSource.store
      if (i == count - 1 or i == count) and len(self.parts) == len(otherParts):
        return

      # Ignore use of the constructor of the same type:
      # OfflineVideoSource and OfflineVideoSource.store
      if i == count and abs(len(self.parts) - len(otherParts)) == 1:
        return

      # Add the dependency.
      if not (name in self.deps):
        self.deps.append(name)

    def build(self):
      return FunctionDependencies(self.name, self.deps) if self.name else None

  ret = traverseTokens(tokens, lines, State)
  assert len(ret) > 0
  ret = sorted(ret, key=lambda key:key.name)

  # We need to collapse duplicates.
  i = 0
  while i + 1 < len(ret):
    if ret[i].name == ret[i + 1].name:
      for dep in ret[i + 1].deps:
        if not dep in ret[i].deps:
          ret[i].deps.append(dep)
      del ret[i + 1]
    else:
     i += 1

  return ret

def processSizes(tokens, lines):
  """Processes an array of tokens into function lengths.

  Arguments:
    tokens - An array of Tokens.
    lines - An array of compiled code lines.

  Returns:
    an array of FunctionSizes sorted on name.
  """
  class State:
    def __init__(self, token, _):
      self.name = token.name if token else None
      self.size = 0
      self.start = token.dstCol if token else None
      self.line = token.dstLine if token else None

    def add(self, token, _):
      # Ignore outside a function
      if not self.name:
        return
      # If we skipped to the next line, include the code to the end of the line.
      # If we skipped multiple lines, include the whole line.  This will most
      # likely never happen since the compiled code usually has new lines on
      # function boundaries.
      assert token.dstLine >= self.line
      while token.dstLine != self.line:
        self.size += len(lines[self.line]) - self.start
        self.line += 1
        self.start = 0

      # Keep increasing the size.  We can't simply keep the start and measure
      # at the end since we are not given the end token in build().
      self.size += token.dstCol - self.start
      self.start = token.dstCol

    def build(self):
      return FunctionSize(self.name, self.size) if self.name else None

  ret = traverseTokens(tokens, lines, State)
  assert len(ret) > 0

  ret = filter(lambda key:key.name and
      (key.name.startswith('shaka.') or key.name.startswith('goog.')), ret)
  ret = sorted(ret, key=lambda key:key.name)

  # We need to collapse duplicates.
  i = 0
  while i + 1 < len(ret):
    if ret[i].name == ret[i + 1].name:
      ret[i].size += ret[i + 1].size
      del ret[i + 1]
    else:
     i += 1

  return ret

def printTree(results, indent, callback, endCallback):
  """Prints the results in an indented format.

  Arguments:
    results - An array of FunctionSizes sorted on name.
    indent - A number to indent.
    callback - A callback function to print the data.  Accepts a title, an
      indentation, and a sublist of the items in that group.
    endCallback - A callback function called after a group; can be None.
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
  groupItems = first
  if prefix == len(first):
    # This happens when the group has a first element of a class name and the
    # remaining are member functions.  Remove the first element from this
    # group.
    groupItems = results[1].name.split('.')
    group = 1

  # Start with second element, and go one more so we make sure to process the
  # last group.
  for i in range(1, len(results) + 1):
    items = (results[i].name.split('.') if i != len(results) else
        [''] * (prefix + 1))
    if items[prefix] != groupItems[prefix]:
      title = '.'.join(groupItems[:(prefix + 1)])
      callback(title, indent, results[group:i])

      printTree(results[group:i], indent + 1, callback, endCallback)

      # Set the start of the next group to the current element.
      group = i
      groupItems = items

  if endCallback:
    endCallback(indent)

def printSizes(sizes):
  """Prints the sizes in an indented format.

  Arguments:
    sizes - An array of FunctionSizes sorted on name.
  """
  # This callback is used to print the total sizes of each of the sub-groups.
  # Using the indent as padding allows to print a tree-like structure to
  # show how big each section is.
  def callbackFactory(padding):
    # Use a factory so we capture the padding.
    def callback(title, indent, results):
      if title:
        size = sum(map(lambda key:key.size, results))
        print '%s %*d %s' % (indent * '  ', padding, size, title)
    return callback

  total = sum(map(lambda key:key.size, sizes))
  padding = int(math.ceil(math.log10(total)))

  print '%*d %s' % (padding, total, 'TOTAL')
  printTree(sizes, 0, callbackFactory(padding), None)

def printDeps(results, inDot):
  """Prints the dependencies.

  Arguments:
    results - A sorted array of FunctionDependencies.
    inDot - Whether to print in DOT format.
  """
  if not inDot:
    for func in results:
      name, deps = func.name, func.deps

      # Ignore items with no dependencies.
      if len(deps) > 0:
        print name

      for dep in deps:
        print '  ', dep

    return

  depMap = dict()

  # Use the printTree to produce clusters for each namespace and type.  This
  # will print boxes around each class and show dependencies between types.
  print 'digraph {'
  def callbackFactory(depMap, temp):
    def callback(title, indent, results):
      if title:
        if len(results) > 1:
          print '\t' * indent, 'subgraph', 'cluster' + str(len(temp)), '{'
          temp.append(1)
        else:
          print '\t' * indent, len(depMap), '[', \
              'label="' + results[0].name + '"', ']', ';'
          depMap[results[0].name] = len(depMap)

    return callback
  def endCallback(indent):
    if indent > 1:
      print '\t' * (indent - 1), '}'
  printTree(results, 1, callbackFactory(depMap, []), endCallback)

  for func in results:
    name, deps = func.name, func.deps

    # Ignore items with no dependencies.
    if len(deps) > 0:
      if not name in depMap:
        depMap[name] = len(depMap)
        print '\t', depMap[name], '[', 'label="' + name + '"', ']', ';'

    for dep in deps:
      if not dep in depMap:
        depMap[dep] = len(depMap)
        print '\t', depMap[dep], '[', 'label="' + dep + '"', ']', ';'

      print '\t', depMap[name], '->', depMap[dep], ';'

  print '}'

class Options:
  def __init__(self):
    self.printDeps = False
    self.printSizes = False
    self.printTokens = False
    self.inDot = False
    self.isClass = False

def process(text, options):
  """Decodes a JSON string containing source map data.

  Arguments:
    text - A JSON string containing source map data.
    options - An object containing the command-line options.
  """

  # The spec allows a map file to start with )]} to prevent javascript from
  # including it.
  if text.startswith(')]}\'\n') or text.startswith(')]}\n'):
      _, text = text.split('\n', 1)

  # Decode the JSON data and get the parts we need.
  data = json.loads(text)
  # Paths are relative to the source code root.
  base = shakaBuildHelpers.getSourceBase()
  fileLines = open(os.path.join(base, data['file'])).readlines()
  names = data['names']
  mappings = data['mappings']
  tokens = decodeMappings(mappings, names)
  sizes = processSizes(tokens, fileLines)

  # Print out one of the results.
  if options.printTokens:
    printTokens(tokens, fileLines, sizes)
  elif options.printSizes:
    printSizes(sizes)
  elif options.printDeps or options.isClass:
    temp = processDeps(tokens, fileLines, options.isClass)
    printDeps(temp, options.inDot)

def printHelp():
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
  doneArgs = False
  name = 'shaka-player.compiled.debug.map'

  # Process the command-line arguments.
  for arg in args:
    if doneArgs or arg[0] != '-':
      name = arg
    elif arg == '-f' or arg == '--function-deps':
      options.printDeps = True
    elif arg == '-t' or arg == '--all-tokens':
      options.printTokens = True
    elif arg == '-s' or arg == '--function-sizes':
      options.printSizes = True
    elif arg == '-c' or arg == '--class-deps':
      options.isClass = True
    elif arg == '-d' or arg == '--dot-format':
      options.inDot = True
    elif arg == '--':
      doneArgs = True
    elif arg == '-h' or arg == '--help':
      printHelp()
      return 0
    else:
      print >> sys.stderr, 'Unrecognized argument:', arg
      printHelp()
      return 1

  # Try to find the file
  if not os.path.isfile(name):
    # Get the source code base directory
    base = shakaBuildHelpers.getSourceBase()

    # Supports the following searches:
    # * File name given, map in dist/
    # * Type given, map in working directory
    # * Type given, map in dist/
    if os.path.isfile(os.path.join(base, 'dist' , name)):
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
  if (options.printSizes + options.printDeps + options.printTokens +
      options.isClass) != 1:
    print >> sys.stderr, 'Must include exactly one output type.'
    printHelp()
    return 1
  elif options.inDot and not options.printDeps and not options.isClass:
    print >> sys.stderr, '--dot-format only valid with --function-deps or \
--class-deps.'
    return 1
  else:
    process(open(name).read(), options)
    return 0

if __name__ == '__main__':
  shakaBuildHelpers.runMain(main)

