import { stringifyType } from "../generateType";

export default class FunctionNode {
  constructor(name, comments, templateTypes, params, returnType) {
    this.name = name;
    this.comments = comments;
    this.params = params;
    this.returnType = returnType;
  }

  write(writer, keyword = "function", isConstructor = false) {
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

    writer.writeLine(declaration);
  }
}
