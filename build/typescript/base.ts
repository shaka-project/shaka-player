import * as doctrine from "@teppeis/doctrine";

/**
 * Type of "@" annotation in Closure block comment
 */
export enum AnnotationType {
  Const = "const",
  Enum = "enum",
  Class = "class",
  Interface = "interface",
  Function = "function",
  Property = "property",
  Typedef = "typedef",
  Namespace = "namespace",
  Event = "event"
}

/**
 * A property defined by the @property annotation
 */
export interface Props {
  name: string;
  type: doctrine.Type;
  description?: string;
}

/**
 * Mapping of parameter names to types
 */
export interface ParamTypes {
  [key: string]: doctrine.Type;
}

/**
 * Metadata defined by annotations in closure block comment
 */
export interface Attributes {
  type?: AnnotationType;
  description?: string;
  identifier?: string[];
  comments: string[];
  export: boolean;

  props?: Props[];
  constType?: doctrine.Type;
  enumType?: doctrine.Type;
  typedefType?: doctrine.Type;
  propType?: doctrine.Type;
  paramTypes?: ParamTypes;
  returnType?: doctrine.Type;
  eventType?: string; // Not a real type, but a string identifier

  implements?: doctrine.Type;
  extends?: doctrine.Type;
  template?: string[];
}

/**
 * Type of JS value assigned to the definition.
 * Comment definitions are block comments that are not followed by a
 * JS statement.
 */
export enum DefinitionType {
  Function = "function",
  Object = "object",
  Class = "class",
  Property = "property",
  Comment = "comment"
}

/**
 * Common definition properties
 */
export interface BaseDefinition {
  identifier: string[];
  attributes?: Attributes;
}

/**
 * JavaScript function declarations
 */
export interface FunctionDefinition extends BaseDefinition {
  type: DefinitionType.Function;
  params: string[];

  isMethod?: boolean;
  isStatic?: boolean;
  isConstructor?: boolean;
  definitions?: Definition[];
}

/**
 * JavaScript object literals
 */
export interface ObjectDefinition extends BaseDefinition {
  type: DefinitionType.Object;
  props: string[];
}

/**
 * ES2015 class declarations
 */
export interface ClassDefinition extends BaseDefinition {
  type: DefinitionType.Class;
  superClass?: string[];
  methods: FunctionDefinition[];
}

/**
 * All other values or member expressions without assignment
 */
export interface PropertyDefinition extends BaseDefinition {
  type: DefinitionType.Property;
}

/**
 * Block comments without following JavaScript statement
 */
export interface CommentDefinition extends BaseDefinition {
  type: DefinitionType.Comment;
}

/**
 * Definitions parsed from the incoming Closure code
 */
export type Definition =
  | FunctionDefinition
  | ObjectDefinition
  | ClassDefinition
  | PropertyDefinition
  | CommentDefinition;

/**
 * Type for definition tree nodes
 */
export interface Node {
  name: string;
  definition?: Definition;
  children: Map<string, Node>;
}

/**
 * Base type used for building the definition tree
 */
export type NodeMap = Map<string, Node>;

/**
 * Must be implemented by output targets for writing type definitions
 */
export interface Writer {
  increaseLevel(): void;
  decreaseLevel(): void;
  getIndentation(): string;

  write(str: string): void;
  writeLine(str: string): void;
  writeComments(comments: string[]): void;
  writePrefix(): void;
}

/**
 * Must be implemented by nodes that should be written to the output
 */
export interface Writable {
  write(writer: Writer): void;
}
