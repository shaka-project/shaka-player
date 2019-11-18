import assert from "./assert";
import {
  getOrCreateNodeAtPath,
  getNodeAtPath,
  getPropTypeFromInterface,
  getMethodTypesFromInterface,
  NodeMap,
  Node
} from "./treeUtils";
import { processType, TypeInformation } from "./generateType";
import {
  ClassNode,
  EnumNode,
  FunctionNode,
  Param,
  InterfaceNode,
  NamespaceNode,
  PropertyNode,
  TypeNode,
  DefinitionNode
} from "./nodes";
import {
  Definition,
  DefinitionType,
  FunctionDefinition,
  AnnotationType,
  ParamTypes
} from "./base";

function parseClassNode(root: NodeMap, node: Node): ClassNode {
  assert(node.definition);
  const { attributes } = node.definition;
  assert(attributes);

  const staticProperties = [];
  const staticMethods = [];
  const properties = [];
  const methods = [];
  const others = [];
  // Class might not have any properties
  // Prototype defaults to empty in that case
  const prototype: Node = node.children.get("prototype") || {
    name: "prototype",
    children: new Map()
  };

  // Find interfaces for classes with implements keyword
  let interfaceName = attributes.implements;
  const iface = interfaceName && getNodeAtPath(root, interfaceName.split("."));
  if (iface) {
    assert(iface.definition);
    const attributes = iface.definition.attributes;
    assert(attributes);
    if (attributes.template) {
      interfaceName += "<" + attributes.template.join(", ") + ">";
    }
    // Only allow names of interfaces or typedefs for @implements
    assert(
      attributes.type === "interface" || attributes.type === "typedef",
      "Expected name of interface or typedef after implements keyword, got " +
        attributes.type
    );
  }

  // If interface could not be found, still proceed.
  // We assume the interface is a native interface in that case,
  // defined by one of TypeScript's base libs.

  // Gather all static members (static properties)
  for (const child of node.children.values()) {
    if (child.name === "prototype") {
      continue;
    }
    if (!child.definition) {
      console.warn(
        "Unexpected child without definition in class statics: ",
        child
      );
      continue;
    }

    const { attributes } = child.definition;
    assert(attributes);

    const type = attributes.type || child.definition.type;
    switch (type) {
      case "const":
      case "property": {
        const isConst = attributes.type === "const";
        const rawType = isConst ? attributes.constType : attributes.propType;
        const type = processType(root, rawType);
        staticProperties.push(new PropertyNode(child.name, [], type, isConst));
        break;
      }
      case "function": {
        staticMethods.push(parseFunctionNode(root, child));
        break;
      }
      default:
        others.push(parseNode(root, child));
    }
  }

  // Gather all prototype members (instance properties)
  for (const child of prototype.children.values()) {
    assert(
      child.definition,
      "Unexpected child without definition in class prototype: " +
        JSON.stringify(child, undefined, 2)
    );
    const { attributes } = child.definition;
    assert(attributes);

    const type = attributes.type || child.definition.type;
    switch (type) {
      case AnnotationType.Const:
      case "property": {
        let isConst = attributes.type === AnnotationType.Const;
        let rawType = isConst ? attributes.constType : attributes.propType;
        if (!rawType && iface) {
          // Check if this property has been defined in the implemented
          // interface.
          const propType = getPropTypeFromInterface(root, iface, child.name);
          rawType = propType.rawType;
          isConst = propType.isConst;
        }
        const type = processType(root, rawType);
        properties.push(new PropertyNode(child.name, [], type, isConst));
        break;
      }
      case "function": {
        const { attributes } = child.definition;
        assert(attributes);
        if ((!attributes.paramTypes || !attributes.returnType) && iface) {
          const types = getMethodTypesFromInterface(root, iface, child.name);
          attributes.paramTypes = attributes.paramTypes || types.paramTypes;
          attributes.returnType = attributes.returnType || types.returnType;
        }
        methods.push(parseFunctionNode(root, child));
        break;
      }
      default:
        throw new Error(
          `Found unexpected node type ${type} in class prototype`
        );
    }
  }

  // Gather all methods
  let constructor: FunctionNode | undefined;
  if (node.definition.type === DefinitionType.Class) {
    for (const md of node.definition.methods) {
      const { attributes } = md;
      assert(attributes);
      if ((!attributes.paramTypes || !attributes.returnType) && iface) {
        const types = getMethodTypesFromInterface(
          root,
          iface,
          md.identifier[0]
        );
        attributes.paramTypes = attributes.paramTypes || types.paramTypes;
        attributes.returnType = attributes.returnType || types.returnType;
      }
      const functionNode = parseFunctionNode(root, {
        name: md.identifier[0],
        definition: md,
        children: new Map()
      });
      if (md.isConstructor) {
        constructor = functionNode;
      } else if (md.isStatic) {
        staticMethods.push(functionNode);
      } else {
        methods.push(functionNode);
      }
    }
  } else {
    constructor = parseFunctionNode(root, node);
  }

  const comments = attributes.description ? [attributes.description] : [];

  return new ClassNode(
    node.name,
    comments,
    attributes.template,
    attributes.extends,
    interfaceName ? [interfaceName] : undefined,
    staticProperties,
    staticMethods,
    constructor,
    properties,
    methods,
    others.length > 0 ? new NamespaceNode(node.name, others) : undefined
  );
}

