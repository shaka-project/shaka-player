import { Writer, Writable } from "./base";

class BaseWriter implements Writer {
  level = 0;

  increaseLevel(): void {
    this.level++;
  }

  decreaseLevel(): void {
    this.level--;
  }

  getIndentation(): string {
    // Repeat two spaces 'level'-times for indentation
    return "  ".repeat(this.level);
  }

  write(str: string): void {
    throw new Error("Abstract method Writer.write(str) has to be implemented");
  }

  writeLine(str: string): void {
    this.write(this.getIndentation() + str + "\n");
  }

  writeComments(comments: string[]): void {
    if (comments.length > 0) {
      this.writeLine("/**");
      for (const comment of comments) {
        this.writeLine(" * " + comment);
      }
      this.writeLine(" */");
    }
  }
}

class StringWriter extends BaseWriter {
  buffer = "";

  write(str: string): void {
    this.buffer += str;
  }
}

class StreamWriter extends BaseWriter {
  stream: NodeJS.WritableStream;

  constructor(stream: NodeJS.WritableStream) {
    super();
    this.stream = stream;
  }

  write(str: string): void {
    this.stream.write(str);
  }
}

function writeNodes(writer: Writer, nodes: Writable[]) {
  for (const node of nodes) {
    node.write(writer);
  }
}

export function generateTypeDefinitions(definitionRoot: Writable[]) {
  const writer = new StringWriter();
  writeNodes(writer, definitionRoot);
  return writer.buffer;
}

export default function writeTypeDefinitions(
  stream: NodeJS.WritableStream,
  definitionRoot: Writable[]
) {
  const writer = new StreamWriter(stream);
  writeNodes(writer, definitionRoot);
}
