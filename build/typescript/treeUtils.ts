interface Node {
  name: string;
  definition: null;
  children: Map<string, Node>;
}

type NodeMap = Map<string, Node>;

export function getOrCreateNode(nodes: NodeMap, name: string): Node {
  if (nodes.has(name)) {
    return nodes.get(name);
  }
  const node = {
    name: name,
    definition: null,
    children: new Map()
  };
  nodes.set(name, node);
  return node;
}

export function getOrCreateNodeAtPath(root: NodeMap, path: string[]): Node {
  let node = null;
  let nodes = root;
  for (const part of path) {
    node = getOrCreateNode(nodes, part);
    nodes = node.children;
  }
  return node;
}

export function getNodeAtPath(root: NodeMap, path: string[]): Node {
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

export function getPropTypeFromInterface(iface, propName: string) {
  const attributes = iface.definition.attributes;
  if (attributes.type === "interface") {
    const base = getNodeAtPath(iface.children, ["prototype", propName]);
    if (base) {
      const baseAttributes = base.definition.attributes;
      const isConst = baseAttributes.type === "const";
      return {
        rawType: isConst ? baseAttributes.constType : baseAttributes.propType,
        isConst: isConst
      };
    }
  } else if (attributes.type === "typedef" && attributes.props) {
    const base = attributes.props.find(p => p.name === propName);
    return {
      rawType: base && base.type,
      isConst: false
    };
  }

  return {
    rawType: null,
    isConst: false
  };
}

export function getMethodTypesFromInterface(iface, methodName: string) {
  const attributes = iface.definition.attributes;
  if (attributes.type === "interface") {
    const base = getNodeAtPath(iface.children, ["prototype", methodName]);
    if (base) {
      const baseAttributes = base.definition.attributes;
      return {
        paramTypes: baseAttributes.paramTypes,
        returnType: baseAttributes.returnType
      };
    }
  } else if (attributes.type === "typedef" && attributes.props) {
    const base = attributes.props.find(p => p.name === methodName);
    if (base.type === "FunctionType") {
      return {
        paramTypes: base.params,
        returnType: base.result
      };
    }
  }

  return {
    paramTypes: null,
    returnType: null
  };
}