function parseInterfaceNode(root: NodeMap, node: Node): InterfaceNode {
  assert(node.definition);
  const { attributes } = node.definition;
  assert(attributes);
  const properties = [];
  const methods = [];
  const others = [];
  // Interface might not have any properteis
  // Prototype defaults to empty in that case
  const prototype: Node = node.children.get("prototype") || {
    name: "prototype",
    children: new Map()
  };

  // Find interfaces for classes with implements keyword
  let baseInterfaceName = attributes.extends;
  const baseInterface =
    baseInterfaceName && getNodeAtPath(root, baseInterfaceName.split("."));
  if (baseInterface) {
    assert(baseInterface.definition);
    const attributes = baseInterface.definition.attributes;
    assert(attributes);
    if (attributes.template) {
      baseInterfaceName += "<" + attributes.template.join(", ") + ">";
    }
    // Only allow names of interfaces or typedefs for @implements
    assert(
      attributes.type === "interface" || attributes.type === "typedef",
      "Expected name of interface or typedef after extends keyword, got " +
        attributes.type
    );
  }
  // If interface could not be found, still proceed.
  // We assume the interface is a native interface in that case,
  // defined by one of TypeScript's base libs.

  // Gather all non-prototype members
  for (const child of node.children.values()) {
    if (child.name === "prototype") {
      continue;
    }
    assert(
      child.definition,
      "Unexpected child without definition in interface statics: " +
        JSON.stringify(child, undefined, 2)
    );
    others.push(parseNode(root, child));
  }

  // Gather all prototype members
  for (const child of prototype.children.values()) {
    assert(
      child.definition,
      "Unexpected child without definition in interface prototype: " +
        JSON.stringify(child, undefined, 2)
    );
    const { attributes } = child.definition;
    assert(attributes);

    const type = attributes.type || child.definition.type;
    switch (type) {
      case "const":
      case "property": {
        let isConst = attributes.type === "const";
        let rawType = isConst ? attributes.constType : attributes.propType;
        if (!rawType && baseInterface) {
          const type = getPropTypeFromInterface(
            root,
            baseInterface,
            child.name
          );
          rawType = type.rawType;
          isConst = type.isConst;
        }
        const type = processType(root, rawType);
        properties.push(new PropertyNode(child.name, [], type, isConst));
        break;
      }
      case "function": {
        if (
          (!attributes.paramTypes || !attributes.returnType) &&
          baseInterface
        ) {
          const types = getMethodTypesFromInterface(
            root,
            baseInterface,
            child.name
          );
          attributes.paramTypes = attributes.paramTypes || types.paramTypes;
          attributes.returnType = attributes.returnType || types.returnType;
        }
        methods.push(parseFunctionNode(root, child));
        break;
      }
      default:
        throw new Error(
          `Found unexpected node type ${type} in interface prototype`
        );
    }
  }

  if (node.definition.type === DefinitionType.Class) {
    // Gather all methods
    for (const md of node.definition.methods) {
      if (md.isConstructor && md.definitions) {
        for (const pd of md.definitions) {
          if (
            pd.type === DefinitionType.Property &&
            pd.identifier[0] === "this"
          ) {
            assert(pd.attributes);
            const name = pd.identifier[1];
            const isConst = pd.attributes.type === "const";
            const rawType = isConst
              ? pd.attributes.constType
              : pd.attributes.propType;
            const type = processType(root, rawType);
            properties.push(new PropertyNode(name, [], type, isConst));
          }
        }
      }
      // TypeScript does not allow constructors in interface definitions
      if (!md.isConstructor) {
        const { attributes } = md;
        assert(attributes);
        if (
          (!attributes.paramTypes || !attributes.returnType) &&
          baseInterface
        ) {
          const types = getMethodTypesFromInterface(
            root,
            baseInterface,
            md.identifier[0]
          );
          attributes.paramTypes = attributes.paramTypes || types.paramTypes;
          attributes.returnType = attributes.returnType || types.returnType;
        }
        const functionNode = parseFunctionNode(root, {
          name: md.identifier[0],
          definition: md,
          children: new Map()
        });
        methods.push(functionNode);
      }
    }
  }

  return new InterfaceNode(
    node.name,
    attributes.comments,
    attributes.template,
    baseInterfaceName ? [baseInterfaceName] : undefined,
    properties,
    methods,
    others.length > 0 ? new NamespaceNode(node.name, others) : undefined
  );
}

