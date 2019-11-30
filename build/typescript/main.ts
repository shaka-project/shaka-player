#!/usr/bin/env ts-node
import * as fs from "fs";
import assert from "./assert";
import parseExterns from "./parseExterns";
import buildDefinitionTree from "./buildDefinitionTree";
import writeTypeDefinitions from "./writeTypeDefinitions";
import { patchDefinitions } from "./predefined";

function generateTypeDefinitions(
  outputPath: string,
  inputPaths: string[]
): void {
  const definitions = inputPaths.flatMap(inputPath => {
    const code = fs.readFileSync(inputPath, "utf-8");
    return parseExterns(code);
  });

  const root = buildDefinitionTree(definitions);
  patchDefinitions(root);

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
