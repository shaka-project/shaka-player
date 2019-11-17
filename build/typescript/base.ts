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
  description?: string;
}

export interface ParamTypes {
  [key: string]: doctrine.Type;
}

export interface Attributes {
  type?: AnnotationType;
  description?: string;
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

export interface BaseDefinition {
  identifier: string[];
  attributes?: Attributes;
}

export interface FunctionDefinition extends BaseDefinition {
  type: DefinitionType.Function;
  params: string[];
}

export interface ObjectDefinition extends BaseDefinition {
  type: DefinitionType.Object;
  props: string[];
}

export interface ClassDefinition extends BaseDefinition {
  type: DefinitionType.Class;
  superClass?: string[];
  methods: estree.MethodDefinition[];
}

export interface PropertyDefinition extends BaseDefinition {
  type: DefinitionType.Property;
}

export type Definition =
  | FunctionDefinition
  | ObjectDefinition
  | ClassDefinition
  | PropertyDefinition;

export interface Writer {
  readonly level: number;

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
