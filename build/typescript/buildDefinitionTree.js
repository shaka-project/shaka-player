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

  for (const node of classNodesWithInterface) {
    const id = node.definition.identifier;
  }

  return root;
}

module.exports = buildDefinitionTree;
