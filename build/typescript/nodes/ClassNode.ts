import { Writable, Writer } from "../base";
import PropertyNode from "./PropertyNode";
import FunctionNode from "./FunctionNode";
import NamespaceNode from "./NamespaceNode";
import { TypeInformation, stringifyType } from "../generateType";

export default class ClassNode implements Writable {
  name: string;
  comments: string[];
  templateTypes?: string[];
  extendsClass?: TypeInformation;
  implementsInterfaces?: TypeInformation[];
  staticProperties: PropertyNode[];
  staticMethods: FunctionNode[];
  constructorMethod?: FunctionNode;
  properties: PropertyNode[];
  methods: FunctionNode[];
  namespace?: NamespaceNode;

  constructor(
    name: string,
    comments: string[],
    templateTypes: string[] | undefined,
    extendsClass: TypeInformation | undefined,
    implementsInterfaces: TypeInformation[] | undefined,
    staticProperties: PropertyNode[],
    staticMethods: FunctionNode[],
    constructor: FunctionNode | undefined,
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
      declaration += " extends " + stringifyType(this.extendsClass);
    }
    if (this.implementsInterfaces) {
      declaration +=
        " implements " +
        this.implementsInterfaces.map(i => stringifyType(i)).join(", ");
    }

    writer.writeComments(this.comments);
    writer.writePrefix();
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

    // Properties
    for (const propNode of this.properties) {
      propNode.write(writer, "readonly");
    }

    // Constructor
    if (this.constructorMethod) {
      this.constructorMethod.write(writer, "", true);
    }

    // Methods
    for (const methodNode of this.methods) {
      methodNode.write(writer, "");
    }

    writer.decreaseLevel();
    writer.writeLine("}");

    if (this.namespace) {
      this.namespace.write(writer);
    }
  }
}
