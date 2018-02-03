const { getNodeAtPath } = require('./treeUtils');
const generateType = require('./generateType');

class AbstractWriter {
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

function writeClassNode(writer, root, node) {
  const staticProperties = [];
  const staticMethods = [];
  const properties = [];
  const methods = [];
  const others = [];
  // Class might consist of only a constructor
  // Prototype defaults to empty in that case
  const prototype = node.children.get('prototype') || { children: new Map() };

  // Find interfaces for classes with implements keyword
  const interfaceName = node.definition.attributes.implements;
  const interface = interfaceName &&
    getNodeAtPath(root, interfaceName.split('.'));
  if (interface != null) {
    const attributes = interface.definition.attributes;
    // Only allow names of interfaces or typedefs for @implements
    console.assert(
      attributes.type === 'interface' ||
      attributes.type === 'typedef',
      'Expected name of interface or typedef after implements keyword, got',
      attributes.type
    );
  }
  // If interface could not be found, still proceed.
  // We assume the interface is a native interface in that case,
  // defined by one of TypeScript's base libs.

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
    switch (type) {
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

  const attributes = node.definition.attributes;
  let classDeclaration = node.name;
  if (attributes.extends) {
    classDeclaration += ' extends ' + attributes.extends;
  }
  if (attributes.implements) {
    classDeclaration += ' implements ' + attributes.implements;
  }

  // Include construcotr description before class declaration as well,
  // as they can describe the constructor, the class, or both.
  writeComments(writer, [node.definition.attributes.description]);
  writer.writeLine(`class ${classDeclaration} {`);
  writer.increaseLevel();

  // Static properties
  for (const propNode of staticProperties) {
    const attributes = propNode.definition.attributes;
    const isConst = attributes.type === 'const';
    const rawType = isConst ? attributes.constType : attributes.propType;
    const type = generateType(root, rawType);
    writer.writeLine(
      `static ${isConst ? 'readonly ' : ''}${propNode.name}: ${type};`
    );
  }

  // Static methods
  for (const methodNode of staticMethods) {
    writeFunctionNode(writer, root, methodNode, 'static');
  }

  // Properties
  for (const propNode of properties) {
    const attributes = propNode.definition.attributes;
    let isConst = attributes.type === 'const';
    let rawType = isConst ? attributes.constType : attributes.propType;
    if (!rawType && interface) {
      // Check if this property has been defined in the implemented
      // interface.
      const attributes = interface.definition.attributes;
      if (attributes.type === 'interface') {
        const base = getNodeAtPath(
          interface.children, ['prototype', propNode.name]
        );
        if (base) {
          const attributes = base.definition.attributes;
          isConst = attributes.type === 'const';
          rawType = isConst ? attributes.constType : attributes.propType;
        }
      } else if (attributes.type === 'typedef') {
        const base = attributes.props &&
          attributes.props.find((p) => p.name === propNode.name);
        rawType = base && base.type;
      }
    }
    const type = generateType(rawType);
    writer.writeLine(
      `${isConst ? 'readonly ' : ''}${propNode.name}: ${type};`
    );
  }

  // Constructor
  writeFunctionNode(writer, root, node, null, 'constructor', true);

  // Methods
  for (const methodNode of methods) {
    writeFunctionNode(writer, root, methodNode, null);
  }

  writer.decreaseLevel();
  writer.writeLine('}');

  if (others.length > 0) {
    writer.writeLine(`namespace ${node.name} {`);
    writer.increaseLevel();
    writeNodes(writer, root, others);
    writer.decreaseLevel();
    writer.writeLine('}');
  }
}

function writeInterfaceNode(writer, root, node) {
  const properties = [];
  const methods = [];
  const others = [];
  const prototype = node.children.get('prototype');
  const attributes = node.definition.attributes;
  const baseInterface = attributes.extends;

  // Gather all non-prototype members
  for (const child of node.children.values()) {
    if (child.name === 'prototype') {
      continue;
    }
    console.assert(
      child.definition !== null,
      'Unexpected child without definition in interface definition:',
      child
    );
    others.push(child);
  }

  // Gather all prototype members
  for (const child of prototype.children.values()) {
    console.assert(
      child.definition !== null,
      'Unexpected child without definition in interface definition:',
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
          'Found unexpected node type', type, 'in interface definition'
        );
    }
  }

  writeComments(writer, attributes.comments);
  if (baseInterface) {
    writer.writeLine(`interface ${node.name} extends ${baseInterface} {`);
  } else {
    writer.writeLine(`interface ${node.name} {`);
  }
  writer.increaseLevel();

  // Properties
  for (const propNode of properties) {
    const attributes = propNode.definition.attributes;
    const isConst = attributes.type === 'const';
    const rawType = isConst ? attributes.constType : attributes.propType;
    const type = generateType(root, rawType);
    writer.writeLine(
      `${isConst ? 'readonly ' : ''}${propNode.name}: ${type};`
    );
  }

  // Methods
  for (const methodNode of methods) {
    writeFunctionNode(writer, root, methodNode, null);
  }

  writer.decreaseLevel();
  writer.writeLine('}');

  if (others.length > 0) {
    writer.writeLine(`namespace ${node.name} {`);
    writer.increaseLevel();
    writeNodes(writer, root, others);
    writer.decreaseLevel();
    writer.writeLine('}');
  }
}

function writeTypedefNode(writer, root, node) {
  const attributes = node.definition.attributes;
  const typedefType = attributes.typedefType;

  writeComments(writer, attributes.comments);
  if (attributes.props) {
    // Typedef defines an object structure, declare as interface
    writer.writeLine(`interface ${node.name} {`);
    writer.increaseLevel();

    for (const prop of attributes.props) {
      const type = generateType(root, prop.type);
      if (prop.description) {
        writeComments(writer, [prop.description]);
      }
      writer.writeLine(`${prop.name}: ${type};`);
    }

    writer.decreaseLevel();
    writer.writeLine('}');
  } else if (typedefType.type === 'FuncionType' && typedefType.new) {
    // Type definition describes a class factory.
    // In TypeScript, these are declared as interfaces with a
    // 'new' method.

    const returnType = generateType(root, typedefType.this);

    writer.writeLine(`interface ${node.name} {`);
    writer.increaseLevel();

    // TypeScript doesn't allow nameless parameter declarations,
    // so we are just going to follow a p0, p1, ... schema.
    const params = typedefType.params.map((_, i) => 'p' + i);
    const paramTypes = typedefType.params.reduce((acc, type, i) => {
      acc['p' + i] = type;
      return acc;
    }, {});

    const functionNode = {
      name: 'new',
      children: new Map(),
      definition: {
        type: 'function',
        identifier: node.definition.identifier.concat(['new']),
        params: params,
        attributes: {
          type: 'function',
          description: '',
          comments: [],
          paramTypes: paramTypes,
        },
      },
    };

    writeFunctionNode(writer, root, node, null);

    writer.decreaseLevel();
    writer.writeLine('}');
  } else {
    const type = generateType(root, typedefType);
    writer.writeLine(`type ${node.name} = ${type};`);
  }
}

function writeFunctionNode(
  writer,
  root,
  node,
  keyword = 'function',
  name = undefined,
  omitReturn = false
) {
  const attributes = node.definition.attributes;
  const paramTypes = attributes.paramTypes || {};

  writeComments(writer, attributes.comments);

  const params = node.definition.params.map((name) => {
    let type = 'any';
    let isOptional = false;
    if (paramTypes[name]) {
      type = generateType(root, paramTypes[name]);
      isOptional = paramTypes[name].type === 'OptionalType';
    } else {
      console.warn(
        'Missing type information for parameter',
        name,
        'in function',
        node.definition.identifier.join('.')
      );
    }
    return `${name}${isOptional ? '?' : ''}: ${type}`;
  }).join(', ');

  const returnType = attributes.returnType
    ? generateType(root, attributes.returnType)
    : 'void';

  const functionName = name || node.name;

  writer.writeLine(
    (keyword ? keyword + ' ' : '') +
    `${functionName}(${params})` +
    (omitReturn ? ';' : `: ${returnType};`)
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
  writer.increaseLevel();
  for (const prop of definition.props) {
    writer.writeLine(prop + ',');
  }
  writer.decreaseLevel();
  writer.writeLine(`}`);
}

function writeComments(writer, comments) {
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
    if (writer.level === 0) {
      // Mark top-level namespaces as ambient
      writer.writeLine(`declare namespace ${node.name} {`);
    } else {
      writer.writeLine(`namespace ${node.name} {`);
    }
    writer.increaseLevel();
    writeNodes(writer, root, node.children.values());
    writer.decreaseLevel();
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
      writeInterfaceNode(writer, root, node);
      break;
    case 'typedef':
      writeTypedefNode(writer, root, node);
      break;
    case 'enum':
      writeEnumNode(writer, node);
      break;
    case 'const': {
      writeComments(writer, attributes.comments);
      const constType = generateType(root, attributes.constType);
      writer.writeLine(`const ${node.name}: ${constType};`);
      break;
    }
    case 'function':
      writeFunctionNode(writer, root, node);
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
