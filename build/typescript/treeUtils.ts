import * as doctrine from "@teppeis/doctrine";
import { Definition, ParamTypes } from "./base";

export interface Node {
  name: string;
  definition: Definition | null;
  children: Map<string, Node>;
}

export type NodeMap = Map<string, Node>;

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

export interface PropType {
  rawType: doctrine.Type | null;
  isConst: boolean;
}

export function getPropTypeFromInterface(
  iface: Node,
  propName: string
): PropType {
  const attributes = iface.definition.attributes;
  if (attributes.type === "interface") {
    const base = getNodeAtPath(iface.children, ["prototype", propName]);
    if (base && base.definition) {
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

interface MethodTypes {
  paramTypes: ParamTypes | doctrine.Type[] | null;
  returnType: doctrine.Type | null;
}

export function getMethodTypesFromInterface(
  iface: Node,
  methodName: string
): MethodTypes {
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
    if (base.type.type === doctrine.Syntax.FunctionType) {
      return {
        paramTypes: base.type.params,
        returnType: base.type.result
      };
    }
  }

  return {
    paramTypes: null,
    returnType: null
  };
}
