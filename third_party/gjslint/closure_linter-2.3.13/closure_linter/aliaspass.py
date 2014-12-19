#!/usr/bin/env python
#
# Copyright 2012 The Closure Linter Authors. All Rights Reserved.
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS-IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Pass that scans for goog.scope aliases and lint/usage errors."""

# Allow non-Google copyright
# pylint: disable=g-bad-file-header

__author__ = ('nnaze@google.com (Nathan Naze)')

import itertools

from closure_linter import ecmametadatapass
from closure_linter import errors
from closure_linter import javascripttokens
from closure_linter import scopeutil
from closure_linter import tokenutil
from closure_linter.common import error


# TODO(nnaze): Create a Pass interface and move this class, EcmaMetaDataPass,
# and related classes onto it.


def _GetAliasForIdentifier(identifier, alias_map):
  """Returns the aliased_symbol name for an identifier.

  Example usage:
    >>> alias_map = {'MyClass': 'goog.foo.MyClass'}
    >>> _GetAliasForIdentifier('MyClass.prototype.action', alias_map)
    'goog.foo.MyClass.prototype.action'

    >>> _GetAliasForIdentifier('MyClass.prototype.action', {})
    None

  Args:
    identifier: The identifier.
    alias_map: A dictionary mapping a symbol to an alias.

  Returns:
    The aliased symbol name or None if not found.
  """
  ns = identifier.split('.', 1)[0]
  aliased_symbol = alias_map.get(ns)
  if aliased_symbol:
    return aliased_symbol + identifier[len(ns):]


class AliasPass(object):
  """Pass to identify goog.scope() usages.

  Identifies goog.scope() usages and finds lint/usage errors.  Notes any
  aliases of symbols in Closurized namespaces (that is, reassignments
  such as "var MyClass = goog.foo.MyClass;") and annotates identifiers
  when they're using an alias (so they may be expanded to the full symbol
  later -- that "MyClass.prototype.action" refers to
  "goog.foo.MyClass.prototype.action" when expanded.).
  """

  def __init__(self, closurized_namespaces=None, error_handler=None):
    """Creates a new pass.

    Args:
      closurized_namespaces: A set of Closurized namespaces (e.g. 'goog').
      error_handler: An error handler to report lint errors to.
    """

    self._error_handler = error_handler

    # If we have namespaces, freeze the set.
    if closurized_namespaces:
      closurized_namespaces = frozenset(closurized_namespaces)

    self._closurized_namespaces = closurized_namespaces

  def Process(self, start_token):
    """Runs the pass on a token stream.

    Args:
      start_token: The first token in the stream.
    """

    # TODO(nnaze): Add more goog.scope usage checks.
    self._CheckGoogScopeCalls(start_token)

    # If we have closurized namespaces, identify aliased identifiers.
    if self._closurized_namespaces:
      context = start_token.metadata.context
      root_context = context.GetRoot()
      self._ProcessRootContext(root_context)

  def _CheckGoogScopeCalls(self, start_token):
    """Check goog.scope calls for lint/usage errors."""

    def IsScopeToken(token):
      return (token.type is javascripttokens.JavaScriptTokenType.IDENTIFIER and
              token.string == 'goog.scope')

    # Find all the goog.scope tokens in the file
    scope_tokens = [t for t in start_token if IsScopeToken(t)]

    for token in scope_tokens:
      scope_context = token.metadata.context

      if not (scope_context.type == ecmametadatapass.EcmaContext.STATEMENT and
              scope_context.parent.type == ecmametadatapass.EcmaContext.ROOT):
        self._MaybeReportError(
            error.Error(errors.INVALID_USE_OF_GOOG_SCOPE,
                        'goog.scope call not in global scope', token))

    # There should be only one goog.scope reference.  Register errors for
    # every instance after the first.
    for token in scope_tokens[1:]:
      self._MaybeReportError(
          error.Error(errors.EXTRA_GOOG_SCOPE_USAGE,
                      'More than one goog.scope call in file.', token))

  def _MaybeReportError(self, err):
    """Report an error to the handler (if registered)."""
    if self._error_handler:
      self._error_handler.HandleError(err)

  @classmethod
  def _YieldAllContexts(cls, context):
    """Yields all contexts that are contained by the given context."""
    yield context
    for child_context in context.children:
      for descendent_child in cls._YieldAllContexts(child_context):
        yield descendent_child

  @staticmethod
  def _IsTokenInParentBlock(token, parent_block):
    """Determines whether the given token is contained by the given block.

    Args:
      token: A token
      parent_block: An EcmaContext.

    Returns:
      Whether the token is in a context that is or is a child of the given
      parent_block context.
    """
    context = token.metadata.context

    while context:
      if context is parent_block:
        return True
      context = context.parent

    return False

  def _ProcessRootContext(self, root_context):
    """Processes all goog.scope blocks under the root context."""

    assert root_context.type is ecmametadatapass.EcmaContext.ROOT

    # Identify all goog.scope blocks.
    goog_scope_blocks = itertools.ifilter(
        scopeutil.IsGoogScopeBlock,
        self._YieldAllContexts(root_context))

    # Process each block to find aliases.
    for scope_block in goog_scope_blocks:
      self._ProcessGoogScopeBlock(scope_block)

  def _ProcessGoogScopeBlock(self, scope_block):
    """Scans a goog.scope block to find aliases and mark alias tokens."""

    alias_map = dict()

    # Iterate over every token in the scope_block. Each token points to one
    # context, but multiple tokens may point to the same context. We only want
    # to check each context once, so keep track of those we've seen.
    seen_contexts = set()
    token = scope_block.start_token
    while token and self._IsTokenInParentBlock(token, scope_block):

      token_context = token.metadata.context

      # Check to see if this token is an alias.
      if token_context not in seen_contexts:
        seen_contexts.add(token_context)

        # If this is a alias statement in the goog.scope block.
        if (token_context.type == ecmametadatapass.EcmaContext.VAR and
            token_context.parent.parent is scope_block):
          match = scopeutil.MatchAlias(token_context.parent)

          # If this is an alias, remember it in the map.
          if match:
            alias, symbol = match
            symbol = _GetAliasForIdentifier(symbol, alias_map) or symbol
            if scopeutil.IsInClosurizedNamespace(symbol,
                                                 self._closurized_namespaces):
              alias_map[alias] = symbol

      # If this token is an identifier that matches an alias,
      # mark the token as an alias to the original symbol.
      if (token.type is javascripttokens.JavaScriptTokenType.SIMPLE_LVALUE or
          token.type is javascripttokens.JavaScriptTokenType.IDENTIFIER):
        identifier = tokenutil.GetIdentifierForToken(token)
        if identifier:
          aliased_symbol = _GetAliasForIdentifier(identifier, alias_map)
          if aliased_symbol:
            token.metadata.aliased_symbol = aliased_symbol

      token = token.next  # Get next token
