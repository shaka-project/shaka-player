const esprima = require('esprima');
const doctrine = require('doctrine');

function staticMemberExpressionToPath(expression) {
  console.assert(
      expression.type === 'MemberExpression',
      'Expected MemberExpression, got',
      expression.type
  );
  const {object, property} = expression;
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
          throw new Error('Unrecognited key type ' + p.key.type);
        }),
      };
    default:
      console.log(
          'Unknown expression type',
          expression.right.type,
          'for assignment value'
      );
      return undefined;
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
      throw new Error('Unknown expression type ' + statement.expression.type);
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

  const ast = doctrine.parse(comment.value, {unwrap: true});

  // Possible types:
  // null, const, enum, class, interface, function, property, typedef
  const attributes = {
    type: null,
    description: normalizeDescription(ast.description),
    comments: [],
  };

  for (const tag of ast.tags) {
    switch (tag.title) {
      case 'summary':
        attributes.description = normalizeDescription(tag.description);
        break;
      case 'description':
        attributes.description = normalizeDescription(tag.description);
        break;
      case 'typedef':
        attributes.type = 'typedef';
        attributes.typedefType = tag.type;
        break;
      case 'property':
        attributes.props = attributes.props || [];
        attributes.props.push({
          name: tag.name,
          type: tag.type,
          description: tag.description && normalizeDescription(tag.description),
        });
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
        attributes.enumType = tag.type;
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
        console.assert(
            tag.type.type === 'NameExpression',
            'Expected name expression after implements keyword, got',
            tag.type
        );
        attributes.implements = tag.type.name;
        break;
      case 'extends':
        console.assert(
            tag.type.type === 'NameExpression',
            'Expected name expression after extends keyword, got',
            tag.type
        );
        attributes.extends = tag.type.name;
        break;
      case 'template':
        attributes.template = tag.description.split(',');
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
  if (!comments) {
    return {
      type: null,
      comments: [],
      description: '',
    };
  }
  console.assert(
      comments,
      'Expected at least one leading comment, found none'
  );
  // Only parse the comment closest to the statement
  const comment = comments[comments.length - 1];
  return parseBlockComment(comment);
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
          {attributes: parseLeadingComments(statement)}
      ))
  // @const without type is only used to define namespaces, discard.
      .filter((definition) =>
        definition.attributes.type !== 'const' ||
      definition.attributes.constType !== undefined
      );

  return definitions;
}

module.exports = parseExterns;
