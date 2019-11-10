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
function getPropTypeFromInterface(interface, propName) {
  const attributes = interface.definition.attributes;
  if (attributes.type === 'interface') {
    const base = getNodeAtPath(
        interface.children, ['prototype', propName]
    );
    if (base) {
      const baseAttributes = base.definition.attributes;
      isConst = baseAttributes.type === 'const';
      return {
        rawType: isConst
          ? baseAttributes.constType
          : baseAttributes.propType,
        isConst: isConst,
      };
    }
  } else if (attributes.type === 'typedef' && attributes.props) {
    const base = attributes.props.find((p) => p.name === propName);
    return {
      rawType: base && base.type,
      isConst: false,
    };
  }

  return {
    rawType: null,
    isConst: false,
  };
}

function getMethodTypesFromInterface(interface, methodName) {
  const attributes = interface.definition.attributes;
  if (attributes.type === 'interface') {
    const base = getNodeAtPath(
        interface.children, ['prototype', methodName]
    );
    if (base) {
      const baseAttributes = base.definition.attributes;
      return {
        paramTypes: baseAttributes.paramTypes,
        returnType: baseAttributes.returnType,
      };
    }
  } else if (attributes.type === 'typedef' && attributes.props) {
    const base = attributes.props.find((p) => p.name === methodName);
    if (base.type === 'FunctionType') {
      return {
        paramTypes: base.params,
        returnType: base.result,
      };
    }
  }

  return {
    paramTypes: null,
    returnType: null,
  };
}

module.exports = {
  getOrCreateNode,
  getOrCreateNodeAtPath,
  getNodeAtPath,
  getPropTypeFromInterface,
  getMethodTypesFromInterface,
};
