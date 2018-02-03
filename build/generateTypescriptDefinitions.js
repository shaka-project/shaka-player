#!/usr/bin/env node

// Load required modules.
const fs = require('fs');
const path = require('path');
const parseExterns = require('./typescript/parseExterns');
const buildDefinitionTree = require('./typescript/buildDefinitionTree');
const writeTypeDefinitions = require('./typescript/writeTypeDefinitions');

function processFile(outputPath, ...inputPaths) {
  const definitions = [].concat(...inputPaths.map((inputPath) => {
    const code = fs.readFileSync(inputPath, 'utf-8');
    return parseExterns(code);
  }));
  const root = buildDefinitionTree(definitions);

  const stream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });
  writeTypeDefinitions(stream, root);
  stream.end();
}

processFile(
  path.join(__dirname, '..', 'dist', 'shaka-player.compiled.d.ts'),
  ...process.argv.slice(2)
);
