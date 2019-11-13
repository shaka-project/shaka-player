import { stringifyType } from "../generateType";

export default class PropertyNode {
  constructor(name, comments, type, isConst: boolean = false) {
    this.name = name;
    this.comments = comments;
    this.type = type;
    this.isConst = isConst;
  }

  write(writer, constKeyword = "const", keyword = null) {
    const type = stringifyType(this.type);
    let declaration = this.name + ": " + type + ";";
    if (this.isConst) {
      declaration = constKeyword + " " + declaration;
    }
    if (keyword) {
      declaration = keyword + " " + declaration;
    }

    writer.writeComments(this.comments);
    writer.writeLine(declaration);
  }
}
