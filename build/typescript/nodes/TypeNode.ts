import { stringifyType, TypeInformation } from "../generateType";
import { Writer, Writable } from "../base";

export default class TypeNode implements Writable {
  name: string;
  comments: string[];
  type: TypeInformation;

  constructor(name: string, comments: string[], type: TypeInformation) {
    this.name = name;
    this.comments = comments;
    this.type = type;
  }

  write(writer: Writer): void {
    const type = stringifyType(this.type);
    writer.writeLine("type " + this.name + " = " + type + ";");
  }
}
