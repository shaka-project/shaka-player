import { Writable, Writer } from "../base";

export default class ClassNode implements Writable {
  name: string;
  comments: string[];
  templateTypes: any;
  extendsClass: any;
  implementsInterfaces: any;
  staticProperties: any;
  staticMethods: any;
  constructorMethod: any;
  properties: any;
  methods: any;
  namespace: any;

  constructor(
    name: string,
    comments: string[],
    templateTypes,
    extendsClass,
    implementsInterfaces,
    staticProperties,
    staticMethods,
    constructor,
    properties,
    methods,
    namespace
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
    this.constructorMethod.write(writer, null, true);

    // Properties
    for (const propNode of this.properties) {
      propNode.write(writer, "readonly");
    }

    // Methods
    for (const methodNode of this.methods) {
      methodNode.write(writer, null);
    }

    writer.decreaseLevel();
    writer.writeLine("}");

    if (this.namespace) {
      this.namespace.write(writer);
    }
  }
}
