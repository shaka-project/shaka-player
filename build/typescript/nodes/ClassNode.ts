import { Writable, Writer } from "../base";
import PropertyNode from "./PropertyNode";
import FunctionNode from "./FunctionNode";
import NamespaceNode from "./NamespaceNode";

export default class ClassNode implements Writable {
  name: string;
  comments: string[];
  templateTypes?: string[];
  extendsClass?: string;
  implementsInterfaces?: string[];
  staticProperties: PropertyNode[];
  staticMethods: FunctionNode[];
  constructorMethod: FunctionNode;
  properties: PropertyNode[];
  methods: FunctionNode[];
  namespace?: NamespaceNode;

  constructor(
    name: string,
    comments: string[],
    templateTypes: string[] | undefined,
    extendsClass: string | undefined,
    implementsInterfaces: string[] | undefined,
    staticProperties: PropertyNode[],
    staticMethods: FunctionNode[],
    constructor: FunctionNode,
    properties: PropertyNode[],
    methods: FunctionNode[],
    namespace: NamespaceNode | undefined
  ) {
    this.name = name;
    this.comments = comments;
    this.templateTypes = templateTypes;
    this.extendsClass = extendsClass;
    this.implementsInterfaces = implementsInterfaces;
    this.staticProperties = staticProperties;
    this.staticMethods = staticMethods;
    this.constructorMethod = constructor;
    this.properties = properties;
    this.methods = methods;
    this.namespace = namespace;
  }

  write(writer: Writer): void {
    let declaration = this.name;
    if (this.templateTypes) {
      declaration += "<" + this.templateTypes.join(", ") + ">";
    }
    if (this.extendsClass) {
      declaration += " extends " + this.extendsClass;
    }
    if (this.implementsInterfaces) {
      declaration += " implements " + this.implementsInterfaces.join(", ");
    }

    writer.writeComments(this.comments);
    writer.writeLine("class " + declaration + " {");
    writer.increaseLevel();

    // Static properties
    for (const propNode of this.staticProperties) {
      propNode.write(writer, "readonly", "static");
    }

    // Static methods
    for (const methodNode of this.staticMethods) {
      methodNode.write(writer, "static");
    }

    // Constructor
    this.constructorMethod.write(writer, undefined, true);

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
