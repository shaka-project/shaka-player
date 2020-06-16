#!/usr/bin/env node
/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 *
 * A node script that uses the Jimp module to compute the number of changed
 * pixels between two images.
 */

const Jimp = require('jimp');

async function main(oldPath, newPath) {
  const oldImage = await Jimp.read(oldPath);
  const newImage = await Jimp.read(newPath);
  const diff = Jimp.diff(oldImage, newImage, /* threshold= */ 0);
  // "percent" is, surprisingly, a number between 0 and 1, not between 0 and
  // 100.  Convert this to a number of pixels.
  const pixelsChanged =
      diff.percent * diff.image.bitmap.width * diff.image.bitmap.height;
  console.log(pixelsChanged);
}

main(process.argv[2], process.argv[3]);
