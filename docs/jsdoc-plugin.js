/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// JSDoc plugin to customize jsdoc for Shaka Player

'use strict';

// Define custom tags.
exports.defineTags = function(dictionary) {
  let exportOpts = {
    mustNotHaveValue: true,
    onTagged: function(doclet, tag) {
      doclet.access = 'export';
    },
  };

  // Truly exported by the compiler.
  dictionary.defineTag('export', exportOpts);
  // Interface exported in the generated externs only.
  dictionary.defineTag('exportInterface', exportOpts);
  // A namespace, event, etc. exported only in the docs.
  dictionary.defineTag('exportDoc', exportOpts);

  // For use @namespace should be treated like @class, except that we don't
  // want to show the non-existent constructor.
  let classOpts = dictionary.lookUp('class');
  dictionary.defineTag('namespace', {
    onTagged: function(doclet, tag) {
      classOpts.onTagged(doclet, tag);
      doclet.hideconstructor = true;
    },
  });
};
