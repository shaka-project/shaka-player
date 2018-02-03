// Primitive types are not nullable in Closure unless marked as such.
// Keep a list of primitives to properly set the nullable flag.
// Aside of that, type names are the same in Closure and TypeScript so a
// mapping of type names is not necessary.
// Enum nullability works the same with regards to the enum's base type.
const primitiveTypes = [
  'null',
  'undefined',
  'boolean',
  'number',
  'string',
];

class AbstractWriter {
  constructor() {
    this.indentationLevel = 0;
  }

  indent() {
    this.indentationLevel++;
  }

  outdent() {
    this.indentationLevel--;
  }

  getIndentation() {
    // Repeat two spaces 'level'-times for indentation
    return '  '.repeat(this.indentationLevel);
  }
}

class StringWriter extends AbstractWriter {
  constructor() {
    super();
    this.buffer = '';
  }

  writeLine(str) {
    this.buffer += this.getIndentation() + str + '\n';
  }
}

class StreamWriter extends AbstractWriter {
  constructor(stream) {
    super();
    this.stream = stream;
  }

  writeLine(str) {
    this.stream.write(this.getIndentation() + str + '\n');
  }
}

function generateType(rawType) {
  console.log(rawType);
  return 'any';
}

function getNodeAtPath(root, path) {
  let nodes = root;
  let node = null;
  for (const part of path) {
    node = nodes.get(part);
    if (!node) {
      return null;
    }
    nodes = node.children;
  }
  return node;
}

function writeClassNode(writer, root, node) {
  const staticProperties = [];
  const staticMethods = [];
  const properties = [];
  const methods = [];
  const others = [];
  const prototype = node.children.get('prototype');

  let interfaceNode = null;
  const interfaceIdentifier = node.definition.attributes.implements;
  if (interfaceIdentifier) {
    interfaceNode = getNodeAtPath(root, interfaceIdentifier.name.split('.'));
  }

  // Gather all static members
  for (const child of node.children.values()) {
    if (child.name === 'prototype') {
      continue;
    }
    console.assert(
      child.definition !== null,
      'Unexpected child without definition in class definition:',
      child
    );

    const type = child.definition.attributes.type || child.definition.type;
    switch (child.definition.type) {
      case 'const':
        staticProperties.push(child);
        break;
      case 'property':
        staticProperties.push(child);
        break;
      case 'function':
        staticMethods.push(child);
        break;
      default:
        others.push(child);
    }
  }

  // Gather all prototype members
  for (const child of prototype.children.values()) {
    console.assert(
      child.definition !== null,
      'Unexpected child without definition in class definition:',
      child
    );

    const type = child.definition.attributes.type || child.definition.type;
    switch (child.definition.type) {
      case 'const':
        properties.push(child);
        break;
      case 'property':
        properties.push(child);
        break;
      case 'function':
        methods.push(child);
        break;
      default:
        console.error(
          'Found unexpected node type', type, 'in class definition'
        );
    }
  }

  // TODO: Handle implements and extends
  writer.writeLine(`class ${node.name} {`);
  writer.indent();

  // Static properties
  for (const propNode of staticProperties) {
    const attributes = propNode.definition.attributes;
    const isConst = attributes.type === 'const';
    const rawType = isConst ? attributes.constType : attributes.propType;
    const type = generateType(rawType);
    writer.writeLine(
      `static ${isConst ? 'readonly ' : ''}${propNode.name}: ${type};`
    );
  }

  // Static methods
  for (const methodNode of staticMethods) {
    writeFunctionNode(writer, methodNode, 'static');
  }

  // Properties
  for (const propNode of properties) {
    const attributes = propNode.definition.attributes;
    const isConst = attributes.type === 'const';
    const rawType = isConst ? attributes.constType : attributes.propType;
    const type = generateType(rawType);
    writer.writeLine(
      `${isConst ? 'readonly ' : ''}${propNode.name}: ${type};`
    );
  }

  // Constructor
  writeFunctionNode(writer, node, null, true);

  // Methods
  for (const methodNode of methods) {
    writeFunctionNode(writer, methodNode, null);
  }

  writer.outdent();
  writer.writeLine('}');

  if (others.length > 0) {
    writer.writeLine(`namespace ${node.name} {`);
    writer.indent();
    writeNodes(writer, root, others);
    writer.outdent();
    writer.writeLine('}');
  }
}

function writeFunctionNode(
  writer,
  node,
  keyword = 'function',
  isConstructor = false
) {
  const attributes = node.definition.attributes;
  const paramTypes = attributes.paramTypes || {};

  writeComments(writer, attributes.comments);

  const params = node.definition.params.map((name) => {
    const type = paramTypes[name] || 'any';
    console.assert(
      type !== undefined,
      'Missing type information for parameter',
      name,
      'in function',
      node.definition.identifier.join('.')
    );
    return `${name}: ${generateType(type)}`;
  }).join(', ');

  const returnType = attributes.returnType
    ? generateType(attributes.returnType)
    : 'void';

  const name = isConstructor ? 'constructor' : node.name;

  writer.writeLine(
    (keyword ? keyword + ' ' : '') +
    `${name}(${params})` +
    (isConstructor ? ';' : `: ${returnType};`)
  );
}

function writeEnumNode(writer, node) {
  const definition = node.definition;
  console.assert(
    definition.type === 'object',
    'Expected enum',
    node.name,
    'to be defined with an object, got',
    definition.type
  );
  writeComments(writer, definition.attributes.comments);
  writer.writeLine(`enum ${node.name} {`);
  writer.indent();
  for (const prop of definition.props) {
    writer.writeLine(prop + ',');
  }
  writer.outdent();
  writer.writeLine(`}`);
}

function writeComments(writer, comments) {
  // TODO: Handle max line length and newlines in comment
  if (comments.length > 0) {
    writer.writeLine('/**');
    for (const comment of comments) {
      writer.writeLine(' * ' + comment);
    }
    writer.writeLine(' */');
  }
}

function writeNode(writer, root, node) {
  if (node.definition === null) {
    // Write namespace to writer
    writer.writeLine(`namespace ${node.name} {`);
    writer.indent();
    writeNodes(writer, root, node.children.values());
    writer.outdent();
    writer.writeLine('}');
    return;
  }

  const definition = node.definition;
  const attributes = definition.attributes;

  // If the doc comment didn't lead to a type, fall back to the type we got
  // from the declaration itself.
  // Types: const, enum, class, interface, function, property, object
  const type = attributes.type || definition.type;
  switch (type) {
    case 'class':
      writeClassNode(writer, root, node);
      break;
    case 'interface':
      writeComments(writer, attributes.comments);
      writer.writeLine(`interface ${node.name} {`);
      writer.writeLine(`}`);
      break;
    case 'enum':
      writeEnumNode(writer, node);
      break;
    case 'const': {
      writeComments(writer, attributes.comments);
      const constType = generateType(attributes.constType);
      writer.writeLine(`const ${node.name}: ${constType};`);
      break;
    }
    case 'function':
      writeFunctionNode(writer, node);
      break;
    default:
      console.error('Unexpected definition type', type);
  }
}

function writeNodes(writer, root, nodes) {
  for (const node of nodes) {
    writeNode(writer, root, node);
  }
}

function generateTypeDefinitions(definitionRoot) {
  const writer = new StringWriter();
  writeNodes(writer, definitionRoot, definitionRoot.values());
  return writer.buffer;
}

function writeTypeDefinitions(stream, definitionRoot) {
  const writer = new StreamWriter(stream);
  writeNodes(writer, definitionRoot, definitionRoot.values());
}

module.exports = writeTypeDefinitions;
