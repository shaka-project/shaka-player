import * as util from "util";
import assert from "./assert";
import {
  getOrCreateNodeAtPath,
  getNodeAtPath,
  getPropTypeFromInterface,
  getMethodTypesFromInterface
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
  NodeMap,
  Node
} from "./base";

function parseClassNode(root: NodeMap, node: Node): ClassNode {
  assert(node.definition);
  const { attributes } = node.definition;
  assert(attributes);

  const staticProperties: PropertyNode[] = [];
  const staticMethods: FunctionNode[] = [];
  const properties: PropertyNode[] = [];
  const methods: FunctionNode[] = [];
  const others: DefinitionNode[] = [];
  // Class might not have any properties
  // Prototype defaults to empty in that case
  const prototype: Node = node.children.get("prototype") || {
    name: "prototype",
    children: new Map()
  };

  // Find interfaces for classes with implements keyword
  const interfaceType =
    attributes.implements && processType(root, attributes.implements);
  const interfaceNode =
    interfaceType?.name && getNodeAtPath(root, interfaceType.name.split("."));
  if (interfaceNode) {
    assert(interfaceNode.definition);
    const { attributes } = interfaceNode.definition;
    assert(attributes);
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
      // Treat static members without definitions as namespaces
      const nestedNodes: DefinitionNode[] = [];
      for (const nestedChild of child.children.values()) {
        nestedNodes.push(parseNode(root, nestedChild));
      }
      others.push(new NamespaceNode(child.name, nestedNodes));
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
      case "event": {
        assert(attributes.eventType);
        const params = [
          {
            name: "type",
            isOptional: false,
            isRest: false,
            type: {
              isNullable: false,
              name: attributes.eventType
            }
          },
          {
            name: "listener",
            isOptional: false,
            isRest: false,
            type: {
              isNullable: false,
              isFunction: true,
              params: [
                {
                  isNullable: false,
                  name: child.definition.identifier.join(".")
                }
              ],
              returnType: {
                isNullable: false,
                name: "void"
              }
            }
          }
        ];
        methods.push(
          new FunctionNode(
            "addEventListener",
            ["Defined by generator"],
            undefined,
            params,
            undefined
          ),
          new FunctionNode(
            "removeEventListener",
            ["Defined by generator"],
            undefined,
            params,
            undefined
          )
        );
        others.push(parseNode(root, child));
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
        util.inspect(child)
    );
    const { attributes } = child.definition;
    assert(attributes);

    const type = attributes.type || child.definition.type;
    switch (type) {
      case AnnotationType.Const:
      case "property": {
        let isConst = attributes.type === AnnotationType.Const;
        let rawType = isConst ? attributes.constType : attributes.propType;
        if (!rawType && interfaceNode) {
          // Check if this property has been defined in the implemented
          // interface.
          const propType = getPropTypeFromInterface(
            root,
            interfaceNode,
            child.name
          );
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
        if (
          (!attributes.paramTypes || !attributes.returnType) &&
          interfaceNode
        ) {
          const types = getMethodTypesFromInterface(
            root,
            interfaceNode,
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
      if ((!attributes.paramTypes || !attributes.returnType) && interfaceNode) {
        const types = getMethodTypesFromInterface(
          root,
          interfaceNode,
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
        if (md.definitions) {
          for (const pd of md.definitions) {
            if (
              pd.type === DefinitionType.Property &&
              pd.identifier[0] === "this"
            ) {
              assert(pd.attributes);
              const name = pd.identifier[1];
              let isConst = pd.attributes.type === AnnotationType.Const;
              let rawType = isConst
                ? pd.attributes.constType
                : pd.attributes.propType;
              if (!rawType && interfaceNode) {
                // Check if this property has been defined in the implemented
                // interface.
                const propType = getPropTypeFromInterface(
                  root,
                  interfaceNode,
                  name
                );
                rawType = propType.rawType;
                isConst = propType.isConst;
              }
              const type = processType(root, rawType);
              properties.push(new PropertyNode(name, [], type, isConst));
            }
          }
        }
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

  let superClass: TypeInformation | undefined = undefined;
  if (attributes.extends) {
    superClass = processType(root, attributes.extends);
  } else if (
    node.definition.type === DefinitionType.Class &&
    node.definition.superClass
  ) {
    superClass = {
      isNullable: false,
      name: node.definition.superClass.join(".")
    };
  }

  return new ClassNode(
    node.name,
    comments,
    attributes.template,
    superClass,
    interfaceType ? [interfaceType] : undefined,
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
  const properties: PropertyNode[] = [];
  const methods: FunctionNode[] = [];
  const others: DefinitionNode[] = [];
  // Interface might not have any properteis
  // Prototype defaults to empty in that case
  const prototype: Node = node.children.get("prototype") || {
    name: "prototype",
    children: new Map()
  };

  // Find interfaces for classes with implements keyword
  const baseInterfaceType =
    attributes.extends && processType(root, attributes.extends);
  const baseInterface =
    baseInterfaceType?.name &&
    getNodeAtPath(root, baseInterfaceType.name.split("."));
  if (baseInterface) {
    assert(baseInterface.definition);
    const { attributes } = baseInterface.definition;
    assert(attributes);
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
        util.inspect(child)
    );
    others.push(parseNode(root, child));
  }

  // Gather all prototype members
  for (const child of prototype.children.values()) {
    assert(
      child.definition,
      "Unexpected child without definition in interface prototype: " +
        util.inspect(child)
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
    baseInterfaceType ? [baseInterfaceType] : undefined,
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
      attributes.type === AnnotationType.Event
        ? [{ isNullable: false, name: "Event" }]
        : undefined,
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
    const paramTypes = typedefType.params;

    const functionNode: Node = {
      name: "new",
      children: new Map(),
      definition: {
        type: "function",
        identifier: node.definition.identifier.concat(["new"]),
        params,
        attributes: {
          type: "function",
          description: "",
          comments: [],
          paramTypes,
          returnType: typedefType.this,
          export: true
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

function parseConstNode(root: NodeMap, node: Node): PropertyNode | ClassNode {
  const { definition } = node;
  assert(definition);
  if (definition.type === DefinitionType.Class) {
    return parseClassNode(root, node);
  }

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
  const paramTypes = attributes.paramTypes || [];

  const params: Param[] = definition.params.map((name, i) => {
    let type: TypeInformation = {
      name: "unknown",
      isNullable: false
    };
    let isOptional = false;
    let isRest = false;
    const paramType = paramTypes[i];
    if (paramType) {
      type = processType(root, paramType);
      isOptional = paramType.type === "OptionalType";
      isRest = paramType.type === "RestType";
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
  // Types: const, enum, class, interface, function, property, object
  const type = attributes.type || definition.type;
  switch (type) {
    case "class":
      return parseClassNode(root, node);
    case "interface":
      return parseInterfaceNode(root, node);
    case "event":
    case "typedef":
      return parseTypedefNode(root, node);
    case "enum":
      return parseEnumNode(node);
    case "namespace":
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
    const prototypeIndex = id.indexOf("prototype");
    if (prototypeIndex >= 0) {
      const identifier = id.slice(0, prototypeIndex);
      const node = getOrCreateNodeAtPath(root, identifier);
      // If this is an extension of an existing interface not defined in these externs,
      // we have to generate an according node first
      if (!node.definition) {
        node.definition = {
          identifier,
          type: DefinitionType.Function,
          params: [],
          attributes: {
            type: AnnotationType.Interface,
            comments: [],
            export: true
          }
        } as FunctionDefinition;
      }
    }
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
