#!/usr/bin/env node

// Load required modules.
const esprima = require('esprima');
const doctrine = require('doctrine');
const fs = require('fs');
const path = require('path');

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

function staticMemberExpressionToPath(expression) {
  console.assert(
    expression.type === 'MemberExpression',
    'Expected MemberExpression, got',
    expression.type
  );
  const { object, property } = expression;
  const objectPath = object.type === 'MemberExpression'
    ? staticMemberExpressionToPath(object)
    : [object.name];
  objectPath.push(property.name);
  return objectPath;
}

function parseAssignmentExpression(expression) {
  const identifier = staticMemberExpressionToPath(expression.left);
  switch (expression.right.type) {
    case 'FunctionExpression':
      return {
        type: 'function',
        identifier: identifier,
        params: expression.right.params.map((p) => p.name),
      };
    case 'ObjectExpression':
      return {
        type: 'object',
        identifier: identifier,
        props: expression.right.properties.map((p) => {
          if (p.key.type === 'Identifier') {
            return p.key.name;
          }
          if (p.key.type === 'Literal') {
            return p.key.value;
          }
          console.error('Unrecognited key type', p.key.type);
        }),
      };
    default:
      console.log(
        'Unknown expression type',
        expression.right.type,
        'for assignment value'
      );
  }
}

function parseMemberExpression(expression) {
  return {
    type: 'property',
    identifier: staticMemberExpressionToPath(expression),
  };
}

function parseExpressionStatement(statement) {
  switch (statement.expression.type) {
    case 'AssignmentExpression':
      return parseAssignmentExpression(statement.expression);
    case 'MemberExpression':
      return parseMemberExpression(statement.expression);
    default:
      console.error('Unknown expression type', statement.expression.type);
  }
}

/**
 * Tags:
 * - override
 * - struct
 * - namespace
 * see
 * typedef
 * throws
 */

function parseBlockComment(comment) {
  console.assert(
    comment.type === 'Block',
    'Expected comment of type Block, got',
    comment.type
  );

  const ast = doctrine.parse(comment.value, { unwrap: true });

  const attributes = {
    type: null, // null, const, enum, class, interface, function, property
    description: ast.description,
    comments: [],
  };

  for (const tag of ast.tags) {
    switch (tag.title) {
      case 'summary':
        attributes.description = tag.description;
        break;
      case 'typedef':
        attributes.type = 'typedef';
        break;
      case 'const':
        attributes.type = 'const';
        attributes.constType = tag.type;
        break;
      case 'define':
        attributes.type = 'const';
        attributes.constType = tag.type;
        if (tag.description) {
          attributes.description = tag.description;
        }
        break;
      case 'type':
        attributes.type = 'property';
        attributes.propType = tag.type;
        break;
      case 'constructor':
        attributes.type = 'class';
        break;
      case 'enum':
        attributes.type = 'enum';
        attributes.extends = tag.type;
        break;
      case 'interface':
        attributes.type = 'interface';
        break;
      case 'param':
        attributes.paramTypes = attributes.paramTypes || {};
        attributes.paramTypes[tag.name] = tag.type;
        if (tag.description) {
          attributes.comments.push(`@param ${tag.name} ${tag.description}`);
        }
        break;
      case 'return':
        attributes.type = 'function';
        attributes.returnType = tag.type;
        if (tag.description) {
          attributes.comments.push(`@returnType ${tag.description}`);
        }
        break;
      case 'implements':
        attributes.implements = tag.type;
        break;
      case 'extends':
        attributes.extends = tag.type;
        break;
      default:
        break;
    }
  }

  if (attributes.description.length > 0) {
    attributes.comments.unshift(attributes.description);
  }

  return attributes;
}

function parseLeadingComments(statement) {
  const comments = statement.leadingComments;
  console.assert(
    comments.length > 0,
    'Expected at least one leading comment, got',
    comments.length
  );
  // Only parse the comment closest to the statement
  const comment = comments[comments.length - 1];
  return parseBlockComment(comment);
}

function getOrCreateNode(nodes, name) {
  if (nodes.has(name)) {
    return nodes.get(name);
  }
  const node = {
    name: name,
    definition: null,
    children: new Map(),
  };
  nodes.set(name, node);
  return node;
}

function getOrCreateNodeAtPath(root, path) {
  let node = null;
  let nodes = root;
  for (const part of path) {
    node = getOrCreateNode(nodes, part);
    nodes = node.children;
  }
  return node;
}

function buildDefinitionTree(definitions) {
  const root = new Map();

  for (const definition of definitions) {
    const id = definition.identifier;
    console.assert(
      id.length > 1,
      'Illegal top-level definition found:',
      id
    );
    const node = getOrCreateNodeAtPath(root, id);
    node.definition = definition;
  }

  return root;
}

