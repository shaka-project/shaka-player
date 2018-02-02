#!/usr/bin/env node

// Load required modules.
const esprima = require('esprima');
const doctrine = require('doctrine');
const fs = require('fs');
const { join } = require('path');

function staticMemberExpressionToPath(expression) {
  console.assert(
    expression.type === 'MemberExpression',
    'Expected MemberExpression, got',
    expression.type
  );
  var { object, property } = expression;
  var objectPath = object.type === 'MemberExpression'
    ? staticMemberExpressionToPath(object)
    : [object.name];
  objectPath.push(property.name);
  return objectPath;
}

function buildDefinitionTree(definitions) {

}

function parseAssignmentExpression(expression) {
  var value;
  switch (expression.right.type) {
    case 'FunctionExpression':
      value = {
        type: 'function',
        params: expression.right.params,
      };
      break;
    case 'ObjectExpression':
      value = {
        type: 'object',
        properties: expression.right.properties.map((p) => p.key.name),
      };
      break;
    default:
      console.log(
        'Unknown expression type',
        expression.right.type,
        'for assignment value'
      );
  }

  return {
    type: 'assignment',
    identifier: staticMemberExpressionToPath(expression.left),
    value: value,
  };
}

function parseMemberExpression(expression) {
  return {
    type: 'definition',
    identifier: staticMemberExpressionToPath(expression),
  };
}

function parseExpressionStatement(statement) {
  var { expression } = statement,
      parsedExpression;
  switch (expression.type) {
    case 'AssignmentExpression':
      parsedExpression = parseAssignmentExpression(expression);
      break;
    case 'MemberExpression':
      parsedExpression = parseMemberExpression(expression);
      break;
    default:
      console.log('Unknown expression type', expression.type);
  }

  return parsedExpression;
}

function parseVariableDeclaration(statement) {
  // console.log(statement);
  return {};
}


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

/**
 * Tags:
 * override
 * + interface
 * + return
 * - struct
 * + param
 * + constructor
 * + implements
 * namespace
 * + summary
 * see
 * define
 * + extends
 * typedef
 * throws
 * + enum
 * const
 */

function parseBlockComment(comment) {
  console.assert(
    comment.type === 'Block',
    'Expected comment of type Block, got',
    comment.type
  );

  const ast = doctrine.parse(comment.value, { unwrap: true });

  const attributes = {
    type: null, // const, enum, class, interface, function, property
    description: ast.description,
    comments: [],
  };

  for (const tag of ast.tags) {
    switch (tag.title) {
      case 'summary':
        attributes.description = tag.description;
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
        attributes.propertyType = tag.type;
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
      case 'throws':
        console.log(tag.toString());
        break;
      default:
        break;
    }
  }

  if (attributes.description.length > 0) {
    attributes.comments.unshift(attributes.description);
  }

  // console.log(attributes);
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

function parseExterns(program) {
  var statements = [],
      statement;
  for (statement of program.body) {
    var c = parseLeadingComments(statement);
    switch (statement.type) {
      case 'VariableDeclaration':
        statements.push(parseVariableDeclaration(statement));
        break;
      case 'ExpressionStatement':
        statements.push(parseExpressionStatement(statement));
        break;
      default:
        console.log('Unknown statement type', statement.type);
    }
  }
}

function parseExternsFile(filePath) {
  var code = fs.readFileSync(filePath, 'utf-8');
  var program = esprima.parse(code, {attachComment: true});
  parseExterns(program);
}

parseExternsFile(join(__dirname, '..', 'dist', 'shaka-player.compiled.externs.js'));
