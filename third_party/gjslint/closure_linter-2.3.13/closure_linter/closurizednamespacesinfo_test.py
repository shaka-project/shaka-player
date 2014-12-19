#!/usr/bin/env python
#
# Copyright 2010 The Closure Linter Authors. All Rights Reserved.
#
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

"""Unit tests for ClosurizedNamespacesInfo."""



import unittest as googletest
from closure_linter import aliaspass
from closure_linter import closurizednamespacesinfo
from closure_linter import ecmametadatapass
from closure_linter import javascriptstatetracker
from closure_linter import javascripttokens
from closure_linter import testutil
from closure_linter import tokenutil

# pylint: disable=g-bad-name
TokenType = javascripttokens.JavaScriptTokenType


class ClosurizedNamespacesInfoTest(googletest.TestCase):
  """Tests for ClosurizedNamespacesInfo."""

  _test_cases = {
      'goog.global.anything': None,
      'package.CONSTANT': 'package',
      'package.methodName': 'package',
      'package.subpackage.methodName': 'package.subpackage',
      'package.subpackage.methodName.apply': 'package.subpackage',
      'package.ClassName.something': 'package.ClassName',
      'package.ClassName.Enum.VALUE.methodName': 'package.ClassName',
      'package.ClassName.CONSTANT': 'package.ClassName',
      'package.namespace.CONSTANT.methodName': 'package.namespace',
      'package.ClassName.inherits': 'package.ClassName',
      'package.ClassName.apply': 'package.ClassName',
      'package.ClassName.methodName.apply': 'package.ClassName',
      'package.ClassName.methodName.call': 'package.ClassName',
      'package.ClassName.prototype.methodName': 'package.ClassName',
      'package.ClassName.privateMethod_': 'package.ClassName',
      'package.className.privateProperty_': 'package.className',
      'package.className.privateProperty_.methodName': 'package.className',
      'package.ClassName.PrivateEnum_': 'package.ClassName',
      'package.ClassName.prototype.methodName.apply': 'package.ClassName',
      'package.ClassName.property.subProperty': 'package.ClassName',
      'package.className.prototype.something.somethingElse': 'package.className'
  }

  def testGetClosurizedNamespace(self):
    """Tests that the correct namespace is returned for various identifiers."""
    namespaces_info = closurizednamespacesinfo.ClosurizedNamespacesInfo(
        closurized_namespaces=['package'], ignored_extra_namespaces=[])
    for identifier, expected_namespace in self._test_cases.items():
      actual_namespace = namespaces_info.GetClosurizedNamespace(identifier)
      self.assertEqual(
          expected_namespace,
          actual_namespace,
          'expected namespace "' + str(expected_namespace) +
          '" for identifier "' + str(identifier) + '" but was "' +
          str(actual_namespace) + '"')

  def testIgnoredExtraNamespaces(self):
    """Tests that ignored_extra_namespaces are ignored."""
    token = self._GetRequireTokens('package.Something')
    namespaces_info = closurizednamespacesinfo.ClosurizedNamespacesInfo(
        closurized_namespaces=['package'],
        ignored_extra_namespaces=['package.Something'])

    self.assertFalse(namespaces_info.IsExtraRequire(token),
                     'Should be valid since it is in ignored namespaces.')

    namespaces_info = closurizednamespacesinfo.ClosurizedNamespacesInfo(
        ['package'], [])

    self.assertTrue(namespaces_info.IsExtraRequire(token),
                    'Should be invalid since it is not in ignored namespaces.')

  def testIsExtraProvide_created(self):
    """Tests that provides for created namespaces are not extra."""
    input_lines = [
        'goog.provide(\'package.Foo\');',
        'package.Foo = function() {};'
    ]

    token, namespaces_info = self._GetStartTokenAndNamespacesInfoForScript(
        input_lines, ['package'])

    self.assertFalse(namespaces_info.IsExtraProvide(token),
                     'Should not be extra since it is created.')

  def testIsExtraProvide_createdIdentifier(self):
    """Tests that provides for created identifiers are not extra."""
    input_lines = [
        'goog.provide(\'package.Foo.methodName\');',
        'package.Foo.methodName = function() {};'
    ]

    token, namespaces_info = self._GetStartTokenAndNamespacesInfoForScript(
        input_lines, ['package'])

    self.assertFalse(namespaces_info.IsExtraProvide(token),
                     'Should not be extra since it is created.')

  def testIsExtraProvide_notCreated(self):
    """Tests that provides for non-created namespaces are extra."""
    input_lines = ['goog.provide(\'package.Foo\');']

    token, namespaces_info = self._GetStartTokenAndNamespacesInfoForScript(
        input_lines, ['package'])

    self.assertTrue(namespaces_info.IsExtraProvide(token),
                    'Should be extra since it is not created.')

  def testIsExtraProvide_duplicate(self):
    """Tests that providing a namespace twice makes the second one extra."""
    input_lines = [
        'goog.provide(\'package.Foo\');',
        'goog.provide(\'package.Foo\');',
        'package.Foo = function() {};'
    ]

    token, namespaces_info = self._GetStartTokenAndNamespacesInfoForScript(
        input_lines, ['package'])

    # Advance to the second goog.provide token.
    token = tokenutil.Search(token.next, TokenType.IDENTIFIER)

    self.assertTrue(namespaces_info.IsExtraProvide(token),
                    'Should be extra since it is already provided.')

  def testIsExtraProvide_notClosurized(self):
    """Tests that provides of non-closurized namespaces are not extra."""
    input_lines = ['goog.provide(\'notclosurized.Foo\');']

    token, namespaces_info = self._GetStartTokenAndNamespacesInfoForScript(
        input_lines, ['package'])

    self.assertFalse(namespaces_info.IsExtraProvide(token),
                     'Should not be extra since it is not closurized.')

  def testIsExtraRequire_used(self):
    """Tests that requires for used namespaces are not extra."""
    input_lines = [
        'goog.require(\'package.Foo\');',
        'var x = package.Foo.methodName();'
    ]

    token, namespaces_info = self._GetStartTokenAndNamespacesInfoForScript(
        input_lines, ['package'])

    self.assertFalse(namespaces_info.IsExtraRequire(token),
                     'Should not be extra since it is used.')

  def testIsExtraRequire_usedIdentifier(self):
    """Tests that requires for used methods on classes are extra."""
    input_lines = [
        'goog.require(\'package.Foo.methodName\');',
        'var x = package.Foo.methodName();'
    ]

    token, namespaces_info = self._GetStartTokenAndNamespacesInfoForScript(
        input_lines, ['package'])

    self.assertTrue(namespaces_info.IsExtraRequire(token),
                    'Should require the package, not the method specifically.')

  def testIsExtraRequire_notUsed(self):
    """Tests that requires for unused namespaces are extra."""
    input_lines = ['goog.require(\'package.Foo\');']

    token, namespaces_info = self._GetStartTokenAndNamespacesInfoForScript(
        input_lines, ['package'])

    self.assertTrue(namespaces_info.IsExtraRequire(token),
                    'Should be extra since it is not used.')

  def testIsExtraRequire_notClosurized(self):
    """Tests that requires of non-closurized namespaces are not extra."""
    input_lines = ['goog.require(\'notclosurized.Foo\');']

    token, namespaces_info = self._GetStartTokenAndNamespacesInfoForScript(
        input_lines, ['package'])

    self.assertFalse(namespaces_info.IsExtraRequire(token),
                     'Should not be extra since it is not closurized.')

  def testIsExtraRequire_objectOnClass(self):
    """Tests that requiring an object on a class is extra."""
    input_lines = [
        'goog.require(\'package.Foo.Enum\');',
        'var x = package.Foo.Enum.VALUE1;',
    ]

    token, namespaces_info = self._GetStartTokenAndNamespacesInfoForScript(
        input_lines, ['package'])

    self.assertTrue(namespaces_info.IsExtraRequire(token),
                    'The whole class, not the object, should be required.');

  def testIsExtraRequire_constantOnClass(self):
    """Tests that requiring a constant on a class is extra."""
    input_lines = [
        'goog.require(\'package.Foo.CONSTANT\');',
        'var x = package.Foo.CONSTANT',
    ]

    token, namespaces_info = self._GetStartTokenAndNamespacesInfoForScript(
        input_lines, ['package'])

    self.assertTrue(namespaces_info.IsExtraRequire(token),
                    'The class, not the constant, should be required.');

  def testIsExtraRequire_constantNotOnClass(self):
    """Tests that requiring a constant not on a class is OK."""
    input_lines = [
        'goog.require(\'package.subpackage.CONSTANT\');',
        'var x = package.subpackage.CONSTANT',
    ]

    token, namespaces_info = self._GetStartTokenAndNamespacesInfoForScript(
        input_lines, ['package'])

    self.assertFalse(namespaces_info.IsExtraRequire(token),
                    'Constants can be required except on classes.');

  def testIsExtraRequire_methodNotOnClass(self):
    """Tests that requiring a method not on a class is OK."""
    input_lines = [
        'goog.require(\'package.subpackage.method\');',
        'var x = package.subpackage.method()',
    ]

    token, namespaces_info = self._GetStartTokenAndNamespacesInfoForScript(
        input_lines, ['package'])

    self.assertFalse(namespaces_info.IsExtraRequire(token),
                    'Methods can be required except on classes.');

  def testIsExtraRequire_defaults(self):
    """Tests that there are no warnings about extra requires for test utils"""
    input_lines = ['goog.require(\'goog.testing.jsunit\');']

    token, namespaces_info = self._GetStartTokenAndNamespacesInfoForScript(
        input_lines, ['goog'])

    self.assertFalse(namespaces_info.IsExtraRequire(token),
                     'Should not be extra since it is for testing.')

  def testGetMissingProvides_provided(self):
    """Tests that provided functions don't cause a missing provide."""
    input_lines = [
        'goog.provide(\'package.Foo\');',
        'package.Foo = function() {};'
    ]

    namespaces_info = self._GetNamespacesInfoForScript(
        input_lines, ['package'])

    self.assertEquals(0, len(namespaces_info.GetMissingProvides()))

  def testGetMissingProvides_providedIdentifier(self):
    """Tests that provided identifiers don't cause a missing provide."""
    input_lines = [
        'goog.provide(\'package.Foo.methodName\');',
        'package.Foo.methodName = function() {};'
    ]

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['package'])
    self.assertEquals(0, len(namespaces_info.GetMissingProvides()))

  def testGetMissingProvides_providedParentIdentifier(self):
    """Tests that provided identifiers on a class don't cause a missing provide
    on objects attached to that class."""
    input_lines = [
        'goog.provide(\'package.foo.ClassName\');',
        'package.foo.ClassName.methodName = function() {};',
        'package.foo.ClassName.ObjectName = 1;',
    ]

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['package'])
    self.assertEquals(0, len(namespaces_info.GetMissingProvides()))

  def testGetMissingProvides_unprovided(self):
    """Tests that unprovided functions cause a missing provide."""
    input_lines = ['package.Foo = function() {};']

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['package'])

    missing_provides = namespaces_info.GetMissingProvides()
    self.assertEquals(1, len(missing_provides))
    missing_provide = missing_provides.popitem()
    self.assertEquals('package.Foo', missing_provide[0])
    self.assertEquals(1, missing_provide[1])

  def testGetMissingProvides_privatefunction(self):
    """Tests that unprovided private functions don't cause a missing provide."""
    input_lines = ['package.Foo_ = function() {};']

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['package'])
    self.assertEquals(0, len(namespaces_info.GetMissingProvides()))

  def testGetMissingProvides_required(self):
    """Tests that required namespaces don't cause a missing provide."""
    input_lines = [
        'goog.require(\'package.Foo\');',
        'package.Foo.methodName = function() {};'
    ]

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['package'])
    self.assertEquals(0, len(namespaces_info.GetMissingProvides()))

  def testGetMissingRequires_required(self):
    """Tests that required namespaces don't cause a missing require."""
    input_lines = [
        'goog.require(\'package.Foo\');',
        'package.Foo();'
    ]

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['package'])
    self.assertEquals(0, len(namespaces_info.GetMissingProvides()))

  def testGetMissingRequires_requiredIdentifier(self):
    """Tests that required namespaces satisfy identifiers on that namespace."""
    input_lines = [
        'goog.require(\'package.Foo\');',
        'package.Foo.methodName();'
    ]

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['package'])
    self.assertEquals(0, len(namespaces_info.GetMissingProvides()))

  def testGetMissingRequires_requiredParentClass(self):
    """Tests that requiring a parent class of an object is sufficient to prevent
    a missing require on that object."""
    input_lines = [
        'goog.require(\'package.Foo\');',
        'package.Foo.methodName();',
        'package.Foo.methodName(package.Foo.ObjectName);'
    ]

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['package'])
    self.assertEquals(0, len(namespaces_info.GetMissingRequires()))

  def testGetMissingRequires_unrequired(self):
    """Tests that unrequired namespaces cause a missing require."""
    input_lines = ['package.Foo();']

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['package'])

    missing_requires = namespaces_info.GetMissingRequires()
    self.assertEquals(1, len(missing_requires))
    missing_req = missing_requires.popitem()
    self.assertEquals('package.Foo', missing_req[0])
    self.assertEquals(1, missing_req[1])

  def testGetMissingRequires_provided(self):
    """Tests that provided namespaces satisfy identifiers on that namespace."""
    input_lines = [
        'goog.provide(\'package.Foo\');',
        'package.Foo.methodName();'
    ]

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['package'])
    self.assertEquals(0, len(namespaces_info.GetMissingRequires()))

  def testGetMissingRequires_created(self):
    """Tests that created namespaces do not satisfy usage of an identifier."""
    input_lines = [
        'package.Foo = function();',
        'package.Foo.methodName();',
        'package.Foo.anotherMethodName1();',
        'package.Foo.anotherMethodName2();'
    ]

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['package'])

    missing_requires = namespaces_info.GetMissingRequires()
    self.assertEquals(1, len(missing_requires))
    missing_require = missing_requires.popitem()
    self.assertEquals('package.Foo', missing_require[0])
    # Make sure line number of first occurrence is reported
    self.assertEquals(2, missing_require[1])

  def testGetMissingRequires_createdIdentifier(self):
    """Tests that created identifiers satisfy usage of the identifier."""
    input_lines = [
        'package.Foo.methodName = function();',
        'package.Foo.methodName();'
    ]

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['package'])
    self.assertEquals(0, len(namespaces_info.GetMissingRequires()))

  def testGetMissingRequires_objectOnClass(self):
    """Tests that we should require a class, not the object on the class."""
    input_lines = [
        'goog.require(\'package.Foo.Enum\');',
        'var x = package.Foo.Enum.VALUE1;',
    ]

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['package'])
    self.assertEquals(1, len(namespaces_info.GetMissingRequires()),
                      'The whole class, not the object, should be required.')

  def testGetMissingRequires_variableWithSameName(self):
    """Tests that we should not goog.require variables and parameters.

    b/5362203 Variables in scope are not missing namespaces.
    """
    input_lines = [
        'goog.provide(\'Foo\');',
        'Foo.A = function();',
        'Foo.A.prototype.method = function(ab) {',
        '  if (ab) {',
        '    var docs;',
        '    var lvalue = new Obj();',
        '    // Variable in scope hence not goog.require here.',
        '    docs.foo.abc = 1;',
        '    lvalue.next();',
        '  }',
        '  // Since js is function scope this should also not goog.require.',
        '  docs.foo.func();',
        '  // Its not a variable in scope hence goog.require.',
        '  dummy.xyz.reset();',
        ' return this.method2();',
        '};',
        'Foo.A.prototype.method1 = function(docs, abcd, xyz) {',
        '  // Parameter hence not goog.require.',
        '  docs.nodes.length = 2;',
        '  lvalue.abc.reset();',
        '};'
    ]

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['Foo',
                                                                     'docs',
                                                                     'lvalue',
                                                                     'dummy'])
    missing_requires = namespaces_info.GetMissingRequires()
    self.assertEquals(2, len(missing_requires))
    self.assertItemsEqual(
        {'dummy.xyz': 14,
         'lvalue.abc': 20}, missing_requires)

  def testIsFirstProvide(self):
    """Tests operation of the isFirstProvide method."""
    input_lines = [
        'goog.provide(\'package.Foo\');',
        'package.Foo.methodName();'
    ]

    token, namespaces_info = self._GetStartTokenAndNamespacesInfoForScript(
        input_lines, ['package'])
    self.assertTrue(namespaces_info.IsFirstProvide(token))

  def testGetWholeIdentifierString(self):
    """Tests that created identifiers satisfy usage of the identifier."""
    input_lines = [
        'package.Foo.',
        '    veryLong.',
        '    identifier;'
    ]

    token = testutil.TokenizeSource(input_lines)

    self.assertEquals('package.Foo.veryLong.identifier',
                      tokenutil.GetIdentifierForToken(token))

    self.assertEquals(None,
                      tokenutil.GetIdentifierForToken(token.next))

  def testScopified(self):
    """Tests that a goog.scope call is noticed."""
    input_lines = [
        'goog.scope(function() {',
        '});'
        ]

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['goog'])
    self.assertTrue(namespaces_info._scopified_file)

  def testScope_unusedAlias(self):
    """Tests that an used alias symbol doesn't result in a require."""
    input_lines = [
        'goog.scope(function() {',
        'var Event = goog.events.Event;',
        '});'
        ]

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['goog'])
    missing_requires = namespaces_info.GetMissingRequires()
    self.assertEquals({}, missing_requires)

  def testScope_usedAlias(self):
    """Tests that aliased symbols result in correct requires."""
    input_lines = [
        'goog.scope(function() {',
        'var Event = goog.events.Event;',
        'var dom = goog.dom;',
        'Event(dom.classes.get);',
        '});'
        ]

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['goog'])
    missing_requires = namespaces_info.GetMissingRequires()
    self.assertEquals({'goog.dom.classes': 4, 'goog.events.Event': 4},
                      missing_requires)

  def testScope_provides(self):
    """Tests that aliased symbols result in correct provides."""
    input_lines = [
        'goog.scope(function() {',
        'goog.bar = {};',
        'var bar = goog.bar;',
        'bar.Foo = {};',
        '});'
        ]

    namespaces_info = self._GetNamespacesInfoForScript(input_lines, ['goog'])
    missing_provides = namespaces_info.GetMissingProvides()
    self.assertEquals({'goog.bar.Foo': 4}, missing_provides)

  def testSetTestOnlyNamespaces(self):
    """Tests that a namespace in setTestOnly makes it a valid provide."""
    namespaces_info = self._GetNamespacesInfoForScript([
        'goog.setTestOnly(\'goog.foo.barTest\');'
        ], ['goog'])

    token = self._GetProvideTokens('goog.foo.barTest')
    self.assertFalse(namespaces_info.IsExtraProvide(token))

    token = self._GetProvideTokens('goog.foo.bazTest')
    self.assertTrue(namespaces_info.IsExtraProvide(token))

  def testSetTestOnlyComment(self):
    """Ensure a comment in setTestOnly does not cause a created namespace."""
    namespaces_info = self._GetNamespacesInfoForScript([
        'goog.setTestOnly(\'this is a comment\');'
        ], ['goog'])

    self.assertEquals(
        [], namespaces_info._created_namespaces,
        'A comment in setTestOnly should not modify created namespaces.')

  def _GetNamespacesInfoForScript(self, script, closurized_namespaces=None):
    _, namespaces_info = self._GetStartTokenAndNamespacesInfoForScript(
        script, closurized_namespaces)

    return namespaces_info

  def _GetStartTokenAndNamespacesInfoForScript(
      self, script, closurized_namespaces):

    token = testutil.TokenizeSource(script)
    return token, self._GetInitializedNamespacesInfo(
        token, closurized_namespaces, [])

  def _GetInitializedNamespacesInfo(self, token, closurized_namespaces,
                                    ignored_extra_namespaces):
    """Returns a namespaces info initialized with the given token stream."""
    namespaces_info = closurizednamespacesinfo.ClosurizedNamespacesInfo(
        closurized_namespaces=closurized_namespaces,
        ignored_extra_namespaces=ignored_extra_namespaces)
    state_tracker = javascriptstatetracker.JavaScriptStateTracker()

    ecma_pass = ecmametadatapass.EcmaMetaDataPass()
    ecma_pass.Process(token)

    alias_pass = aliaspass.AliasPass(closurized_namespaces)
    alias_pass.Process(token)

    while token:
      state_tracker.HandleToken(token, state_tracker.GetLastNonSpaceToken())
      namespaces_info.ProcessToken(token, state_tracker)
      state_tracker.HandleAfterToken(token)
      token = token.next

    return namespaces_info

  def _GetProvideTokens(self, namespace):
    """Returns a list of tokens for a goog.require of the given namespace."""
    line_text = 'goog.require(\'' + namespace + '\');\n'
    return testutil.TokenizeSource([line_text])

  def _GetRequireTokens(self, namespace):
    """Returns a list of tokens for a goog.require of the given namespace."""
    line_text = 'goog.require(\'' + namespace + '\');\n'
    return testutil.TokenizeSource([line_text])

if __name__ == '__main__':
  googletest.main()
