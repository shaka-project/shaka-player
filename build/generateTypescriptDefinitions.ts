#!/usr/bin/env ts-node

// Load required modules.
import * as fs from "fs";
import assert from "./typescript/assert";
import parseExterns from "./typescript/parseExterns";
import buildDefinitionTree from "./typescript/buildDefinitionTree";
import writeTypeDefinitions from "./typescript/writeTypeDefinitions";
import { Definition } from "./typescript/base";

function generateTypeDefinitions(
  outputPath: string,
  inputPaths: string[]
): void {
  const definitions: Definition[] = Array.prototype.concat(
    ...inputPaths.map(inputPath => {
      const code = fs.readFileSync(inputPath, "utf-8");
      return parseExterns(code);
    })
  );
  const root = buildDefinitionTree(definitions);

  const stream = fs.createWriteStream(outputPath, { encoding: "utf-8" });
  writeTypeDefinitions(stream, root);
  stream.end();
}

function main(args: string[]): void {
  const inputPaths: string[] = [];
  let outputPath = "";

  for (let i = 0; i < args.length; ++i) {
    if (args[i] == "--output") {
      outputPath = args[i + 1];
      ++i;
    } else {
      inputPaths.push(args[i]);
    }
  }
  assert(outputPath, "You must specify output file with --output <EXTERNS>");
  assert(inputPaths.length, "You must specify at least one input file.");

  generateTypeDefinitions(outputPath, inputPaths);
}

// Skip argv[0], which is the node binary, and argv[1], which is the script.
main(process.argv.slice(2));
