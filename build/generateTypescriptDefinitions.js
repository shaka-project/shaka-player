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
var primitiveTypes = [
  'null',
  'undefined',
  'boolean',
  'number',
  'string',
];

function parseType(type) {
  var isNullable = undefined,
      i = 0;
  if (type[0] === '?') {
    isNullable = true;
    i++;
  } else if (type[1] === '!') {
    isNullable = false;
    i++;
  }

  var name = '',
      parsingGenerics = false,
      parsingParameters = false,
      genericTypes = null,
      parameterTypes = null,
      isOptional = false,
      returnType,
      tmpTypeName;
  for (; i < type.length; i++) {
    if (parsingGenerics) {
      if (type[i] === ',') {
        // Type name complete, parse and add to list
        genericTypes.push(parseType(tmpTypeName));
        // Reset and aggregate next name
        tmpTypeName = '';
      } else if (type[i] === '>') {
        // Type name complete, parse and add to list
        genericTypes.push(parseType(tmpTypeName));
        // Parsing generics done
        parsingGenerics = false;
      } else if (type[i] !== ' ') {
        // Add to type name
        tmpTypeName += type[i];
      }
      continue;
    }

    if (parsingParameters) {
      if (type[i] === ',') {
        // Type name complete, parse and add to list
        parameterTypes.push(parseType(tmpTypeName));
        // Reset and aggregate next name
        tmpTypeName = '';
      } else if (type[i] === ')') {
        // Type name complete, parse and add to list
        parameterTypes.push(parseType(tmpTypeName));
        // Parsing parameters done
        parsingParameters = false;
      } else if (type[i] !== ' ') {
        // Add to type name
        tmpTypeName += type[i];
      }
      continue;
    }

    if (type[i] === '(') {
      console.assert(
        name === 'function',
        'Found beginning of function parameter declaration,',
        'but type is not a function:',
        type
      );
      console.assert(
        parameterTypes === null,
        'Re-declaration of function parameters found:',
        type
      );
      parameterTypes = [];
      parsingParameters = true;
      tmpTypeName = '';
    } else if (type[i] === '<') {
      console.assert(
        genericTypes === null,
        'Re-declaration of generics found:',
        type
      );
      genericTypes = [];
      parsingGenerics = true;
      tmpTypeName = '';
    } else if (type[i] === '.' && type[i + 1] === '<') {
      parsingGenerics = true;
      tmpTypeName = '';
      i += 1;
    } else if (type[i] === ':') {
      // Parse return type

      break;
    } else if (type[i] === '=') {
      console.assert(
        i === type.length - 1,
        'Found "=" in the middle of type:',
        type
      );
      isOptional = true;
    } else {
      name += type[i];
    }
  }

  console.assert(
    !parsingGenerics,
    'Expected ">" before end of type declaration, got',
    type
  );

  console.assert(
    !parsingParameters,
    'Expected ")" before end of type declaration, got',
    type
  );

  if (isNullable === undefined) {
    isNullable = primitiveTypes.includes(name);
  }

  return {
    typeName: name,
    isNullable: isNullable,
    isOptional: isOptional,
    isGeneric: genericTypes != null,
    genericTypes: genericTypes,
    isFunction: name === 'function',
    parameterTypes: parameterTypes,
  };
}

function parseTypeDeclaration(args) {
  console.assert(
    args.length > 0,
    'Expected args to have minimum length of 1, got',
    args.length
  );
  console.assert(
    args[0][0] === '{',
    'Expected type declaration to start with "{", got',
    args[0]
  );
  if (args[0][args[0].length - 1] === '}') {
    return {
      type: parseType(args[0].slice(1, -2)),
      args: args.slice(1),
    };
  }
  var declaration = [args[0]],
      i;
  for (i = 1; i < args.length; i++) {
    declaration.push(args[i]);
    if (args[i][args[i].length - 1] === '}') {
      return {
        type: parseType(declaration.join(' ')),
        args: args.slice(i + 1),
      };
    }
  }
  console.error(
    'Expected type declaration to end with "}", got',
    args[i - 1]
  );
}

function parseBlockCommentTag(tagLine) {
  console.assert(
    tagLine[0] === '@',
    'Expected tag line to start with @, got',
    tagLine
  );
  var components = tagLine.split(' '),
      tagType = components[0].slice(1),
      args = components.slice(1),
      typeResult;
  switch (tagType) {
    case 'param':
      console.assert(
        args.length >= 2,
        '@param tag requires at least 2 arguments, found',
        args.length
      );
      typeResult = parseTypeDeclaration(args);
      return {
        tagType,
        type: typeResult.type,
        name: typeResult.args[0],
        description: typeResult.args.slice(1).join(' '),
      };
    case 'return':
      console.assert(
        args.length >= 1,
        '@return tag requires at least one argument, found',
        args.length
      );
      typeResult = parseTypeDeclaration(args);
      return {
        tagType,
        type: typeResult.type,
        description: typeResult.args.join(' '),
      };
    case 'extends':
      console.assert(
        args.length === 1,
        '@extends tag requires exactly one argument, found',
        args.length
      );
      return {
        tagType,
        type: args[0],
      };
    case 'implements':
      console.assert(
        args.length === 1,
        '@implements tag requires exactly one argument, found',
        args.length
      );
      return {
        tagType,
        interface: args[0],
      };
    case 'enum':
      console.assert(
        args.length === 1,
        '@enum tag requires exactly one argument, found',
        args.length
      );
      typeResult = parseTypeDeclaration(args);
      return {
        tagType,
        type: typeResult.type,
      };
    case 'throws':
      // Ignore error type
      return { tagType };
    default:
      console.assert(
        args.length === 0,
        'Tag',
        '@' + tagType,
        'with arguments requires special handling'
      );
      return { tagType };
  }
}

function parseBlockComment(comment) {
  console.assert(
    comment.type === 'Block',
    'Expected comment of type Block, got',
    comment.type
  );

  // Split comment into lines, skip the first line and remove the leading
  // asterisk and whitespace
  var lines = comment.value.split('\n').slice(1).map((l) => l.slice(3)),
      tagLines = [],
      description = '',
      line,
      tagLine;

  for (line of lines) {
    if (line[0] === '@') {
      // Block tag
      if (tagLine) {
        // Previous tag is finished, push to tagLines array
        tagLines.push(tagLine);
      }
      tagLine = line;
    } else if (tagLine) {
      // Tag description
      tagLine += line.trim();
    } else {
      // Description
      description += line.trim();
    }
  }

  if (tagLine) {
    // Last tag is finished as well, push to tagLines array
    tagLines.push(tagLine);
  }

  return {
    description: description,
    tags: tagLines.map(parseBlockCommentTag),
  };
}

function parseLeadingComments(statement) {
  var comments = statement.leadingComments;
  console.assert(
    comments.length > 0,
    'Expected at least one leading comment, got',
    comments.length
  );
  // Only parse the comment closest to the statement
  var comment = comments[comments.length - 1];
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
