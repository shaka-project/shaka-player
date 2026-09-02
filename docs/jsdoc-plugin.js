/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// JSDoc plugin to customize jsdoc for Shaka Player

'use strict';

// Define custom tags.
exports.defineTags = (dictionary) => {
  const exportOpts = {
    mustNotHaveValue: true,
    onTagged: (doclet, tag) => {
      doclet.access = 'export';
    },
  };

  // Truly exported by the compiler.
  dictionary.defineTag('export', exportOpts);
  // Interface exported in the generated externs only.
  dictionary.defineTag('exportInterface', exportOpts);
  // A namespace, event, etc. exported only in the docs.
  dictionary.defineTag('exportDoc', exportOpts);

  // For us, @namespace should be treated like @class, except that we don't
  // want to show the non-existent constructor.
  const classOpts = dictionary.lookUp('class');
  dictionary.defineTag('namespace', {
    onTagged: (doclet, tag) => {
      classOpts.onTagged(doclet, tag);
      doclet.hideconstructor = true;
    },
  });
};

exports.handlers = {
  processingComplete: (e) => {
    // Fill out the "implementations" field so that interface implementations
    // can be listed on the interface docs.

    const doclets = e.doclets;
    const map = {};
    for (const doc of doclets) {
      map[doc.longname] = doc;
    }

    for (const doc of doclets) {
      // Skip things that do not implement an interface.
      if (!doc.implements) {
        continue;
      }
      // Skip things which are not classes (such as methods).
      if (doc.kind != 'class') {
        continue;
      }

      for (let interfaceName of doc.implements) {
        // If the interface is a template, strip the template type.
        interfaceName = interfaceName.split('.<')[0];

        const interfaceDoc = map[interfaceName];
        // Skip unknown interfaces, which occurs for externs like MediaKeys.
        if (!interfaceDoc) {
          continue;
        }

        interfaceDoc.implementations = interfaceDoc.implementations || [];
        interfaceDoc.implementations.push(doc.longname);
      }
    }
  },
};
