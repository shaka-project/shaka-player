export default class NamespaceNode {
  constructor(name, nodes) {
    this.name = name;
    this.nodes = nodes;
  }

  write(writer) {
    let declaration = "namespace " + this.name + " {";
    if (writer.level === 0) {
      // Mark top-level namespaces as ambient
      declaration = "declare " + declaration;
    }

    writer.writeLine(declaration);
    writer.increaseLevel();

    for (const node of this.nodes) {
      node.write(writer);
    }

    writer.decreaseLevel();
    writer.writeLine("}");
  }
}
