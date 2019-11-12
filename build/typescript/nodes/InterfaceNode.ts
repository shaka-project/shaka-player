export default class InterfaceNode {
  constructor(
    name,
    comments,
    templateTypes,
    extendsInterfaces,
    properties,
    methods,
    namespace
  ) {
    this.name = name;
    this.comments = comments;
    this.templateTypes = templateTypes;
    this.extendsInterfaces = extendsInterfaces;
    this.properties = properties;
    this.methods = methods;
    this.namespace = namespace;
  }

  write(writer) {
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
      methodNode.write(writer, null);
    }

    writer.decreaseLevel();
    writer.writeLine("}");

    if (this.namespace) {
      this.namespace.write(writer);
    }
  }
}
