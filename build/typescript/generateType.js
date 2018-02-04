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

function processType(root, rawType, inferNullability) {
  if (!rawType) {
    return {
      isNullabe: false,
      name: 'any',
    };
  }

  switch (rawType.type) {
    case 'NameExpression': {
      if (!inferNullability) {
        return {
          isNullabe: false,
          name: rawType.name,
        };
      }
      let isNullabe = !primitiveTypes.includes(rawType.name);
      if (isNullabe) {
        // Also check if type is an enum to ensure the base type
        // isn't a primitive.
        const node = getNodeAtPath(root, rawType.name.split('.'));
        if (node && node.definition.attributes.type === 'enum') {
          isNullabe = !primitiveTypes.includes(
            node.definition.attributes.enumType
          );
        }
      }
      return {
        isNullabe: isNullabe,
        name: rawType.name,
      };
    }
    case 'NullableType':
      return Object.assign(
        processType(root, rawType.expression, inferNullability),
        { isNullabe: true }
      );
    case 'NonNullableType':
      return Object.assign(
        processType(root, rawType.expression, inferNullability),
        { isNullabe: false }
      );
    case 'OptionalType':
      return Object.assign(
        processType(root, rawType.expression, inferNullability),
        { isOptional: true }
      );
    case 'RestType':
      return {
        name: 'Array',
        isNullabe: false,
        applications: [processType(root, rawType.expression, false)],
      };
    case 'TypeApplication':
      return Object.assign(
        processType(root, rawType.expression, inferNullability),
        {
          applications: rawType.applications.map(
            (t) => processType(root, t, false)
          ),
        }
      );
    case 'UnionType':
      return {
        isUnion: true,
        elements: rawType.elements.map(
          (t) => processType(root, t, inferNullability)
        ),
      };
    case 'FunctionType':
      return {
        isFunction: true,
        params: rawType.params.map((t) => processType(root, t, true)),
        returnType: rawType.result
          ? processType(root, rawType.result, true)
          : { isNullabe: false, name: 'void' },
      };
    case 'RecordType':
      return {
        isRecord: true,
        fields: rawType.fields.map((field) => ({
          key: field.key,
          value: processType(root, field.value, true),
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
    str = `((${params}) => ${returnType})`;
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
    } else if (type.name === 'Array') {
      if (type.applications) {
        console.assert(
          type.applications.length === 1,
          'Expected Array to have at most one type application, got',
          type.applications.length
        );
      } else {
        type.applications = [{ isNullabe: false, name: 'any' }];
      }

      if (type.applications[0].name) {
        str = stringifyType(type.applications[0]) + '[]';
        type.applications = null;
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

  return str;
}

function generateType(root, rawType, inferNullability = true) {
  return stringifyType(processType(root, rawType, inferNullability));
}

module.exports = generateType;
