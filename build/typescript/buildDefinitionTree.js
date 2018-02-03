const {
  getOrCreateNode,
  getOrCreateNodeAtPath,
  getNodeAtPath,
} = require('./treeUtils');

function buildDefinitionTree(definitions) {
  const root = new Map();

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
  }

  return root;
}

module.exports = buildDefinitionTree;
