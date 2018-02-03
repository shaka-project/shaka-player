const esprima = require('esprima');
const doctrine = require('doctrine');

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
          return undefined;
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

function normalizeDescription(description) {
  return description.split('\n').map((line) => line.trim()).join(' ');
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
    description: normalizeDescription(ast.description),
    comments: [],
  };

  for (const tag of ast.tags) {
    switch (tag.title) {
      case 'summary':
        attributes.description = normalizeDescription(tag.description);
        break;
      case 'typedef':
        // TODO: Handle @property
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
          attributes.description = normalizeDescription(tag.description);
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
          const description = normalizeDescription(tag.description);
          attributes.comments.push(`@param ${tag.name} ${description}`);
        }
        break;
      case 'return':
        attributes.type = 'function';
        attributes.returnType = tag.type;
        if (tag.description) {
          const description = normalizeDescription(tag.description);
          attributes.comments.push(`@returnType ${description}`);
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

module.exports = parseExterns;
