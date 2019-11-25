import * as doctrine from "@teppeis/doctrine";

export enum AnnotationType {
  Const = "const",
  Enum = "enum",
  Class = "class",
  Interface = "interface",
  Function = "function",
  Property = "property",
  Typedef = "typedef",
  Namespace = "namespace"
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
  export: boolean;

  props?: Props[];
  constType?: doctrine.Type;
  enumType?: doctrine.Type;
  typedefType?: doctrine.Type;
  propType?: doctrine.Type;
  paramTypes?: ParamTypes;
  returnType?: doctrine.Type;

  implements?: doctrine.Type;
  extends?: doctrine.Type;
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

  isMethod?: boolean;
  isStatic?: boolean;
  isConstructor?: boolean;
  definitions?: Definition[];
}

export interface ObjectDefinition extends BaseDefinition {
  type: DefinitionType.Object;
  props: string[];
}

export interface ClassDefinition extends BaseDefinition {
  type: DefinitionType.Class;
  superClass?: string[];
  methods: FunctionDefinition[];
}

export interface PropertyDefinition extends BaseDefinition {
  type: DefinitionType.Property;
}

export type Definition =
  | FunctionDefinition
  | ObjectDefinition
  | ClassDefinition
  | PropertyDefinition;

export interface Node {
  name: string;
  definition?: Definition;
  children: Map<string, Node>;
}

export type NodeMap = Map<string, Node>;

export interface Writer {
  increaseLevel(): void;
  decreaseLevel(): void;
  getIndentation(): string;

  write(str: string): void;
  writeLine(str: string): void;
  writeComments(comments: string[]): void;
  writePrefix(): void;
}

export interface Writable {
  write(writer: Writer): void;
}
