import * as doctrine from "@teppeis/doctrine";
import {
  Definition,
  DefinitionType,
  PropertyDefinition,
  NodeMap,
  Node
} from "./base";
import assert from "./assert";
import { processType } from "./generateType";
import { predefinedInterfaces } from "./predefined";

export function getOrCreateNode(nodes: NodeMap, name: string): Node {
  if (nodes.has(name)) {
    return nodes.get(name)!;
  }
  const node = {
    name: name,
    children: new Map()
  };
  nodes.set(name, node);
  return node;
}

export function getOrCreateNodeAtPath(root: NodeMap, path: string[]): Node {
  assert(path.length > 0);
  let node = null;
  let nodes = root;
  for (const part of path) {
    node = getOrCreateNode(nodes, part);
    nodes = node.children;
  }
  return node!;
}

export function getNodeAtPath(
  root: NodeMap,
  path: string[],
  considerPredefinedNodes: boolean = true
): Node | null {
  if (
    considerPredefinedNodes &&
    path.length === 1 &&
    predefinedInterfaces.has(path[0])
  ) {
    return predefinedInterfaces.get(path[0])!;
  }

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
  rawType?: doctrine.Type;
  isConst: boolean;
}

export function getPropTypeFromInterface(
  root: NodeMap,
  interfaceNode: Node,
  propName: string
): PropType {
  assert(interfaceNode.definition);
  if (interfaceNode.definition.type === DefinitionType.Class) {
    const md = interfaceNode.definition.methods.find(md => md.isConstructor);
    if (md && md.definitions) {
      const pd = md.definitions.find(
        (pd: Definition): pd is PropertyDefinition =>
          pd.type === DefinitionType.Property &&
          pd.identifier[0] === "this" &&
          pd.identifier[1] === propName
      );
      if (pd) {
        assert(pd.attributes);
        const isConst = pd.attributes.type === "const";
        return {
          rawType: isConst ? pd.attributes.constType : pd.attributes.propType,
          isConst
        };
      }
    }
  }

  const { attributes } = interfaceNode.definition;
  assert(attributes);
  if (attributes.type === "interface") {
    const base = getNodeAtPath(
      interfaceNode.children,
      ["prototype", propName],
      false
    );
    if (base) {
      assert(base.definition);
      const baseAttributes = base.definition.attributes;
      assert(baseAttributes);
      const isConst = baseAttributes.type === "const";
      return {
        rawType: isConst ? baseAttributes.constType : baseAttributes.propType,
        isConst: isConst
      };
    }
  } else if (attributes.type === "typedef" && attributes.props) {
    const base = attributes.props.find(p => p.name === propName);
    assert(base);
    return {
      rawType: base.type,
      isConst: false
    };
  }

  if (attributes.extends) {
    const extendsType = processType(root, attributes.extends);
    const base =
      extendsType.name && getNodeAtPath(root, extendsType.name.split("."));
    if (base) {
      return getPropTypeFromInterface(root, base, propName);
    }
  }

  console.log(
    "Property could not be inferred from interface:",
    interfaceNode.definition.identifier,
    propName
  );

  return { isConst: false };
}

interface MethodTypes {
  paramTypes?: doctrine.Type[];
  returnType?: doctrine.Type;
}

export function getMethodTypesFromInterface(
  root: NodeMap,
  interfaceNode: Node,
  methodName: string
): MethodTypes {
  let types: MethodTypes = {};

  assert(interfaceNode.definition);
  if (interfaceNode.definition.type === DefinitionType.Class) {
    const md = interfaceNode.definition.methods.find(
      md => md.identifier[0] === methodName
    );
    if (md) {
      assert(md.attributes);
      types = {
        paramTypes: md.attributes.paramTypes,
        returnType: md.attributes.returnType
      };
    }
  }

  const { attributes } = interfaceNode.definition;
  assert(attributes);
  if (attributes.type === "interface") {
    const base = getNodeAtPath(
      interfaceNode.children,
      ["prototype", methodName],
      false
    );
    if (base) {
      assert(base.definition);
      const baseAttributes = base.definition.attributes;
      assert(baseAttributes);
      types = {
        paramTypes: baseAttributes.paramTypes,
        returnType: baseAttributes.returnType
      };
    }
  } else if (attributes.type === "typedef" && attributes.props) {
    const base = attributes.props.find(p => p.name === methodName);
    assert(base);
    if (base.type.type === doctrine.Syntax.FunctionType) {
      types = {
        paramTypes: base.type.params,
        returnType: base.type.result || undefined
      };
    }
  }

  if ((!types.paramTypes || !types.returnType) && attributes.extends) {
    const extendsType = processType(root, attributes.extends);
    const base =
      extendsType.name && getNodeAtPath(root, extendsType.name.split("."));
    if (base) {
      const baseTypes = getMethodTypesFromInterface(root, base, methodName);
      types.paramTypes = types.paramTypes || baseTypes.paramTypes;
      types.returnType = types.returnType || baseTypes.returnType;
    }
  }

  // console.log(
  //   "Method could not be inferred from interface:",
  //   interfaceNode.definition.identifier,
  //   methodName
  // );

  return types;
}
