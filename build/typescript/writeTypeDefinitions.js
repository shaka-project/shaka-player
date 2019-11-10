const {getNodeAtPath} = require('./treeUtils');
const generateType = require('./generateType');

class Writer {
  constructor() {
    this.level = 0;
  }

  increaseLevel() {
    this.level++;
  }

  decreaseLevel() {
    this.level--;
  }

  getIndentation() {
    // Repeat two spaces 'level'-times for indentation
    return '  '.repeat(this.level);
  }

  // eslint-disable-next-line class-methods-use-this
  write(str) {
    throw new Error('Abstract method Writer.write(str) has to be implemented');
  }

  writeLine(str) {
    this.write(this.getIndentation() + str + '\n');
  }

  writeComments(comments) {
    if (comments.length > 0) {
      this.writeLine('/**');
      for (const comment of comments) {
        this.writeLine(' * ' + comment);
      }
      this.writeLine(' */');
    }
  }
}

class StringWriter extends Writer {
  constructor() {
    super();
    this.buffer = '';
  }

  write(str) {
    this.buffer += str;
  }
}

class StreamWriter extends Writer {
  constructor(stream) {
    super();
    this.stream = stream;
  }

  write(str) {
    this.stream.write(str);
  }
}

function writeNodes(writer, nodes) {
  for (const node of nodes) {
    node.write(writer);
  }
}

function generateTypeDefinitions(definitionRoot) {
  const writer = new StringWriter();
  writeNodes(writer, definitionRoot);
  return writer.buffer;
}

function writeTypeDefinitions(stream, definitionRoot) {
  const writer = new StreamWriter(stream);
  writeNodes(writer, definitionRoot);
}

module.exports = writeTypeDefinitions;