function parseTypedefNode(root: NodeMap, node: Node): InterfaceNode | TypeNode {
  assert(node.definition);
  const { attributes } = node.definition;
  assert(attributes);

  if (attributes.props) {
    // Typedef defines an object structure, declare as interface
    const props = attributes.props.map(
      prop =>
        new PropertyNode(
          prop.name,
          prop.description ? [prop.description] : [],
          processType(root, prop.type)
        )
    );

    return new InterfaceNode(
      node.name,
      attributes.comments,
      undefined,
      undefined,
      props,
      [],
      undefined
    );
  }

  const typedefType = attributes.typedefType;
  assert(typedefType);

  if (typedefType.type === "FunctionType" && typedefType.new) {
    // Type definition describes a class factory.
    // In TypeScript, these are declared as interfaces with a
    // 'new' method.

    // TypeScript doesn't allow nameless parameter declarations,
    // so we are just going to follow a p0, p1, ... schema.
    const params = typedefType.params.map((_, i) => "p" + i);
    const paramTypes = typedefType.params.reduce((acc: ParamTypes, type, i) => {
      acc["p" + i] = type;
      return acc;
    }, {});

    const functionNode: Node = {
      name: "new",
      children: new Map(),
      definition: {
        type: "function",
        identifier: node.definition.identifier.concat(["new"]),
        params: params,
        attributes: {
          type: "function",
          description: "",
          comments: [],
          paramTypes: paramTypes,
          returnType: typedefType.this
        }
      } as FunctionDefinition
    };

    const methods = [parseFunctionNode(root, functionNode)];

    return new InterfaceNode(
      node.name,
      attributes.comments,
      undefined,
      undefined,
      [],
      methods,
      undefined
    );
  }

  // Normal type alias, return a type node
  return new TypeNode(
    node.name,
    attributes.comments,
    processType(root, typedefType, false)
  );
}

function parseEnumNode(node: Node) {
  const { definition } = node;
  assert(definition);
  assert(
    definition.type === DefinitionType.Object,
    `Expected enum ${node.name} to be defined with an object, got ${definition.type}`
  );
  assert(definition.attributes);

  return new EnumNode(
    node.name,
    definition.attributes.comments,
    definition.props
  );
}

