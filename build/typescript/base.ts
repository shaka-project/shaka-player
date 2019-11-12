import * as doctrine from "@teppeis/doctrine";
import * as estree from "estree";

export enum AnnotationType {
  Const = "const",
  Enum = "enum",
  Class = "class",
  Interface = "interface",
  Function = "function",
  Property = "property",
  Typedef = "typedef"
}

export interface Props {
  name: string;
  type: doctrine.Type;
  description: string;
}

export interface ParamTypes {
  [key: string]: doctrine.Type;
}

export interface Attributes {
  type: AnnotationType | null;
  description: string;
  comments: string[];

  props?: Props[];
  constType?: doctrine.Type;
  enumType?: doctrine.Type;
  typedefType?: doctrine.Type;
  propType?: doctrine.Type;
  paramTypes?: ParamTypes;
  returnType?: doctrine.Type;

  implements?: string;
  extends?: string;
  template?: string[];
}

export enum DefinitionType {
  Function = "function",
  Object = "object",
  Class = "class",
  Property = "property"
}

export interface FunctionDefinition {
  type: DefinitionType.Function;
  identifier: string[];
  params: string[];
}

export interface ObjectDefinition {
  type: DefinitionType.Object;
  identifier: string[];
  props: Array<string | number | boolean | RegExp | undefined>;
}

export interface ClassDefinition {
  type: DefinitionType.Class;
  identifier: string[];
  superClass: string[] | null;
  methods: estree.MethodDefinition[];
}

export interface PropertyDefinition {
  type: DefinitionType.Property;
  identifier: string[];
}

export type Definition =
  | FunctionDefinition
  | ObjectDefinition
  | ClassDefinition
  | PropertyDefinition;

export interface Writer {
  increaseLevel(): void;
  decreaseLevel(): void;
  getIndentation(): string;
  write(str: string): void;

  writeLine(str: string): void;

  writeComments(comments: string[]): void;
}

export interface Writable {
  write(writer: Writer): void;
}
