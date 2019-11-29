import { Writable, Writer } from "../base";

export default class LiteralNode implements Writable {
  text: string;
  comments: string[];

  constructor(text: string, comments: string[]) {
    this.text = text;
    this.comments = comments;
  }

  write(writer: Writer): void {
    writer.writeComments(this.comments);
    writer.writePrefix();
    writer.writeLine(this.text);
  }
}
