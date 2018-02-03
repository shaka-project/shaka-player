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

function getNodeAtPath(root, path) {
  let nodes = root;
  let node = null;
  for (const part of path) {
    node = nodes.get(part);
    if (!node) {
      return null;
    }
    nodes = node.children;
  }
  return node;
}


