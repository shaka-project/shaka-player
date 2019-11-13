import ClassNode from "./ClassNode";
import EnumNode from "./EnumNode";
import FunctionNode from "./FunctionNode";
import InterfaceNode from "./InterfaceNode";
import NamespaceNode from "./NamespaceNode";
import PropertyNode from "./PropertyNode";
import TypeNode from "./TypeNode";

export type DefinitionNode =
  | ClassNode
  | EnumNode
  | FunctionNode
  | InterfaceNode
  | NamespaceNode
  | PropertyNode
  | TypeNode;

export {
  ClassNode,
  EnumNode,
  FunctionNode,
  InterfaceNode,
  NamespaceNode,
  PropertyNode,
  TypeNode
};
