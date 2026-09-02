#!/usr/bin/env node
/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 *
 * A node script that uses the Jimp and ssim modules to compute if two images
 * are different enough to warrant updating.
 */

const Jimp = require('jimp');
const {ssim} = require('ssim.js');

/**
 * Compare two images and output the similarity between 0 and 1.  Uses the same
 * comparisons done in the tests through Karma.
 *
 * @param {string} oldPath
 * @param {string} newPath
 */
async function main(oldPath, newPath) {
  const oldScreenshot = await Jimp.read(oldPath);
  const newScreenshot = await Jimp.read(newPath);
  const ssimResult = ssim(oldScreenshot.bitmap, newScreenshot.bitmap);
  console.log(ssimResult.mssim);  // A score between 0 and 1.
}

main(process.argv[2], process.argv[3]);
