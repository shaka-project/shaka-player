import { Writable, Writer } from "../base";

export default class NamespaceNode implements Writable {
  name: string;
  nodes: Writable[];

  constructor(name: string, nodes: Writable[]) {
    this.name = name;
    this.nodes = nodes;
  }

  write(writer: Writer): void {
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
