import { Writable, Writer } from "../base";

export default class EnumNode implements Writable {
  name: string;
  comments: string[];
  values: string[];

  constructor(name: string, comments: string[], values: string[]) {
    this.name = name;
    this.comments = comments;
    this.values = values;
  }

  write(writer: Writer): void {
    writer.writeComments(this.comments);
    writer.writePrefix();
    writer.writeLine("enum " + this.name + " {");
    writer.increaseLevel();

    for (const value of this.values) {
      writer.writeLine(value + ",");
    }

    writer.decreaseLevel();
    writer.writeLine("}");
  }
}
