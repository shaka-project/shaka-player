const { getNodeAtPath } = require('./treeUtils');

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

function processType(root, rawType) {
  if (!rawType) {
    return {
      isNullabe: false,
      name: 'any',
    };
  }

  switch (rawType.type) {
    case 'NameExpression': {
      let isNullabe = primitiveTypes.includes(rawType.name);
      if (isNullabe) {
        // Also check if type is an enum to ensure to base type
        // isn't a primitive.
        const node = getNodeAtPath(root, rawType.name.split('.'));
        isNullabe = node != null &&
          node.definition.attributes.type === 'enum' &&
          primitiveTypes.includes(node.definition.attributes.enumType);
      }
      return {
        isNullabe: isNullabe,
        name: rawType.name,
      };
    }
    case 'NullableType':
      return Object.assign(
        processType(root, rawType.expression),
        { isNullabe: true }
      );
    case 'NonNullableType':
      return Object.assign(
        processType(root, rawType.expression),
        { isNullabe: false }
      );
    case 'OptionalType':
      return Object.assign(
        processType(root, rawType.expression),
        { isOptional: true }
      );
    case 'RestType':
      return Object.assign(
        processType(root, rawType.expression),
        { isRest: true }
      );
    case 'TypeApplication':
      return Object.assign(
        processType(root, rawType.expression),
        {
          applications: rawType.applications.map(processType.bind(null, root)),
        }
      );
    case 'UnionType':
      return {
        isUnion: true,
        elements: rawType.elements.map(processType.bind(null, root)),
      };
    case 'FunctionType':
      return {
        isFunction: true,
        params: rawType.params.map(processType.bind(null, root)),
        returnType: rawType.result
          ? processType(root, rawType.result)
          : { isNullabe: false, name: 'void' },
      };
    case 'RecordType':
      return {
        isRecord: true,
        fields: rawType.fields.map((field) => ({
          key: field.key,
          value: processType(root, field.value),
        })),
      };
    case 'UndefinedLiteral':
      return {
        isNullabe: false,
        name: 'undefined',
      };
    case 'AllLiteral':
      return {
        isNullabe: false,
        name: 'any',
      };
    default:
      throw new Error(`Unhandled raw type: ${rawType}`);
  }
}

function stringifyType(type) {
  let str;
  if (type.isFunction) {
    const params = type.params.map((paramType, i) => (
      `p${i}: ${stringifyType(paramType)}`
    )).join(', ');
    const returnType = stringifyType(type.returnType);
    str = `(${params}) => ${returnType}`;
  } else if (type.isRecord) {
    const fields = type.fields.map((field) => (
      `${field.key}: ${stringifyType(field.value)}`
    )).join(', ');
    str = '{' + fields + '}';
  } else if (type.isUnion) {
    str = type.elements.map(stringifyType).join(' | ');
  } else {
    str = type.name;

    if (type.name === 'Object') {
      if (type.applications) {
        console.assert(
          type.applications.length === 2,
          'Expected Object to have either 0 or 2 type applications, got',
          type.applications.length
        );
        const key = stringifyType(type.applications[0]);
        const value = stringifyType(type.applications[1]);
        str = `{ [key: ${key}]: ${value} }`;
        type.applications = null;
      } else {
        str = 'object';
      }
    } else if (type.name === 'Promise') {
      if (type.applications) {
        console.assert(
          type.applications.length === 1,
          'Expected Promise to have at most one type application, got',
          type.applications.length
        );
      } else {
        type.applications = [{ isNullabe: false, name: 'void' }];
      }
    }
  }

  if (type.applications) {
    const applications = type.applications.map(stringifyType).join(', ');
    str += '<' + applications + '>';
  }

  if (type.isNullabe) {
    str += ' | null';
  }
  if (type.isRest) {
    str = '...' + str;
  }

  return str;
}

function generateType(root, rawType) {
  return stringifyType(processType(root, rawType));
}

module.exports = generateType;
