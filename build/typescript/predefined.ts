import { TypeNode } from "./nodes";
import {
  ClassDefinition,
  AnnotationType,
  DefinitionType,
  Node,
  FunctionDefinition,
  ParamTypes,
  NodeMap
} from "./base";
import * as doctrine from "@teppeis/doctrine";

const ds = doctrine.Syntax;

/**
 * Predefined definitions required to make the generated ones work
 */

const MediaKeySystemMediacapability = new TypeNode(
  "MediaKeySystemMediacapability",
  ["Predefined by generator"],
  { name: "MediaKeySystemMediaCapability", isNullable: false }
);

export const predefinedDefinitions = [MediaKeySystemMediacapability];

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
        comments: []
      },
      methods: methods.map(m => ({
        type: DefinitionType.Function,
        identifier: [m.name],
        params: m.params.map(p => p.name),
        attributes: {
          type: AnnotationType.Function,
          comments: [],
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
