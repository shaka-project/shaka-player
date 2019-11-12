import { stringifyType } from "../generateType";

export default class TypeNode {
  constructor(name, comments, type) {
    this.name = name;
    this.comments = comments;
    this.type = type;
  }

  write(writer) {
    const type = stringifyType(this.type);
    writer.writeLine("type " + this.name + " = " + type + ";");
  }
}