function parseExterns(code) {
  const program = esprima.parse(code, {attachComment: true});
  const definitions = program.body
    // Only take expressions into consideration.
    // Variable declarations are discarded because they are only used for
    // declaring namespaces.
    .filter((statement) => statement.type === 'ExpressionStatement')
    // Prepare for further inspection
    .map((statement) => Object.assign(
      parseExpressionStatement(statement),
      { attributes: parseLeadingComments(statement) }
    ))
    // @const without type is only used to define namespaces, discard.
    .filter((definition) =>
      definition.attributes.type !== 'const' ||
      definition.attributes.constType !== undefined
    );

  return buildDefinitionTree(definitions);
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

function writeClassNode(buffer, root, node) {
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

  buffer.writeLine(`class ${node.name} {`);
  buffer.indent();

  // Static properties
  for (const propNode of staticProperties) {
    const attributes = propNode.definition.attributes;
    const isConst = attributes.type === 'const';
    const rawType = isConst ? attributes.constType : attributes.propType;
    const type = generateType(rawType);
    buffer.writeLine(
      `static${isConst ? ' readonly' : ''} ${propNode.name}: ${type};`
    );
  }

  // Static methods
  for (const methodNode of staticMethods) {
    writeFunctionNode(buffer, methodNode, 'static');
  }

  buffer.outdent();
  buffer.writeLine('}');

  if (others.length > 0) {
    buffer.writeLine(`namespace ${node.name} {`);
    buffer.indent();
    writeNodes(buffer, root, others);
    buffer.outdent();
    buffer.writeLine('}');
  }
}

function writeFunctionNode(buffer, node, keyword = 'function') {
  const attributes = node.definition.attributes;

  writeComments(buffer, attributes.comments);

  const params = node.definition.params.map((name) => {
    const type = attributes.paramTypes[name];
    console.assert(
      type !== undefined,
      'Missing type information for parameter',
      name,
      'in function',
      node.name
    );
    return `${name}: ${generateType(type)}`;
  }).join(', ');

  const returnType = attributes.returnType
    ? generateType(attributes.returnType)
    : 'void';

  buffer.writeLine(
    (keyword ? keyword + ' ' : '') +
    `${node.name}(${params}): ${returnType};`
  );
}

function writeEnumNode(buffer, node) {
  const definition = node.definition;
  console.assert(
    definition.type === 'object',
    'Expected enum',
    node.name,
    'to be defined with an object, got',
    definition.type
  );
  writeComments(buffer, definition.attributes.comments);
  buffer.writeLine(`enum ${node.name} {`);
  buffer.indent();
  for (const prop of definition.props) {
    buffer.writeLine(prop + ',');
  }
  buffer.outdent();
  buffer.writeLine(`}`);
}

function writeComments(buffer, comments) {
  if (comments.length > 0) {
    buffer.writeLine('/**');
    for (const comment of comments) {
      buffer.writeLine(' * ' + comment);
    }
    buffer.writeLine(' */');
  }
}

function writeNode(buffer, root, node) {
  if (node.definition === null) {
    // Write namespace to buffer
    buffer.writeLine(`namespace ${node.name} {`);
    buffer.indent();
    writeNodes(buffer, root, node.children.values());
    buffer.outdent();
    buffer.writeLine('}');
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
      writeClassNode(buffer, root, node);
      break;
    case 'interface':
      writeComments(buffer, attributes.comments);
      buffer.writeLine(`interface ${node.name} {`);
      buffer.writeLine(`}`);
      break;
    case 'enum':
      writeEnumNode(buffer, node);
      break;
    case 'const': {
      writeComments(buffer, attributes.comments);
      const constType = generateType(attributes.constType);
      buffer.writeLine(`const ${node.name}: ${constType};`);
      break;
    }
    case 'function':
      writeFunctionNode(buffer, node);
      break;
    default:
      console.error('Unexpected definition type', type);
  }
}

function writeNodes(buffer, root, nodes) {
  for (const node of nodes) {
    writeNode(buffer, root, node);
  }
}

class OutputBuffer {
  constructor() {
    this.buffer = '';
    this.indentationLevel = 0;
  }

  indent() {
    this.indentationLevel++;
  }

  outdent() {
    this.indentationLevel--;
  }

  writeLine(str) {
    // Repeat two spaces 'level'-times for indentation
    const indentation = '  '.repeat(this.indentationLevel);
    this.buffer += indentation + str + '\n';
  }

  toString() {
    return this.buffer;
  }
}

function generateTypeDefinitions(definitionRoot) {
  const buffer = new OutputBuffer();
  writeNodes(buffer, definitionRoot, definitionRoot.values());
  console.log(buffer.toString());
  return buffer.toString();
}

function processFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf-8');
  const root = parseExterns(code);
  const typeDefinitions = generateTypeDefinitions(root);
}

processFile(
  path.join(__dirname, '..', 'dist', 'shaka-player.compiled.externs.js')
);
