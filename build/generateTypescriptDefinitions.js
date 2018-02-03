#!/usr/bin/env node

// Load required modules.
const fs = require('fs');
const path = require('path');
const parseExterns = require('./typescript/parseExterns');
const writeTypeDefinitions = require('./typescript/writeTypeDefinitions');

function processFile(inputPath, outputPath) {
  const code = fs.readFileSync(inputPath, 'utf-8');
  const root = parseExterns(code);
  const stream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });
  const typeDefinitions = writeTypeDefinitions(stream, root);
  stream.end();
}

processFile(
  path.join(__dirname, '..', 'dist', 'shaka-player.compiled.externs.js'),
  path.join(__dirname, '..', 'dist', 'shaka-player.compiled.d.ts')
);
