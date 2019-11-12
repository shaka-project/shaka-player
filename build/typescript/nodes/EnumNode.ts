export default class EnumNode {
  constructor(name, comments, values) {
    this.name = name;
    this.comments = comments;
    this.values = values;
  }

  write(writer) {
    writer.writeComments(this.comments);
    writer.writeLine("enum " + this.name + " {");
    writer.increaseLevel();

    for (const value of this.values) {
      writer.writeLine(value + ",");
    }

    writer.decreaseLevel();
    writer.writeLine("}");
  }
}