function parseConstNode(root: NodeMap, node: Node): PropertyNode {
  const { definition } = node;
  assert(definition);
  const { attributes } = definition;
  assert(attributes);
  const constType = processType(root, attributes.constType);

  return new PropertyNode(node.name, attributes.comments, constType, true);
}

function parseFunctionNode(root: NodeMap, node: Node): FunctionNode {
  const { definition } = node;
  assert(definition);
  assert(definition.type === DefinitionType.Function);
  const { attributes } = definition;
  assert(attributes);
  const paramTypes = attributes.paramTypes || {};

  const params: Param[] = definition.params.map(name => {
    let type: TypeInformation = {
      name: "any",
      isNullable: false
    };
    let isOptional = false;
    let isRest = false;
    if (paramTypes[name]) {
      type = processType(root, paramTypes[name]);
      isOptional = paramTypes[name].type === "OptionalType";
      isRest = paramTypes[name].type === "RestType";
    } else {
      console.warn(
        "Missing type information for parameter",
        name,
        "in function",
        definition.identifier.join(".")
      );
    }

    return {
      name,
      type,
      isOptional,
      isRest
    };
  });

  const returnType = attributes.returnType
    ? processType(root, attributes.returnType)
    : undefined;

  return new FunctionNode(
    node.name,
    attributes.comments,
    attributes.template,
    params,
    returnType
  );
}

function parsePropertyNode(
  root: NodeMap,
  node: Node
): InterfaceNode | PropertyNode {
  assert(node.definition);
  assert(node.definition.type === DefinitionType.Property);
  const { attributes, identifier } = node.definition;
  assert(attributes);

  const type = processType(root, attributes.propType);
  const prop = new PropertyNode(node.name, attributes.comments, type, false);

  if (identifier.length === 3 && identifier[1] === "prototype") {
    // "Global" property nodes in prototypes are handled as extensions of existing global interfaces
    // by using TypeScript's declaration merging
    return new InterfaceNode(
      identifier[0],
      ["Global interface extension (generated)"],
      undefined,
      undefined,
      [prop],
      [],
      undefined
    );
  }

  prop.isConst = true;
  return prop;
}

function parseNode(root: NodeMap, node: Node): DefinitionNode {
  const { definition } = node;
  if (!definition) {
    const nodes = [];
    for (const child of node.children.values()) {
      nodes.push(parseNode(root, child));
    }
    return new NamespaceNode(node.name, nodes);
  }

  const { attributes } = definition;
  assert(attributes);

  // If the doc comment didn't lead to a type, fall back to the type we got
  // from the declaration itself.
  // Except if it is a class, because somehow the externs contain classes
  // marked as constants... *flips table*
  // Types: const, enum, class, interface, function, property, object
  const type =
    definition.type === "class" ? "class" : attributes.type || definition.type;
  switch (type) {
    case "class":
      return parseClassNode(root, node);
    case "interface":
      return parseInterfaceNode(root, node);
    case "typedef":
      return parseTypedefNode(root, node);
    case "enum":
      return parseEnumNode(node);
    case "const":
      return parseConstNode(root, node);
    case "function":
      return parseFunctionNode(root, node);
    case "property":
      return parsePropertyNode(root, node);
    default:
      console.dir(node);
      throw new Error("Unexpected definition type " + type);
  }
}

export default function buildDefinitionTree(
  definitions: Definition[]
): DefinitionNode[] {
  const root: NodeMap = new Map();
  // Insert all definitions into the unparsed tree
  for (const definition of definitions) {
    const id = definition.identifier;
    // Uncomment to disallow globals:
    // assert(id.length > 1, "Illegal top-level definition found: " + id);
    const node = getOrCreateNodeAtPath(root, id);
    node.definition = definition;
  }

  const definitionTreeRoot: DefinitionNode[] = [];
  for (const node of root.values()) {
    definitionTreeRoot.push(parseNode(root, node));
  }
  return definitionTreeRoot;
}
