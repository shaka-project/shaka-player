import * as doctrine from "@teppeis/doctrine";
import assert from "./assert";
import { getNodeAtPath, NodeMap } from "./treeUtils";

// Primitive types are not nullable in Closure unless marked as such.
// Keep a list of primitives to properly set the nullable flag.
// Aside of that, type names are the same in Closure and TypeScript so a
// mapping of type names is not necessary.
// Enum nullability works the same with regards to the enum's base type.
const primitiveTypes = ["null", "undefined", "boolean", "number", "string"];

function checkNullability(root: NodeMap, rawType: doctrine.Type): boolean {
  if (primitiveTypes.includes(rawType.name)) {
    return false;
  }

  const node = getNodeAtPath(root, rawType.name.split("."));
  if (!node) {
    return true;
  }

  const attributes = node.definition.attributes;
  switch (attributes.type) {
    case "enum":
      return !primitiveTypes.includes(attributes.enumType);
    case "typedef":
      return processType(root, attributes.typedefType, true).isNullable;
    default:
      return true;
  }
}

export interface TypeInformation {
  isNullable: boolean;
  name?: string;
  isUnion?: boolean;
  isFunction?: boolean;
  isRecord?: boolean;
  applications?: TypeInformation[];
  elements?: TypeInformation[];
  params?: TypeInformation[];
  returnType?: TypeInformation;
  fields?: Array<{
    key: string;
    value: TypeInformation;
  }>;
}

export function processType(
  root: NodeMap,
  rawType: doctrine.Type | null,
  inferNullability?: boolean
): TypeInformation {
  if (!rawType) {
    return {
      isNullable: false,
      name: "any"
    };
  }

  switch (rawType.type) {
    case "NameExpression": {
      return {
        isNullable: inferNullability ? checkNullability(root, rawType) : false,
        name: rawType.name
      };
    }
    case "NullableType":
      return Object.assign(processType(root, rawType.expression, false), {
        isNullabe: true
      });
    case "NonNullableType":
      return Object.assign(processType(root, rawType.expression, false), {
        isNullabe: false
      });
    case "OptionalType":
      return Object.assign(
        processType(root, rawType.expression, inferNullability),
        { isOptional: true }
      );
    case "RestType":
      return {
        name: "Array",
        isNullable: false,
        applications: [processType(root, rawType.expression, false)]
      };
    case "TypeApplication":
      return Object.assign(
        processType(root, rawType.expression, inferNullability),
        {
          applications: rawType.applications.map(t =>
            processType(root, t, false)
          )
        }
      );
    case "UnionType": {
      const elements = rawType.elements.map(t => processType(root, t, true));
      let isNullable = false;
      for (const element of elements) {
        if (element.isNullable) {
          isNullable = true;
          element.isNullable = false;
        }
      }
      return {
        isUnion: true,
        isNullable: inferNullability ? isNullable : false,
        elements: elements
      };
    }
    case "FunctionType":
      return {
        isFunction: true,
        isNullable: false,
        params: rawType.params.map(t => processType(root, t, true)),
        returnType: rawType.result
          ? processType(root, rawType.result, true)
          : { isNullable: false, name: "void" }
      };
    case "RecordType":
      return {
        isRecord: true,
        isNullable: false,
        fields: rawType.fields.map(field => ({
          key: field.key,
          value: processType(root, field.value, true)
        }))
      };
    case "UndefinedLiteral":
      return {
        isNullable: false,
        name: "undefined"
      };
    case "AllLiteral":
      return {
        isNullable: false,
        name: "any"
      };
    default:
      throw new Error(`Unhandled raw type: ${rawType}`);
  }
}

export function stringifyType(type: TypeInformation): string {
  let str = "";
  if (type.isFunction) {
    const params = type.params
      .map((paramType, i) => `p${i}: ${stringifyType(paramType)}`)
      .join(", ");
    const returnType = stringifyType(type.returnType);
    str = `((${params}) => ${returnType})`;
  } else if (type.isRecord) {
    const fields = type.fields
      .map(field => `${field.key}: ${stringifyType(field.value)}`)
      .join(", ");
    str = "{" + fields + "}";
  } else if (type.isUnion) {
    str = type.elements.map(stringifyType).join(" | ");
  } else {
    str = type.name;

    if (type.name === "Object") {
      if (type.applications) {
        assert(
          type.applications.length === 2,
          "Expected Object to have either 0 or 2 type applications"
        );
        const key = stringifyType(type.applications[0]);
        const value = stringifyType(type.applications[1]);
        str = `{ [key: ${key}]: ${value} }`;
        type.applications = null;
      } else {
        str = "object";
      }
    } else if (type.name === "Promise") {
      if (type.applications) {
        assert(
          type.applications.length === 1,
          "Expected Promise to have at most one type application"
        );
      } else {
        type.applications = [{ isNullable: false, name: "void" }];
      }
    } else if (type.name === "Array") {
      if (type.applications) {
        assert(
          type.applications.length === 1,
          "Expected Array to have at most one type application"
        );
      } else {
        type.applications = [{ isNullable: false, name: "any" }];
      }

      if (type.applications[0].name) {
        str = stringifyType(type.applications[0]) + "[]";
        type.applications = null;
      }
    }
  }

  if (type.applications) {
    const applications = type.applications.map(stringifyType).join(", ");
    str += "<" + applications + ">";
  }
  if (type.isNullable) {
    str += " | null";
  }

  return str;
}

export default function generateType(
  root: NodeMap,
  rawType: doctrine.Type | null,
  inferNullability: boolean = true
) {
  return stringifyType(processType(root, rawType, inferNullability));
}
