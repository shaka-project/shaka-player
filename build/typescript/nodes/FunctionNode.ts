import { stringifyType, TypeInformation } from "../generateType";
import { Writable, Writer } from "../base";

export interface Param {
  name: string;
  type: TypeInformation;
  isOptional: boolean;
  isRest: boolean;
}

export default class FunctionNode implements Writable {
  name: string;
  comments: string[];
  params: Param[];
  returnType?: TypeInformation;
  templateTypes?: string[];

  constructor(
    name: string,
    comments: string[],
    templateTypes: string[] | undefined,
    params: Param[],
    returnType: TypeInformation | undefined
  ) {
    this.name = name;
    this.comments = comments;
    this.templateTypes = templateTypes;
    this.params = params;
    this.returnType = returnType;
  }

  write(
    writer: Writer,
    keyword: string = "function",
    isConstructor: boolean = false
  ): void {
    writer.writeComments(this.comments);

    const params = this.params.map(param => {
      let declaration = param.name;
      if (param.isRest) {
        declaration = "..." + declaration;
      }
      if (param.isOptional) {
        declaration += "?";
      }
      declaration += ": " + stringifyType(param.type);
      return declaration;
    });

    const returnType = this.returnType
      ? stringifyType(this.returnType)
      : "void";

    let declaration = isConstructor ? "constructor" : this.name;
    if (keyword) {
      declaration = keyword + " " + declaration;
    }
    if (this.templateTypes) {
      declaration += "<" + this.templateTypes.join(", ") + ">";
    }
    declaration += "(" + params.join(", ") + ")";
    if (!isConstructor) {
      declaration += ": " + returnType;
    }
    declaration += ";";

    writer.writePrefix();
    writer.writeLine(declaration);
  }
}
