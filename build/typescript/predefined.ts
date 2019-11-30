import * as doctrine from "@teppeis/doctrine";
import assert from "./assert";
import {
  TypeNode,
  DefinitionNode,
  NamespaceNode,
  ClassNode,
  FunctionNode,
  LiteralNode,
  InterfaceNode,
  PropertyNode
} from "./nodes";
import {
  ClassDefinition,
  AnnotationType,
  DefinitionType,
  Node,
  ParamTypes,
  NodeMap
} from "./base";
import { getNodeAtPath } from "./treeUtils";

const ds = doctrine.Syntax;

/**
 * Predefined definitions required to make the generated ones work
 */

const comments = ["Defined by generator"];

const RecursivePartial = new LiteralNode(
  "type RecursivePartial<T> = { [P in keyof T]?: RecursivePartial<T[P]> };",
  comments
);

const MediaKeySystemMediacapability = new TypeNode(
  "MediaKeySystemMediacapability",
  comments,
  { name: "MediaKeySystemMediaCapability", isNullable: false }
);

export const predefinedDefinitions = [
  RecursivePartial,
  MediaKeySystemMediacapability
];

/**
 * Predefined interfaces for type inference
 */

interface Parameter {
  name: string;
  type: doctrine.Type;
}

interface Method {
  name: string;
  params: Parameter[];
  returnType: doctrine.Type;
}

function makeInterface(name: string, methods: Method[]): Node {
  return {
    name,
    children: new Map(),
    definition: {
      type: DefinitionType.Class,
      identifier: [name],
      attributes: {
        type: AnnotationType.Interface,
        comments: [],
        export: true
      },
      methods: methods.map(m => ({
        type: DefinitionType.Function,
        identifier: [m.name],
        params: m.params.map(p => p.name),
        attributes: {
          type: AnnotationType.Function,
          comments: [],
          export: true,
          paramTypes: m.params.reduce((acc: ParamTypes, p: Parameter) => {
            acc[p.name] = p.type;
            return acc;
          }, {}),
          returnType: m.returnType
        }
      }))
    } as ClassDefinition
  };
}

const EventTarget = makeInterface("EventTarget", [
  {
    name: "addEventListener",
    params: [
      {
        name: "type",
        type: {
          type: ds.NameExpression,
          name: "string"
        } as doctrine.type.NameExpression
      },
      {
        name: "listener",
        type: {
          type: ds.NullableType,
          expression: {
            type: ds.NameExpression,
            name: "EventListenerOrEventListenerObject"
          } as doctrine.type.NameExpression
        } as doctrine.type.NullableType
      },
      {
        name: "options",
        type: {
          type: ds.OptionalType,
          expression: {
            type: ds.UnionType,
            elements: [
              {
                type: ds.NameExpression,
                name: "boolean"
              } as doctrine.type.NameExpression,
              {
                type: ds.NameExpression,
                name: "AddEventListenerOptions"
              } as doctrine.type.NameExpression
            ]
          } as doctrine.type.UnionType
        } as doctrine.type.OptionalType
      }
    ],
    returnType: {
      type: ds.NameExpression,
      name: "void"
    } as doctrine.type.NameExpression
  },
  {
    name: "dispatchEvent",
    params: [
      {
        name: "event",
        type: {
          type: ds.NameExpression,
          name: "Event"
        } as doctrine.type.NameExpression
      }
    ],
    returnType: {
      type: ds.NameExpression,
      name: "boolean"
    } as doctrine.type.NameExpression
  },
  {
    name: "removeEventListener",
    params: [
      {
        name: "type",
        type: {
          type: ds.NameExpression,
          name: "string"
        } as doctrine.type.NameExpression
      },
      {
        name: "callback",
        type: {
          type: ds.NullableType,
          expression: {
            type: ds.NameExpression,
            name: "EventListenerOrEventListenerObject"
          } as doctrine.type.NameExpression
        } as doctrine.type.NullableType
      },
      {
        name: "options",
        type: {
          type: ds.OptionalType,
          expression: {
            type: ds.UnionType,
            elements: [
              {
                type: ds.NameExpression,
                name: "EventListenerOptions"
              } as doctrine.type.NameExpression,
              {
                type: ds.NameExpression,
                name: "boolean"
              } as doctrine.type.NameExpression
            ]
          } as doctrine.type.UnionType
        } as doctrine.type.OptionalType
      }
    ],
    returnType: {
      type: ds.NameExpression,
      name: "void"
    } as doctrine.type.NameExpression
  }
]);

