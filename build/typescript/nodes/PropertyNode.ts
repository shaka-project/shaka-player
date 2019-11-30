import { stringifyType, TypeInformation } from "../generateType";
import { Writable, Writer } from "../base";

export default class PropertyNode implements Writable {
  name: string;
  comments: string[];
  type: TypeInformation;
  isConst: boolean;
  isOptional: boolean;

  constructor(
    name: string,
    comments: string[],
    type: TypeInformation,
    isConst: boolean = false,
    isOptional: boolean = false
  ) {
    this.name = name;
    this.comments = comments;
    this.type = type;
    this.isConst = isConst;
    this.isOptional = isOptional;
  }

  write(
    writer: Writer,
    constKeyword: string = "const",
    keyword: string | null = null
  ): void {
    const type = stringifyType(this.type);
    let declaration = this.name;
    if (this.isOptional) {
      declaration += "?";
    }
    declaration += ": " + type + ";";
    if (this.isConst) {
      declaration = constKeyword + " " + declaration;
    }
    if (keyword) {
      declaration = keyword + " " + declaration;
    }

    writer.writeComments(this.comments);
    writer.writePrefix();
    writer.writeLine(declaration);
  }
}
