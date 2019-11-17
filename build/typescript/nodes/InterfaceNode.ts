import { Writable, Writer } from "../base";
import PropertyNode from "./PropertyNode";
import FunctionNode from "./FunctionNode";
import NamespaceNode from "./NamespaceNode";

export default class InterfaceNode implements Writable {
  name: string;
  comments: string[];
  templateTypes?: string[];
  extendsInterfaces?: string[];
  properties: PropertyNode[];
  methods: FunctionNode[];
  namespace?: NamespaceNode;

  constructor(
    name: string,
    comments: string[],
    templateTypes: string[] | undefined,
    extendsInterfaces: string[] | undefined,
    properties: PropertyNode[],
    methods: FunctionNode[],
    namespace: NamespaceNode | undefined
  ) {
    this.name = name;
    this.comments = comments;
    this.templateTypes = templateTypes;
    this.extendsInterfaces = extendsInterfaces;
    this.properties = properties;
    this.methods = methods;
    this.namespace = namespace;
  }

  write(writer: Writer): void {
    let declaration = this.name;
    if (this.templateTypes) {
      declaration += "<" + this.templateTypes.join(", ") + ">";
    }
    if (this.extendsInterfaces) {
      declaration += " extends " + this.extendsInterfaces.join(", ");
    }

    writer.writeComments(this.comments);
    writer.writeLine("interface " + declaration + " {");
    writer.increaseLevel();

    // Properties
    for (const propNode of this.properties) {
      propNode.write(writer, "readonly");
    }

    // Methods
    for (const methodNode of this.methods) {
      methodNode.write(writer, undefined);
    }

    writer.decreaseLevel();
    writer.writeLine("}");

    if (this.namespace) {
      this.namespace.write(writer);
    }
  }
}
