#!/usr/bin/env node

// Load required modules.
const fs = require('fs');
const assert = require('assert').strict;
const parseExterns = require('./typescript/parseExterns');
const buildDefinitionTree = require('./typescript/buildDefinitionTree');
const writeTypeDefinitions = require('./typescript/writeTypeDefinitions');

function generateTypeDefinitions(outputPath, inputPaths) {
  const definitions = [].concat(...inputPaths.map((inputPath) => {
    const code = fs.readFileSync(inputPath, 'utf-8');
    return parseExterns(code);
  }));
  const root = buildDefinitionTree(definitions);

  const stream = fs.createWriteStream(outputPath, {encoding: 'utf-8'});
  writeTypeDefinitions(stream, root);
  stream.end();
}

function main(args) {
  const inputPaths = [];
  let outputPath;

  for (let i = 0; i < args.length; ++i) {
    if (args[i] == '--output') {
      outputPath = args[i + 1];
      ++i;
    } else {
      inputPaths.push(args[i]);
    }
  }
  assert(outputPath, 'You must specify output file with --output <EXTERNS>');
  assert(inputPaths.length,
      'You must specify at least one input file.');

  generateTypeDefinitions(outputPath, inputPaths);
}


// Skip argv[0], which is the node binary, and argv[1], which is the script.
main(process.argv.slice(2));
