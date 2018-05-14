/**
 * @license
 * JSDoc 3 is free software, licensed under the Apache License, Version 2.0 (the
 * "License"). Commercial and non-commercial use are permitted in compliance
 * with the License.
 *
 * Copyright (c) 2011-present Michael Mathews <micmath@gmail.com> and the
 * [contributors to JSDoc](https://github.com/jsdoc3/jsdoc/graphs/contributors).
 * All rights reserved.
 *
 * You may obtain a copy of the License at:
 * http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * @fileoverview Adds line numbers to source code in the docs.
 *
 * Part of the default template in JSDoc.
 */

(function() {
    var source = document.getElementsByClassName('prettyprint source linenums');
    var i = 0;
    var lineNumber = 0;
    var lineId;
    var lines;
    var totalLines;
    var anchorHash;

    if (source && source[0]) {
        anchorHash = document.location.hash.substring(1);
        lines = source[0].getElementsByTagName('li');
        totalLines = lines.length;

        for (; i < totalLines; i++) {
            lineNumber++;
            lineId = 'line' + lineNumber;
            lines[i].id = lineId;
            if (lineId === anchorHash) {
                lines[i].className += ' selected';
            }
        }
    }
})();
