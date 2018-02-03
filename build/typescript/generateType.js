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


function generateType(rawType) {
  if (!rawType) {
    return 'any';
  }

  switch (rawType.type) {
    case 'NameExpression':
      return rawType.name;
    default:
      // console.warn('Unhandled type', rawType.type);
      return 'UNHANDLED';
  }
}

module.exports = generateType;