export const predefinedInterfaces: NodeMap = new Map([
  ["EventTarget", EventTarget]
]);

/**
 * Predefined patches for definitions
 */

export function patchDefinitions(definitions: DefinitionNode[]) {
  /**
   * Namespaces
   */

  const shaka = definitions.find(
    (n): n is NamespaceNode => n instanceof NamespaceNode && n.name === "shaka"
  );
  const net = shaka?.nodes.find(
    (n): n is NamespaceNode => n instanceof NamespaceNode && n.name === "net"
  );
  const util = shaka?.nodes.find(
    (n): n is NamespaceNode => n instanceof NamespaceNode && n.name === "util"
  );
  const ui = shaka?.nodes.find(
    (n): n is NamespaceNode => n instanceof NamespaceNode && n.name === "ui"
  );

  /**
   * Classes
   */

  const Player = shaka?.nodes.find(
    (n): n is ClassNode => n instanceof ClassNode && n.name === "Player"
  );
  const configureMethod = Player?.methods.find(n => n.name === "configure");
  if (configureMethod) {
    const configureObjectMethod = new FunctionNode(
      configureMethod.name,
      configureMethod.comments,
      configureMethod.templateTypes,
      [
        {
          name: "config",
          isOptional: false,
          isRest: false,
          type: {
            isNullable: false,
            name: "RecursivePartial",
            applications: [
              {
                isNullable: false,
                name: "shaka.extern.PlayerConfiguration"
              }
            ]
          }
        }
      ],
      configureMethod.returnType
    );
    Player?.methods.splice(
      Player.methods.indexOf(configureMethod),
      0,
      configureObjectMethod
    );

    configureMethod.params = [
      {
        name: "config",
        isOptional: false,
        isRest: false,
        type: {
          isNullable: false,
          name: "string"
        }
      },
      {
        name: "value",
        isOptional: false,
        isRest: false,
        type: {
          isNullable: false,
          name: "any"
        }
      }
    ];
  }

  const NetworkingEngine = net?.nodes.find(
    (n): n is ClassNode =>
      n instanceof ClassNode && n.name === "NetworkingEngine"
  );
  const requestMethod = NetworkingEngine?.methods.find(
    n => n.name === "request"
  );
  const requestParam = requestMethod?.params.find(p => p.name === "request");
  if (requestParam) {
    requestParam.type = {
      isNullable: false,
      name: "Partial",
      applications: [requestParam.type]
    };
  }

  const Error = util?.nodes.find(
    (n): n is ClassNode => n instanceof ClassNode && n.name === "Error"
  );
  if (Error) {
    Error.extendsClass = undefined;
    Error.properties.push(
      new PropertyNode("name", comments, { isNullable: false, name: "string" }),
      new PropertyNode("message", comments, {
        isNullable: false,
        name: "string"
      }),
      new PropertyNode(
        "stack",
        comments,
        { isNullable: false, name: "string" },
        false,
        true
      )
    );
  }

  const Overlay = ui?.nodes.find(
    (n): n is ClassNode => n instanceof ClassNode && n.name === "Overlay"
  );
  const configureUIMethod = Overlay?.methods.find(n => n.name === "configure");
  if (configureUIMethod) {
    const configureUIObjectMethod = new FunctionNode(
      configureUIMethod.name,
      configureUIMethod.comments,
      configureUIMethod.templateTypes,
      [
        {
          name: "config",
          isOptional: false,
          isRest: false,
          type: {
            isNullable: false,
            name: "RecursivePartial",
            applications: [
              {
                isNullable: false,
                name: "shaka.extern.UIConfiguration"
              }
            ]
          }
        }
      ],
      configureUIMethod.returnType
    );
    Overlay?.methods.splice(
      Overlay.methods.indexOf(configureUIMethod),
      0,
      configureUIObjectMethod
    );

    configureUIMethod.params = [
      {
        name: "config",
        isOptional: false,
        isRest: false,
        type: {
          isNullable: false,
          name: "string"
        }
      },
      {
        name: "value",
        isOptional: false,
        isRest: false,
        type: {
          isNullable: false,
          name: "any"
        }
      }
    ];
  }

  /**
   * Predefined definitions
   */

  if (ui) {
    ui.nodes.push(
      new InterfaceNode(
        "VideoElement",
        comments,
        undefined,
        [{ isNullable: false, name: "HTMLVideoElement" }],
        [
          new PropertyNode("ui", [], {
            isNullable: false,
            name: "shaka.ui.Overlay"
          })
        ],
        [],
        undefined
      )
    );
  }

  definitions.push(...predefinedDefinitions);
}
