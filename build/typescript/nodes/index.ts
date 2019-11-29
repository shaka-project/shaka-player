import ClassNode from "./ClassNode";
import EnumNode from "./EnumNode";
import FunctionNode, { Param } from "./FunctionNode";
import InterfaceNode from "./InterfaceNode";
import LiteralNode from "./LiteralNode";
import NamespaceNode from "./NamespaceNode";
import PropertyNode from "./PropertyNode";
import TypeNode from "./TypeNode";

export type DefinitionNode =
  | ClassNode
  | EnumNode
  | FunctionNode
  | InterfaceNode
  | LiteralNode
  | NamespaceNode
  | PropertyNode
  | TypeNode;

export {
  ClassNode,
  EnumNode,
  FunctionNode,
  Param,
  InterfaceNode,
  LiteralNode,
  NamespaceNode,
  PropertyNode,
  TypeNode
};
