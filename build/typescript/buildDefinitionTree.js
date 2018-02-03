const {
  getOrCreateNode,
  getOrCreateNodeAtPath,
  getNodeAtPath,
} = require('./treeUtils');

function buildDefinitionTree(definitions) {
  const root = new Map();
  const classNodesWithInterface = [];

  // Insert all definitions into definition tree
  for (const definition of definitions) {
    const id = definition.identifier;
    console.assert(
      id.length > 1,
      'Illegal top-level definition found:',
      id
    );
    const node = getOrCreateNodeAtPath(root, id);
    node.definition = definition;

    const isClass = definition.attributes.type === 'class';
    const implementsInterface = definition.attributes.implements != null;
    if (isClass && implementsInterface) {
      classNodesWithInterface.push(node);
    }
  }

  // Find interfaces for classes with implements keyword
  for (const node of classNodesWithInterface) {
    const id = node.definition.identifier;
    const interfaceName = node.definition.attributes.implements;
    node.interface = getNodeAtPath(root, interfaceName.split('.'));
    if (node.interface != null) {
      const attributes = node.interface.definition.attributes;
      // Only allow names of interfaces or typedefs after @implements
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
  }

  return root;
}

module.exports = buildDefinitionTree;
